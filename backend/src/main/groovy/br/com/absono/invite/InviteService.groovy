package br.com.absono.invite

import br.com.absono.common.BusinessException
import br.com.absono.common.Ulid
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

import java.security.SecureRandom
import java.time.LocalDateTime

@Service
class InviteService {

    private final InviteMapper inviteMapper
    private static final SecureRandom RANDOM = new SecureRandom()
    private static final String CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"

    InviteService(InviteMapper inviteMapper) {
        this.inviteMapper = inviteMapper
    }

    @Transactional
    Invite createInvite(String createdBy, int maxUses, int durationMinutes) {
        if (maxUses < 1 || maxUses > 100) {
            throw new BusinessException('Quantidade de usos deve ser entre 1 e 100')
        }
        if (durationMinutes < 1 || durationMinutes > 1440) {
            throw new BusinessException('Duração deve ser entre 1 e 1440 minutos (24h)')
        }

        String id = Ulid.generate()
        String code = generateCode()
        LocalDateTime expiresAt = LocalDateTime.now().plusMinutes(durationMinutes)

        inviteMapper.insert(id, code, createdBy, maxUses, expiresAt.toString())

        inviteMapper.findByCode(code)
    }

    Invite validateInvite(String code) {
        def invite = inviteMapper.findByCode(code)
        if (!invite) {
            throw new BusinessException('Convite invalido')
        }
        if (invite.expiresAt.isBefore(LocalDateTime.now())) {
            throw new BusinessException('Este convite expirou')
        }
        if (invite.useCount >= invite.maxUses) {
            throw new BusinessException('Este convite ja atingiu o limite de uso')
        }
        invite
    }

    @Transactional
    void consumeInvite(String code) {
        inviteMapper.incrementUseCount(code)
    }

    List<Invite> listByUser(String userId) {
        inviteMapper.findByCreatedBy(userId)
    }

    /**
     * Valida e consome o convite em uma única operação atômica. O incremento é
     * condicional (use_count < max_uses AND expires_at > NOW()) para evitar a
     * corrida TOCTOU entre validar e consumir em registros concorrentes.
     */
    @Transactional
    void validateAndConsumeInvite(String code) {
        def invite = inviteMapper.findByCode(code)
        if (!invite) {
            throw new BusinessException('Convite invalido')
        }
        if (invite.expiresAt.isBefore(LocalDateTime.now())) {
            throw new BusinessException('Este convite expirou')
        }
        int updated = inviteMapper.incrementUseCountConditional(code)
        if (updated != 1) {
            throw new BusinessException('Este convite já atingiu o limite de uso')
        }
    }

    @Transactional
    void deleteInvite(String id, String requesterId, boolean isAdmin) {
        def invite = inviteMapper.findById(id)
        if (!invite) {
            throw new BusinessException('Convite não encontrado')
        }
        if (!isAdmin && invite.createdBy != requesterId) {
            throw new BusinessException('Você não tem permissão para excluir este convite')
        }
        inviteMapper.deleteById(id)
    }

    private static String generateCode() {
        StringBuilder sb = new StringBuilder(12)
        for (int i = 0; i < 12; i++) {
            sb.append(CODE_CHARS.charAt(RANDOM.nextInt(CODE_CHARS.length())))
        }
        sb.toString()
    }
}
