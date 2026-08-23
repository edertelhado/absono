package br.com.absono.message

import br.com.absono.channel.ChannelPermissionService
import br.com.absono.common.BusinessException
import br.com.absono.common.ResourceNotFoundException
import br.com.absono.common.Ulid
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class MessageService {

    private final MessageMapper messageMapper
    private final ChannelPermissionService permissionService

    MessageService(MessageMapper messageMapper, ChannelPermissionService permissionService) {
        this.messageMapper = messageMapper
        this.permissionService = permissionService
    }

    List<Message> getMessages(String channelId, String userId, int limit = 50, int offset = 0) {
        if (userId) {
            def perms = permissionService.getEffectivePermissions(channelId, userId)
            if (!perms.canRead) {
                throw new BusinessException('Você não tem permissão para ler este canal')
            }
        }

        def messages = messageMapper.findByChannelId(channelId, limit, offset)
        messages.each { msg ->
            msg.attachments = messageMapper.findAttachmentsByMessageId(msg.id)
            msg.reactions = getReactionsSummary(msg.id)
        }
        attachThreadCounts(messages)
        messages.reverse()
    }

    List<Message> searchMessages(String channelId, String userId, String query, int limit = 30) {
        if (userId) {
            def perms = permissionService.getEffectivePermissions(channelId, userId)
            if (!perms.canRead) {
                throw new BusinessException('Você não tem permissão para ler este canal')
            }
        }

        def messages = messageMapper.searchByChannel(channelId, query, limit)
        messages.each { msg ->
            msg.attachments = messageMapper.findAttachmentsByMessageId(msg.id)
            msg.reactions = getReactionsSummary(msg.id)
        }
        attachThreadCounts(messages)
        messages
    }

    List<Map<String, Object>> getReactionsSummary(String messageId) {
        def rows = messageMapper.findReactionsByMessageId(messageId)
        def byEmoji = [:]
        rows.each { r ->
            def entry = byEmoji[r.emoji] ?: [emoji: r.emoji, count: 0, userIds: []]
            entry.count++
            (entry.userIds as List) << r.userId
            byEmoji[r.emoji] = entry
        }
        byEmoji.values().toList()
    }

    Map addReaction(String messageId, String userId, String emoji) {
        if (!messageMapper.findByMessageAndUserAndEmoji(messageId, userId, emoji)) {
            messageMapper.insertReaction(br.com.absono.common.Ulid.generate(), messageId, userId, emoji)
        }
        [messageId: messageId, channelId: getMessage(messageId).channelId, reactions: getReactionsSummary(messageId)]
    }

    Map removeReaction(String messageId, String userId, String emoji) {
        messageMapper.deleteReaction(messageId, userId, emoji)
        [messageId: messageId, channelId: getMessage(messageId).channelId, reactions: getReactionsSummary(messageId)]
    }

    int getMessageCount(String channelId) {
        messageMapper.countByChannelId(channelId)
    }

    @Transactional
    Message sendMessage(SendMessageRequest request, String userId) {
        def perms = permissionService.getEffectivePermissions(request.channelId, userId)
        if (!perms.canWrite) {
            throw new BusinessException('Você não tem permissão para enviar mensagens neste canal')
        }

        if (request.parentMessageId) {
            def parent = messageMapper.findById(request.parentMessageId)
            if (!parent) {
                throw new ResourceNotFoundException('Mensagem pai não encontrada')
            }
            if (parent.parentMessageId) {
                throw new BusinessException('Não é possível responder a uma resposta de thread')
            }
            if (parent.channelId != request.channelId) {
                throw new BusinessException('Mensagem pai pertence a outro canal')
            }
        }

        String id = Ulid.generate()

        Message message = new Message(
            id: id,
            channelId: request.channelId,
            userId: userId,
            content: request.content,
            replyToId: request.replyToId,
            parentMessageId: request.parentMessageId ?: null,
            edited: false
        )

        messageMapper.insert(message)
        messageMapper.findById(id)
    }

    List<Message> getThread(String parentId, String userId) {
        def parent = messageMapper.findById(parentId)
        if (!parent) {
            throw new ResourceNotFoundException('Mensagem não encontrada')
        }
        def perms = permissionService.getEffectivePermissions(parent.channelId, userId)
        if (!perms.canRead) {
            throw new BusinessException('Você não tem permissão para ler esta thread')
        }
        messageMapper.findByParentMessageId(parentId)
    }

    int countThreadReplies(String parentId) {
        messageMapper.findByParentMessageId(parentId).size()
    }

    /** Anexa contagem de respostas de thread nas mensagens do fluxo principal. */
    void attachThreadCounts(List<Message> messages) {
        if (!messages) return
        def ids = messages.collect { it.id }
        def counts = messageMapper.countThreadReplies(ids)
        counts.each { c ->
            def target = messages.find { it.id == c.parentMessageId }
            if (target) target.threadCount = c.threadCount
        }
    }

    @Transactional
    Message editMessage(String messageId, String content, String userId) {
        def message = messageMapper.findById(messageId)
        if (!message) {
            throw new ResourceNotFoundException('Mensagem nao encontrada')
        }
        def perms = permissionService.getEffectivePermissions(message.channelId, userId)
        boolean isOwner = message.userId == userId
        if (!isOwner && !perms.canManage) {
            throw new BusinessException('Você não tem permissão para editar esta mensagem')
        }
        messageMapper.updateContent(messageId, content)
        messageMapper.findById(messageId)
    }

    Message getMessage(String messageId) {
        def message = messageMapper.findById(messageId)
        if (!message) {
            throw new ResourceNotFoundException('Mensagem nao encontrada')
        }
        message
    }

    @Transactional
    void deleteMessage(String messageId, String userId) {
        def message = messageMapper.findById(messageId)
        if (!message) {
            throw new ResourceNotFoundException('Mensagem nao encontrada')
        }
        def perms = permissionService.getEffectivePermissions(message.channelId, userId)
        boolean isOwner = message.userId == userId
        if (!isOwner && !perms.canManage) {
            throw new BusinessException('Você não tem permissão para excluir esta mensagem')
        }
        messageMapper.delete(messageId)
    }

    @Transactional
    MessageAttachment addAttachment(String messageId, String fileName, String mimeType, long fileSize, String s3Key, String url) {
        String id = Ulid.generate()

        MessageAttachment attachment = new MessageAttachment(
            id: id,
            messageId: messageId,
            fileName: fileName,
            mimeType: mimeType,
            fileSize: fileSize,
            s3Key: s3Key,
            url: url
        )

        messageMapper.insertAttachment(attachment)
        attachment
    }

    List<MessageAttachment> getAttachments(String messageId) {
        messageMapper.findAttachmentsByMessageId(messageId)
    }
}

class SendMessageRequest {
    String channelId
    String content
    String replyToId

    String parentMessageId
}
