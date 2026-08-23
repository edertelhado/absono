package br.com.absono.common

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import spock.lang.Specification

import java.io.PrintWriter

/**
 * Tudo instanciado dentro de cada feature para isolamento total.
 */
class RateLimitFilterSpec extends Specification {

    private RateLimitFilter makeFilter() {
        new RateLimitFilter(enabled: true)
    }

    private HttpServletRequest req(String uri, String method, String ip) {
        Mock(HttpServletRequest) {
            getRequestURI() >> uri
            getMethod() >> method
            getHeader('X-Forwarded-For') >> null
            getRemoteAddr() >> ip
        }
    }

    def "bloqueia a 16ª tentativa de login do mesmo IP com 429"() {
        given:
        def filter = makeFilter()
        def request = Mock(HttpServletRequest) {
            getRequestURI() >> '/api/auth/login'
            getMethod() >> 'POST'
            getHeader('X-Forwarded-For') >> null
            getRemoteAddr() >> '10.1.1.1'
        }
        def response = Mock(HttpServletResponse) {
            getWriter() >> Mock(PrintWriter)
        }
        def chain = Mock(FilterChain)

        when:
        16.times { filter.doFilterInternal(request, response, chain) }

        then:
        15 * chain.doFilter(request, response)
        1 * response.setStatus(429)
        1 * response.setHeader('Retry-After', '60')
        1 * response.writer.write(_ as String)
    }

    def "IPs diferentes possuem janelas independentes"() {
        given:
        def filter = makeFilter()
        def chain = Mock(FilterChain)

        when:
        10.times { i ->
            String ip = (i % 2 == 0) ? '10.2.2.1' : '10.2.2.2'
            def request = Mock(HttpServletRequest) {
                getRequestURI() >> '/api/auth/login'
                getMethod() >> 'POST'
                getHeader('X-Forwarded-For') >> null
                getRemoteAddr() >> ip
            }
            filter.doFilterInternal(request, Mock(HttpServletResponse), chain)
        }

        then:
        0 * _
        10 * chain.doFilter(_, _)
    }

    def "desabilitado nunca bloqueia"() {
        given:
        def filter = makeFilter()
        filter.enabled = false
        def request = Mock(HttpServletRequest) {
            getRequestURI() >> '/api/auth/login'
            getMethod() >> 'POST'
            getRemoteAddr() >> '10.3.3.3'
        }
        def response = Mock(HttpServletResponse)
        def chain = Mock(FilterChain)

        when:
        50.times { filter.doFilterInternal(request, response, chain) }

        then:
        50 * chain.doFilter(request, response)
        0 * response.setStatus(429)
    }

    def "regra não correspondente não conta janela"() {
        given:
        def filter = makeFilter()
        def request = Mock(HttpServletRequest) {
            getRequestURI() >> '/api/me'
            getMethod() >> 'GET'
            getRemoteAddr() >> '10.4.4.4'
        }
        def response = Mock(HttpServletResponse)
        def chain = Mock(FilterChain)

        when:
        500.times { filter.doFilterInternal(request, response, chain) }

        then:
        500 * chain.doFilter(request, response)
        0 * response.setStatus(429)
    }
}
