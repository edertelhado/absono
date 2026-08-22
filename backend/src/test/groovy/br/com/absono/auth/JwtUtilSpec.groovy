package br.com.absono.auth

import spock.lang.Specification

class JwtUtilSpec extends Specification {

    JwtUtil jwtUtil

    def setup() {
        jwtUtil = new JwtUtil()
        jwtUtil.secret = 'segredo-de-teste-com-pelo-menos-32-caracteres!!'
        jwtUtil.expiration = 3600_000L
        jwtUtil.refreshExpiration = 7 * 24 * 3600_000L
    }

    def 'access token carrega identidade e não é refresh'() {
        when:
        String token = jwtUtil.generateToken('uid-1', 'alice')

        then:
        jwtUtil.validateToken(token)
        !jwtUtil.isRefreshToken(token)
        jwtUtil.getUserId(token) == 'uid-1'
        jwtUtil.getUsername(token) == 'alice'
    }

    def 'refresh token carrega type=refresh e o userId'() {
        when:
        String rt = jwtUtil.generateRefreshToken('uid-1')

        then:
        jwtUtil.validateToken(rt)
        jwtUtil.isRefreshToken(rt)
        jwtUtil.getUserId(rt) == 'uid-1'
    }

    def 'token inválido não valida nem é refresh'() {
        expect:
        !jwtUtil.validateToken('abc.def.ghi')
        !jwtUtil.isRefreshToken('abc.def.ghi')
    }

    def 'access token não pode ser usado como refresh token'() {
        given:
        String accessToken = jwtUtil.generateToken('uid-1', 'alice')

        expect:
        !jwtUtil.isRefreshToken(accessToken)
    }

    def 'token expirado não valida'() {
        given:
        jwtUtil.expiration = -1000L // já nasceu expirado
        String token = jwtUtil.generateToken('uid-1', 'alice')

        expect:
        !jwtUtil.validateToken(token)
    }
}
