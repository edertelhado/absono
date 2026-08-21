package br.com.absono.auth

import io.jsonwebtoken.*
import io.jsonwebtoken.security.Keys
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

import javax.crypto.SecretKey
import java.nio.charset.StandardCharsets

@Component
class JwtUtil {

    @Value('${jwt.secret}')
    String secret

    @Value('${jwt.expiration}')
    long expiration

    @Value('${jwt.refresh-expiration}')
    long refreshExpiration

    private SecretKey getKey() {
        Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8))
    }

    String generateToken(String userId, String username) {
        JwtBuilder builder = Jwts.builder()
            .subject(userId)
            .claim('username', username)
            .issuedAt(new Date())
            .expiration(new Date(System.currentTimeMillis() + expiration))
            .signWith(getKey())

        builder.compact()
    }

    String generateRefreshToken(String userId) {
        JwtBuilder builder = Jwts.builder()
            .subject(userId)
            .claim('type', 'refresh')
            .issuedAt(new Date())
            .expiration(new Date(System.currentTimeMillis() + refreshExpiration))
            .signWith(getKey())

        builder.compact()
    }

    String getUserId(String token) {
        Claims claims = parseToken(token)
        return claims ? claims.getSubject() : null
    }

    String getUsername(String token) {
        Claims claims = parseToken(token)
        return claims ? claims.get('username', String) : null
    }

    boolean validateToken(String token) {
        try {
            parseToken(token)
            return true
        } catch (JwtException | IllegalArgumentException e) {
            return false
        }
    }

    private Claims parseToken(String token) {
        Jwts.parser()
            .verifyWith(getKey())
            .build()
            .parseSignedClaims(token)
            .payload
    }
}
