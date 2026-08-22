package br.com.absono.livekit

import com.fasterxml.jackson.databind.ObjectMapper
import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import spock.lang.Specification

import javax.crypto.SecretKey
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

class LiveKitWebhookControllerSpec extends Specification {

    VoiceStateService voiceStateService = Mock()
    ObjectMapper objectMapper = new ObjectMapper()
    LiveKitWebhookController controller

    String apiSecret = 'absono-livekit-dev-secret-32-chars!!'

    def setup() {
        controller = new LiveKitWebhookController(voiceStateService, objectMapper)
        controller.apiKey = 'devkey'
        controller.apiSecret = apiSecret
    }

    private String json(Map m) {
        new ObjectMapper().writeValueAsString(m)
    }

    private String sign(String rawBody) {
        SecretKey key = Keys.hmacShaKeyFor(apiSecret.getBytes(StandardCharsets.UTF_8))
        String sha = MessageDigest.getInstance('SHA-256')
            .digest(rawBody.getBytes(StandardCharsets.UTF_8))
            .encodeHex().toString()
        Jwts.builder()
            .issuer('devkey')
            .claim('sha256', sha)
            .issuedAt(new Date())
            .expiration(new Date(System.currentTimeMillis() + 60_000))
            .signWith(key)
            .compact()
    }

    def 'webhook válido com participant_joined registra entrada'() {
        given:
        def raw = json([
            event      : 'participant_joined',
            room       : [name: 'channel-c1'],
            participant: [identity: 'u9', name: 'Zé']
        ])

        when:
        def resp = controller.webhook('Bearer ' + sign(raw), raw)

        then:
        resp.statusCodeValue == 200
        1 * voiceStateService.onParticipantJoined('channel-c1', 'u9', 'Zé')
    }

    def 'track_muted propaga mute do microfone'() {
        given:
        def raw = json([
            event      : 'track_muted',
            room       : [name: 'channel-c1'],
            participant: [identity: 'u9', name: 'Zé'],
            track      : [source: 'MICROPHONE', muted: true]
        ])

        when:
        def resp = controller.webhook('Bearer ' + sign(raw), raw)

        then:
        resp.statusCodeValue == 200
        1 * voiceStateService.onTrackStateChanged('channel-c1', 'u9', 'MICROPHONE', true, true)
    }

    def 'assinatura divergente do corpo retorna 401 e não toca no serviço'() {
        given:
        def raw = json([event: 'participant_joined', room: [name: 'channel-c1'], participant: [identity: 'x']])

        when:
        def resp = controller.webhook('Bearer ' + sign('outro-conteudo'), raw)

        then:
        resp.statusCodeValue == 401
        0 * voiceStateService._
    }

    def 'token sem assinatura confiável retorna 401'() {
        given:
        def raw = json([event: 'participant_left'])

        when:
        def resp = controller.webhook('Bearer lixo.lixo.lixo', raw)

        then:
        resp.statusCodeValue == 401
        0 * voiceStateService._
    }
}
