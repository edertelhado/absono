package br.com.absono.livekit

import com.fasterxml.jackson.databind.ObjectMapper
import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import org.slf4j.Logger
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

import javax.crypto.SecretKey
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

@RestController
@RequestMapping('/api/livekit')
class LiveKitWebhookController {

    private static final Logger log = LoggerFactory.getLogger(LiveKitWebhookController)

    private final VoiceStateService voiceStateService
    private final ObjectMapper objectMapper

    @Value('${livekit.api-key}')
    String apiKey

    @Value('${livekit.api-secret}')
    String apiSecret

    LiveKitWebhookController(VoiceStateService voiceStateService, ObjectMapper objectMapper) {
        this.voiceStateService = voiceStateService
        this.objectMapper = objectMapper
    }

    @PostMapping('/webhook')
    ResponseEntity<?> webhook(@RequestHeader(value = 'Authorization', required = false) String authorization,
                              @RequestBody String rawBody) {
        try {
            verifySignature(authorization, rawBody)
        } catch (SecurityException | io.jsonwebtoken.JwtException e) {
            log.warn('Webhook do LiveKit rejeitado: {}', e.message)
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body([error: 'assinatura invalida'])
        }

        try {
            dispatch(objectMapper.readValue(rawBody, Map))
        } catch (Exception e) {
            log.warn('Falha ao processar webhook do LiveKit: {}', e.message)
        }

        return ResponseEntity.ok([received: true])
    }

    private void dispatch(Map event) {
        String name = event.event as String
        def room = (event.room ?: [:]) as Map
        String roomName = room.name as String
        def participant = (event.participant ?: [:]) as Map
        String identity = participant.identity as String
        def track = (event.track ?: [:]) as Map
        String source = track.source as String
        boolean muted = track.muted == true

        switch (name) {
            case 'participant_joined':
                voiceStateService.onParticipantJoined(roomName, identity, participant.name as String)
                break
            case 'participant_left':
                voiceStateService.onParticipantLeft(roomName, identity)
                break
            case 'room_finished':
                voiceStateService.onRoomFinished(roomName)
                break
            case 'track_published':
                voiceStateService.onTrackStateChanged(roomName, identity, source, true, muted)
                break
            case 'track_unpublished':
                voiceStateService.onTrackStateChanged(roomName, identity, source, false, muted)
                break
            case 'track_muted':
                voiceStateService.onTrackStateChanged(roomName, identity, source, true, true)
                break
            case 'track_unmuted':
                voiceStateService.onTrackStateChanged(roomName, identity, source, true, false)
                break
        }
    }

    private void verifySignature(String authorization, String body) {
        if (!authorization?.startsWith('Bearer ')) {
            throw new SecurityException('token ausente')
        }
        String token = authorization.substring('Bearer '.length())

        SecretKey key = Keys.hmacShaKeyFor(secretBytes())

        def claims = Jwts.parser()
            .verifyWith(key)
            .requireIssuer(apiKey)
            .build()
            .parseSignedClaims(token)
            .payload

        String expected = sha256Hex(body)
        if (claims.get('sha256') != expected) {
            throw new SecurityException('hash do corpo divergente')
        }
    }

    private byte[] secretBytes() {
        byte[] bytes = apiSecret.getBytes(StandardCharsets.UTF_8)
        if (bytes.length < 32) {
            bytes = MessageDigest.getInstance('SHA-256').digest(bytes)
        }
        return bytes
    }

    private static String sha256Hex(String value) {
        return MessageDigest.getInstance('SHA-256')
            .digest(value.getBytes(StandardCharsets.UTF_8))
            .encodeHex().toString()
    }
}
