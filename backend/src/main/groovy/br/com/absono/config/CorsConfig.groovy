package br.com.absono.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.UrlBasedCorsConfigurationSource
import org.springframework.web.filter.CorsFilter

@Configuration
class CorsConfig {

    @Bean
    CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration()
        config.allowedOriginPatterns = ['*']
        config.allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
        config.allowedHeaders = ['*']
        config.allowCredentials = true
        config.maxAge = 3600L

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource()
        source.registerCorsConfiguration('/api/**', config)
        return new CorsFilter(source)
    }
}
