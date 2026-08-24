package br.com.absono.channel

import br.com.absono.common.BusinessException
import br.com.absono.common.ResourceNotFoundException
import br.com.absono.common.Ulid
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class ChannelService {

    private final ChannelMapper channelMapper
    private final ChannelPermissionService permissionService

    ChannelService(ChannelMapper channelMapper, ChannelPermissionService permissionService) {
        this.channelMapper = channelMapper
        this.permissionService = permissionService
    }

    List<Channel> getAllChannels() {
        channelMapper.findAll()
    }

    List<Channel> getVisibleChannels(String userId) {
        def all = channelMapper.findAll()
        all.findAll { ch ->
            try {
                def perms = permissionService.getEffectivePermissions(ch.id, userId)
                perms.canRead
            } catch (Exception e) {
                // Em caso de falha ao resolver permissão, nega a visibilidade
                // (fail-closed) em vez de expor o canal indevidamente.
                false
            }
        }
    }

    Channel getChannelById(String id) {
        def channel = channelMapper.findById(id)
        if (!channel) {
            throw new ResourceNotFoundException('Canal nao encontrado: ' + id)
        }
        return channel
    }

    EffectivePermissions getEffectivePermissions(String channelId, String userId) {
        permissionService.getEffectivePermissions(channelId, userId)
    }

    @Transactional
    Channel createChannel(CreateChannelRequest request, String createdBy) {
        def existing = channelMapper.findByName(request.name)
        if (existing) {
            throw new BusinessException('Ja existe um canal com esse nome')
        }

        Integer maxPos = channelMapper.getMaxPosition()
        int position = maxPos != null ? maxPos + 1 : 0

        String id = Ulid.generate()

        Channel channel = new Channel(
            id: id,
            name: request.name,
            type: request.type ?: ChannelType.TEXT,
            description: request.description ?: '',
            position: position,
            active: true,
            createdBy: createdBy
        )

        channelMapper.insert(channel)
        channelMapper.findById(id)
    }

    @Transactional
    Channel updateChannel(String id, UpdateChannelRequest request, String requesterId) {
        permissionService.requireManage(id, requesterId)

        def channel = channelMapper.findById(id)
        if (!channel) {
            throw new ResourceNotFoundException('Canal nao encontrado')
        }

        channel.name = request.name ?: channel.name
        channel.description = request.description != null ? request.description : channel.description
        channel.active = request.active != null ? request.active : channel.active

        channelMapper.update(channel)
        channelMapper.findById(id)
    }

    @Transactional
    void deleteChannel(String id, String requesterId) {
        permissionService.requireManage(id, requesterId)

        if (!channelMapper.findById(id)) {
            throw new ResourceNotFoundException('Canal nao encontrado')
        }
        channelMapper.delete(id)
    }

    @Transactional
    void reorderChannel(String id, int newPosition, String requesterId) {
        permissionService.requireManage(id, requesterId)

        if (!channelMapper.findById(id)) {
            throw new ResourceNotFoundException('Canal nao encontrado')
        }
        channelMapper.updatePosition(id, newPosition)
    }
}

class CreateChannelRequest {
    String name
    ChannelType type
    String description
}

class UpdateChannelRequest {
    String name
    String description
    Boolean active
}
