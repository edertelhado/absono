package br.com.absono.message

import br.com.absono.channel.ChannelService
import br.com.absono.common.BusinessException
import br.com.absono.user.UserService
import org.springframework.http.ResponseEntity
import org.springframework.messaging.simp.SimpMessagingTemplate
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping('/api')
class MessageController {

    private final MessageService messageService
    private final UserService userService
    private final ChannelService channelService
    private final SimpMessagingTemplate messagingTemplate

    MessageController(MessageService messageService, UserService userService, ChannelService channelService, SimpMessagingTemplate messagingTemplate) {
        this.messageService = messageService
        this.userService = userService
        this.channelService = channelService
        this.messagingTemplate = messagingTemplate
    }

    @GetMapping('/channels/{channelId}/messages')
    ResponseEntity<?> getMessages(
        @PathVariable String channelId,
        @RequestParam(defaultValue = '50') int limit,
        @RequestParam(defaultValue = '0') int offset
    ) {
        def user = userService.getCurrentUser()
        def messages = messageService.getMessages(channelId, user.id, limit, offset)
        int total = messageService.getMessageCount(channelId)
        ResponseEntity.ok([messages: messages, total: total, hasMore: offset + messages.size() < total])
    }

    @GetMapping('/channels/{channelId}/messages/search')
    ResponseEntity<?> searchMessages(
        @PathVariable String channelId,
        @RequestParam('q') String q,
        @RequestParam(defaultValue = '30') int limit
    ) {
        if (!q.trim()) {
            return ResponseEntity.ok([messages: []])
        }
        def user = userService.getCurrentUser()
        def messages = messageService.searchMessages(channelId, user.id, q.trim(), limit)
        ResponseEntity.ok([messages: messages])
    }

    @PostMapping('/channels/{channelId}/messages')
    ResponseEntity<?> sendMessage(@PathVariable String channelId, @RequestBody SendMessageRequest request) {
        def user = userService.getCurrentUser()
        request.channelId = channelId
        def message = messageService.sendMessage(request, user.id)

        // Broadcast to channel
        String destination = "/topic/channels/${channelId}".toString()
        messagingTemplate.convertAndSend(destination, [
            type: 'NEW_MESSAGE',
            data: message
        ])

        sendNotifications(channelId, message, user.id, user.displayName)

        ResponseEntity.ok(message)
    }

    private void sendNotifications(String channelId, Message message, String authorId, String authorName) {
        try {
            def channel = channelService.getChannelById(channelId)
            def preview = message.content.length() > 80 ? message.content.substring(0, 80) + '...' : message.content

            userService.getAllUsers().each { recipient ->
                if (recipient.id != authorId && recipient.status?.toString() != 'OFFLINE' && recipient.status?.toString() != 'INVISIBLE') {
                    messagingTemplate.convertAndSendToUser(recipient.id, '/queue/notifications', [
                        type: 'NEW_MESSAGE',
                        data: [
                            messageId: message.id,
                            channelId: channelId,
                            channelName: channel.name,
                            authorId: authorId,
                            authorName: authorName,
                            content: preview
                        ]
                    ])
                }
            }
        } catch (Exception ignored) {
            // Falha ao notificar não deve impedir o envio da mensagem
        }
    }

    @PostMapping('/messages/{id}/attachments')
    ResponseEntity<?> addAttachment(@PathVariable String id, @RequestBody Map body) {
        def user = userService.getCurrentUser()
        def message = messageService.getMessage(id)
        if (message.userId != user.id) {
            throw new BusinessException('Apenas o autor pode anexar arquivos à mensagem')
        }

        messageService.addAttachment(
            id,
            body.fileName?.toString(),
            body.mimeType?.toString(),
            Long.parseLong(body.fileSize?.toString() ?: '0'),
            body.s3Key?.toString(),
            body.url?.toString()
        )

        def attachments = messageService.getAttachments(id)
        messagingTemplate.convertAndSend("/topic/channels/${message.channelId}".toString(), [
            type: 'MESSAGE_ATTACHMENTS',
            data: [
                messageId  : id,
                attachments: attachments
            ]
        ])

        ResponseEntity.ok(attachmentJson(attachments.last()))
    }

    private static Map attachmentJson(def a) {
        [
            id      : a.id,
            fileId  : a.messageId,
            fileName: a.fileName,
            mimeType: a.mimeType,
            fileSize: a.fileSize,
            s3Key   : a.s3Key,
            url     : a.url
        ]
    }

    @PutMapping('/messages/{id}')
    ResponseEntity<?> editMessage(@PathVariable String id, @RequestBody Map body) {
        def user = userService.getCurrentUser()
        def message = messageService.editMessage(id, body.content, user.id)

        messagingTemplate.convertAndSend("/topic/channels/${message.channelId}".toString(), [
            type: 'MESSAGE_EDITED',
            data: message
        ])

        ResponseEntity.ok(message)
    }

    @DeleteMapping('/messages/{id}')
    ResponseEntity<?> deleteMessage(@PathVariable String id) {
        def user = userService.getCurrentUser()
        def message = messageService.getMessage(id)
        messageService.deleteMessage(id, user.id)

        messagingTemplate.convertAndSend("/topic/channels/${message.channelId}".toString(), [
            type: 'MESSAGE_DELETED',
            data: [id: id]
        ])

        ResponseEntity.ok([success: true, message: 'Mensagem excluída com sucesso'])
    }
}
