package br.com.absono.config

import br.com.absono.auth.JwtUtil
import org.springframework.context.annotation.Lazy
import org.springframework.messaging.Message
import org.springframework.messaging.MessageChannel
import org.springframework.messaging.simp.stomp.StompCommand
import org.springframework.messaging.simp.stomp.StompHeaderAccessor
import org.springframework.messaging.support.ChannelInterceptor
import org.springframework.messaging.support.MessageHeaderAccessor
import org.springframework.stereotype.Component

import java.security.Principal

@Component
class WebSocketAuthInterceptor implements ChannelInterceptor {

    private final JwtUtil jwtUtil
    private final ChannelPermissionService permissionService

    WebSocketAuthInterceptor(@Lazy JwtUtil jwtUtil, @Lazy ChannelPermissionService permissionService) {
        this.jwtUtil = jwtUtil
        this.permissionService = permissionService
    }

    @Override
    Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor)

        if (!accessor) {
            return message
        }

        if (StompCommand.CONNECT == accessor.command) {
            String authHeader = accessor.getFirstNativeHeader('Authorization')

            if (authHeader && authHeader.startsWith('Bearer ')) {
                String token = authHeader.substring(7)

                if (jwtUtil.validateToken(token)) {
                    String userId = jwtUtil.getUserId(token)
                    Principal principal = new StompPrincipal(userId)
                    accessor.user = principal
                    return message
                }
            }

            throw new IllegalArgumentException('Token de autenticação ausente ou inválido')
        }

        if (StompCommand.SUBSCRIBE == accessor.command) {
            Principal user = accessor.user
            if (!user) {
                throw new IllegalArgumentException('Usuário não autenticado')
            }
            String destination = accessor.destination
            // Apenas canais têm restrição de leitura por usuário.
            // /topic/voice-state, /topic/presence e /user/queue/** são globais/próprios.
            if (destination) {
                def matcher = destination =~ /\/topic\/channels\/([^\/]+)/
                if (matcher.matches()) {
                    String channelId = matcher.group(1)
                    boolean canRead = true
                    try {
                        canRead = permissionService.getEffectivePermissions(channelId, user.name).canRead
                    } catch (Exception ignored) {
                        canRead = false
                    }
                    if (!canRead) {
                        throw new IllegalArgumentException('Sem permissão para assinar este canal')
                    }
                }
            }
        }

        message
    }

    private static class StompPrincipal implements Principal {
        private final String name

        StompPrincipal(String name) {
            this.name = name
        }

        @Override
        String getName() {
            name
        }
    }
}
