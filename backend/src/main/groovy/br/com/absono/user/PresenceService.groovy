package br.com.absono.user

import org.slf4j.Logger
import org.slf4j.LoggerFactory
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.messaging.simp.SimpMessageHeaderAccessor
import org.springframework.messaging.simp.SimpMessagingTemplate
import org.springframework.messaging.simp.stomp.StompHeaderAccessor
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Service
import org.springframework.web.socket.messaging.SessionConnectedEvent
import org.springframework.web.socket.messaging.SessionDisconnectEvent

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentMap

/**
 * Presença real baseada em sessões WebSocket.
 *
 * Marca ONLINE quando a primeira sessão do usuário conecta e OFFLINE quando a
 * última cai (fechar aba, crash, queda de rede) — sem depender de logout
 * explícito. Na inicialização da aplicação todas as sessões morreram, então
 * todos voltam para OFFLINE.
 */
@Service
class PresenceService {

    private static final Logger log = LoggerFactory.getLogger(PresenceService)

    private final UserMapper userMapper
    private final SimpMessagingTemplate messagingTemplate

    // sessionId stomp -> userId
    private final ConcurrentMap<String, String> sessionUsers = new ConcurrentHashMap<>()

    PresenceService(UserMapper userMapper, SimpMessagingTemplate messagingTemplate) {
        this.userMapper = userMapper
        this.messagingTemplate = messagingTemplate
    }

    List<User> getAllUsers() {
        userMapper.findAll()
    }

    @EventListener
    void onSessionConnected(SessionConnectedEvent event) {
        String userId = principalName(event)
        String sessionId = sessionId(event)
        if (!userId || !sessionId) return

        sessionUsers[sessionId] = userId
        if (countSessions(userId) == 1L) {
            setStatus(userId, 'ONLINE')
        }
    }

    @EventListener
    void onSessionDisconnected(SessionDisconnectEvent event) {
        String sessionId = event.sessionId
        String userId = sessionUsers.remove(sessionId) ?: principalName(event)
        if (!userId) return

        if (countSessions(userId) == 0L) {
            setStatus(userId, 'OFFLINE')
        }
    }

    /**
     * Varredura na subida: nenhuma sessão WebSocket sobrevive a um restart,
     * logo nenhum usuário pode estar ONLINE.
     */
    @EventListener(org.springframework.boot.context.event.ApplicationReadyEvent)
    void sweepOnStartup() {
        int updated = userMapper.markAllOffline()
        sessionUsers.clear()
        if (updated > 0) {
            log.info('Presenca: {} usuarios marcados OFFLINE apos reinicio', updated)
        }
    }

    /** Chamado no logout explicito: derruba o estado online imediatamente. */
    void forceOffline(String userId) {
        sessionUsers.values().removeIf { it == userId }
        setStatus(userId, 'OFFLINE')
    }

    private long countSessions(String userId) {
        sessionUsers.values().count { it == userId }
    }

    private void setStatus(String userId, String status) {
        try {
            userMapper.updateStatus(userId, status)
            broadcastStatus(userId, status)
        } catch (Exception e) {
            log.warn('Falha ao atualizar presenca de {}: {}', userId, e.message)
        }
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

    private static String principalName(event) {
        event.user?.name ?: headerValue(event, 'simpUser')?.name
    }

    private static String sessionId(event) {
        headerValue(event, 'simpSessionId')
    }

    private static def headerValue(event, String name) {
        SimpMessageHeaderAccessor.wrap(event.message).getHeader(name)
    }
}
