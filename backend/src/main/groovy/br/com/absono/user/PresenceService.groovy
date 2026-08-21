package br.com.absono.user

import org.springframework.messaging.simp.SimpMessagingTemplate
import org.springframework.stereotype.Service

@Service
class PresenceService {

    private final SimpMessagingTemplate messagingTemplate

    PresenceService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate
    }

    void broadcastStatus(String userId, String status) {
        messagingTemplate.convertAndSend('/topic/presence', [
            type: 'STATUS_CHANGE',
            data: [
                userId: userId,
                status: status
            ]
        ])
    }
}
