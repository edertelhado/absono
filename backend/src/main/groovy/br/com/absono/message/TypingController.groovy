package br.com.absono.message

import org.springframework.messaging.handler.annotation.DestinationVariable
import org.springframework.messaging.handler.annotation.MessageMapping
import org.springframework.messaging.simp.SimpMessagingTemplate
import org.springframework.stereotype.Controller

import java.security.Principal

@Controller
class TypingController {

    private final SimpMessagingTemplate messagingTemplate

    TypingController(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate
    }

    @MessageMapping('/channels/{channelId}/typing')
    void typing(@DestinationVariable String channelId, Principal principal) {
        String userId = principal?.name
        if (!userId) {
            return
        }

        messagingTemplate.convertAndSend("/topic/channels/${channelId}".toString(), [
            type: 'TYPING',
            data: [
                userId: userId,
                channelId: channelId
            ]
        ])
    }
}
