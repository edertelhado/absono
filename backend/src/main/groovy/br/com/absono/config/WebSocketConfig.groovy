package br.com.absono.config

import org.springframework.context.annotation.Configuration
import org.springframework.messaging.simp.config.ChannelRegistration
import org.springframework.messaging.simp.config.MessageBrokerRegistry
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker
import org.springframework.web.socket.config.annotation.StompEndpointRegistry
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer

@Configuration
@EnableWebSocketMessageBroker
class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final WebSocketAuthInterceptor webSocketAuthInterceptor

    WebSocketConfig(WebSocketAuthInterceptor webSocketAuthInterceptor) {
        this.webSocketAuthInterceptor = webSocketAuthInterceptor
    }

    @Override
    void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(webSocketAuthInterceptor)
    }

    @Override
    void configureMessageBroker(MessageBrokerRegistry registry) {
        // '/queue' é obrigatório: destinos de usuário (/user/queue/**) são
        // traduzidos para /queue/<dest>-<sessão> antes de chegarem ao broker
        registry.enableSimpleBroker('/topic', '/queue')
        registry.setApplicationDestinationPrefixes('/app')
        registry.setUserDestinationPrefix('/user')
    }

    @Override
    void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint('/ws')
            .setAllowedOriginPatterns('*')
            .withSockJS()
    }
}
