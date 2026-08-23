package br.com.absono.common

import jakarta.servlet.FilterChain
import jakarta.servlet.ServletException
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpMethod
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import java.util.regex.Pattern

/**
 * Rate limiting simples por IP com janela deslizante em memória.
 *
 * Protege os endpoints abertos/mais sensíveis contra brute force e spam.
 */
@Component
@org.springframework.core.annotation.Order(-90)
class RateLimitFilter extends OncePerRequestFilter {

    // regra: [método, padrão do path (regex), limite por minuto]
    private static final List<Object[]> RULES = [
        [HttpMethod.POST, Pattern.compile('^/api/auth/login$'),                15],
        [HttpMethod.POST, Pattern.compile('^/api/auth/register$'),              5],
        [HttpMethod.POST, Pattern.compile('^/api/auth/refresh$'),              30],
        [HttpMethod.POST, Pattern.compile('^/api/channels/[^/]+/messages$'),  120],
        [HttpMethod.POST, Pattern.compile('^/api/attachments(/presign)?$'),    30],
        [HttpMethod.GET,  Pattern.compile('^/api/files/'),                    240],
    ]

    @Value('${ratelimit.enabled:true}')
    boolean enabled

    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>()
    private volatile long lastCleanup = System.currentTimeMillis()

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        if (!enabled) {
            filterChain.doFilter(request, response)
            return
        }

        Object[] rule = matchRule(request)
        if (rule == null) {
            filterChain.doFilter(request, response)
            return
        }

        String key = clientIp(request) + '|' + ((Pattern) rule[1]).pattern()
        long nowMs = System.currentTimeMillis()

        Window w = windows.get(key)
        if (w == null || nowMs - w.start >= 60_000L) {
            w = new Window(nowMs)
            windows.put(key, w)
        }
        long count = w.count.incrementAndGet()

        if (count > (rule[2] as long)) {
            response.status = 429
            response.setHeader('Retry-After', '60')
            response.contentType = 'application/json'
            response.writer.write('{"success":false,"message":"Muitas requisições. Tente novamente em instantes."}')
            return
        }

        cleanupStale(nowMs)
        filterChain.doFilter(request, response)
    }

    private void cleanupStale(long nowMs) {
        if (nowMs - lastCleanup < 300_000L) return
        lastCleanup = nowMs
        windows.entrySet().removeIf { e -> nowMs - e.value.start >= 120_000L }
    }

    // visível para testes no mesmo pacote
    String lastMatchedRule = null

    private Object[] matchRule(HttpServletRequest request) {
        lastMatchedRule = null
        String path = request.requestURI
        HttpMethod method = HttpMethod.valueOf(request.method)
        for (rule in RULES) {
            if (((HttpMethod) rule[0]) == method && ((Pattern) rule[1]).matcher(path).matches()) {
                lastMatchedRule = ((Pattern) rule[1]).pattern()
                return rule
            }
        }
        null
    }

    private static String clientIp(HttpServletRequest request) {
        String xff = request.getHeader('X-Forwarded-For')
        if (xff) {
            String first = xff.split(',')[0].trim()
            if (first) return first
        }
        request.remoteAddr ?: 'unknown'
    }

    private static class Window {
        final long start
        final AtomicLong count = new AtomicLong(0)

        Window(long start) {
            this.start = start
        }
    }
}
