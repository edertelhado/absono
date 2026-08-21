package br.com.absono.config

import br.com.absono.auth.JwtAuthenticationFilter
import br.com.absono.auth.JwtAuthenticationEntryPoint
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.authentication.AuthenticationManager
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
class WebSecurityConfig {

    private final JwtAuthenticationFilter jwtFilter
    private final JwtAuthenticationEntryPoint jwtEntryPoint

    WebSecurityConfig(JwtAuthenticationFilter jwtFilter, JwtAuthenticationEntryPoint jwtEntryPoint) {
        this.jwtFilter = jwtFilter
        this.jwtEntryPoint = jwtEntryPoint
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        JwtAuthenticationFilter filter = this.jwtFilter
        JwtAuthenticationEntryPoint ep = this.jwtEntryPoint

        http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(cors -> {})
            .exceptionHandling(ex -> ex.authenticationEntryPoint(ep))
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers('/api/auth/**').permitAll()
                .requestMatchers('/actuator/health').permitAll()
                .requestMatchers('/ws/**').permitAll()
                .requestMatchers('/api/files/**').permitAll()
                .requestMatchers(org.springframework.http.HttpMethod.POST, '/api/livekit/webhook').permitAll()
                .anyRequest().authenticated()
            )
            .addFilterBefore(filter, UsernamePasswordAuthenticationFilter)

        return http.build()
    }

    @Bean
    AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager()
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder()
    }
}
