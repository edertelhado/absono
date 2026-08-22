package br.com.absono.channel

import br.com.absono.common.BusinessException
import br.com.absono.common.Ulid
import br.com.absono.user.UserMapper
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class DmService {

    private final DmMapper dmMapper
    private final ChannelMapper channelMapper
    private final UserMapper userMapper

    DmService(DmMapper dmMapper, ChannelMapper channelMapper, UserMapper userMapper) {
        this.dmMapper = dmMapper
        this.channelMapper = channelMapper
        this.userMapper = userMapper
    }

    List<Map<String, Object>> listForUser(String userId) {
        dmMapper.listForUser(userId)
    }

    Map<String, Object> peerOf(String channelId, String me) {
        dmMapper.findByChannelId(channelId, me)
    }

    boolean isMember(String channelId, String userId) {
        def pair = dmMapper.findByChannelId(channelId, userId)
        if (!pair) return false
        pair.userA == userId || pair.userB == userId
    }

    @Transactional
    Map<String, Object> openWith(String me, String other) {
        if (!other || other == me) {
            throw new BusinessException('Usuário inválido para mensagem direta')
        }
        if (!userMapper.findById(other)) {
            throw new BusinessException('Usuário não encontrado')
        }

        String a = [me, other].min()
        String b = [me, other].max()

        def existing = dmMapper.findByPair(a, b)
        if (existing) {
            return [channelId: existing.channelId]
        }

        String channelId = Ulid.generate()
        channelMapper.insertDirect(channelId, "dm:${a}:${b}".toString(), me)
        dmMapper.insert(channelId, a, b)
        [channelId: channelId]
    }
}
