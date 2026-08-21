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

    WebSocketAuthInterceptor(@Lazy JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil
    }

    @Override
    Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor)

        if (accessor && StompCommand.CONNECT == accessor.command) {
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
