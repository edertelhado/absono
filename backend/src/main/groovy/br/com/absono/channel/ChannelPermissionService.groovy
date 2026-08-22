package br.com.absono.channel

import br.com.absono.common.BusinessException
import br.com.absono.common.ResourceNotFoundException
import br.com.absono.common.Ulid
import br.com.absono.user.UserMapper
import br.com.absono.user.UserRole
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class ChannelPermissionService {

    private final ChannelPermissionMapper permissionMapper
    private final UserMapper userMapper
    private final ChannelMapper channelMapper
    private final DmService dmService

    ChannelPermissionService(ChannelPermissionMapper permissionMapper, UserMapper userMapper,
                             ChannelMapper channelMapper, DmService dmService) {
        this.permissionMapper = permissionMapper
        this.userMapper = userMapper
        this.channelMapper = channelMapper
        this.dmService = dmService
    }

    List<ChannelPermission> getPermissions(String channelId) {
        permissionMapper.findByChannelId(channelId)
    }

    @Transactional
    ChannelPermission setPermission(String channelId, String targetUserId, boolean canRead, boolean canWrite, boolean canManage) {
        def user = userMapper.findById(targetUserId)
        if (!user) {
            throw new ResourceNotFoundException('Usuário não encontrado: ' + targetUserId)
        }

        def existing = permissionMapper.findByChannelAndUser(channelId, targetUserId)

        if (existing) {
            existing.canRead = canRead
            existing.canWrite = canWrite
            existing.canManage = canManage
            permissionMapper.update(existing)
            return permissionMapper.findByChannelAndUser(channelId, targetUserId)
        }

        ChannelPermission permission = new ChannelPermission(
            id: Ulid.generate(),
            channelId: channelId,
            userId: targetUserId,
            canRead: canRead,
            canWrite: canWrite,
            canManage: canManage
        )
        permissionMapper.insert(permission)
        permission
    }

    @Transactional
    void deletePermission(String channelId, String targetUserId) {
        def existing = permissionMapper.findByChannelAndUser(channelId, targetUserId)
        if (!existing) {
            throw new ResourceNotFoundException('Permissão não encontrada')
        }
        permissionMapper.deleteByChannelAndUser(channelId, targetUserId)
    }

    /**
     * Permissões efetivas combinam o role global com overrides por canal.
     *
     * - ADMIN: acesso total.
     * - MODERATOR: leitura, escrita e gerência em qualquer canal.
     * - Criador do canal: sempre pode gerenciar o próprio canal.
     * - Canal sem entradas de permissão: aberto a todos autenticados (leitura/escrita).
     * - Canal com entradas de permissão (restrito): apenas usuários listados,
     *   moderadores e admins têm acesso.
     */
    EffectivePermissions getEffectivePermissions(String channelId, String userId) {
        def user = userMapper.findById(userId)
        if (!user) {
            throw new ResourceNotFoundException('Usuário não encontrado')
        }

        UserRole role = user.role ?: UserRole.USER

        if (role == UserRole.ADMIN) {
            return new EffectivePermissions(canRead: true, canWrite: true, canManage: true)
        }

        def channel = channelMapper.findById(channelId)
        if (channel == null) {
            return new EffectivePermissions(canRead: true, canWrite: true, canManage: false)
        }

        // DMs: apenas os dois participantes; ninguém gerencia
        if (channel.type == ChannelType.DIRECT) {
            boolean member = dmService.isMember(channelId, userId)
            return new EffectivePermissions(canRead: member, canWrite: member, canManage: false)
        }

        boolean isCreator = channel.createdBy != null && channel.createdBy == userId

        if (role == UserRole.MODERATOR || isCreator) {
            return new EffectivePermissions(canRead: true, canWrite: true, canManage: true)
        }

        def channelPermissions = permissionMapper.findByChannelId(channelId) ?: []

        // Canal aberto: sem restrições explícitas
        if (channelPermissions.isEmpty()) {
            return new EffectivePermissions(canRead: true, canWrite: true, canManage: false)
        }

        // Canal restrito: exige entrada individual
        def override = permissionMapper.findByChannelAndUser(channelId, userId)

        if (!override) {
            return new EffectivePermissions(canRead: false, canWrite: false, canManage: false)
        }

        new EffectivePermissions(
            canRead: override.canRead,
            canWrite: override.canWrite,
            canManage: override.canManage
        )
    }

    void requireManage(String channelId, String userId) {
        def perms = getEffectivePermissions(channelId, userId)
        if (!perms.canManage) {
            throw new BusinessException('Você não tem permissão para gerenciar este canal')
        }
    }
}

class EffectivePermissions {
    boolean canRead
    boolean canWrite
    boolean canManage
}
