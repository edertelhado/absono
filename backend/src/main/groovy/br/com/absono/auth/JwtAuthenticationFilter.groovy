package br.com.absono.auth

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.core.userdetails.UserDetails
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

@Component
class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil
    private final CustomUserDetailsService userDetailsService

    JwtAuthenticationFilter(JwtUtil jwtUtil, CustomUserDetailsService userDetailsService) {
        this.jwtUtil = jwtUtil
        this.userDetailsService = userDetailsService
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) {
        String header = request.getHeader('Authorization')

        if (header && header.startsWith('Bearer ')) {
            String token = header.substring(7)

            if (jwtUtil.validateToken(token)) {
                String userId = jwtUtil.getUserId(token)
                String username = jwtUtil.getUsername(token)

                if (userId && !SecurityContextHolder.context.authentication) {
                    UserDetails userDetails = userDetailsService.loadUserByUsername(userId)

                    UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                        userDetails, null, userDetails.authorities
                    )
                    authToken.details = new WebAuthenticationDetailsSource().buildDetails(request)
                    SecurityContextHolder.context.authentication = authToken
                }
            }
        }

        filterChain.doFilter(request, response)
    }
}
