package br.com.absono.livekit

import br.com.absono.common.BusinessException
import br.com.absono.channel.ChannelMapper
import br.com.absono.channel.ChannelPermissionService
import br.com.absono.channel.ChannelType
import br.com.absono.user.User
import br.com.absono.user.UserService
import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

import javax.crypto.SecretKey
import java.nio.charset.StandardCharsets
import java.util.concurrent.CompletableFuture

@RestController
@RequestMapping('/api/livekit')
class LiveKitController {

    private final UserService userService
    private final ChannelMapper channelMapper
    private final ChannelPermissionService channelPermissionService
    private final VoiceStateService voiceStateService

    @Value('${livekit.api-key}')
    String apiKey

    @Value('${livekit.api-secret}')
    String apiSecret

    @Value('${livekit.url}')
    String serverUrl

    LiveKitController(UserService userService, ChannelMapper channelMapper, ChannelPermissionService channelPermissionService, VoiceStateService voiceStateService) {
        this.userService = userService
        this.channelMapper = channelMapper
        this.channelPermissionService = channelPermissionService
        this.voiceStateService = voiceStateService
    }

    @GetMapping('/voice-state')
    List<?> getVoiceState() {
        return voiceStateService.currentSnapshot()
    }

    @PostMapping('/token')
    ResponseEntity<?> getToken(@RequestBody TokenRequest request) {
        User user = userService.getCurrentUser()

        def channel = channelMapper.findById(request.channelId)
        if (!channel) {
            throw new BusinessException('Canal não encontrado')
        }

        if (channel.type != ChannelType.VOICE) {
            throw new BusinessException('Canal não é compatível com chamada')
        }

        def perms = channelPermissionService.getEffectivePermissions(channel.id, user.id)
        if (!perms.canRead) {
            throw new BusinessException('Você não tem permissão para entrar neste canal de voz')
        }

        String roomName = "channel-${channel.id}"
        String participantToken = generateLiveKitToken(user.id, user.displayName ?: user.username, roomName)

        // Entrada IMEDIATA no voice state — sem esperar webhook do LiveKit
        voiceStateService.markJoined(channel.id, user.id, user.displayName ?: user.username)

        ResponseEntity.ok([
            serverUrl: serverUrl,
            token: participantToken,
            roomName: roomName,
        ])
    }

    @PostMapping('/voice-state/leave')
    ResponseEntity<?> notifyLeft(@RequestBody LeaveRequest request) {
        User user = userService.getCurrentUser()
        if (request.channelId) {
            voiceStateService.markLeft(request.channelId, user.id)
        }
        ResponseEntity.ok([ok: true])
    }

    static class LeaveRequest {
        String channelId
    }

    private String generateLiveKitToken(String identity, String name, String roomName) {
        byte[] secretBytes = apiSecret.getBytes(StandardCharsets.UTF_8)
        if (secretBytes.length < 32) {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance('SHA-256')
            secretBytes = digest.digest(secretBytes)
        }
        SecretKey key = Keys.hmacShaKeyFor(secretBytes)

        Map<String, Object> grants = [
            roomJoin  : true,
            room      : roomName,
            canPublish   : true,
            canSubscribe : true,
            canPublishData: true
        ]

        long now = System.currentTimeMillis()

        Jwts.builder()
            .issuer(apiKey)
            .subject(identity)
            .claim('video', grants)
            .claim('name', name)
            .issuedAt(new Date(now))
            .expiration(new Date(now + 86400000))
            .header().keyId(apiKey).add('alg', 'HS256').add('typ', 'JWT').and()
            .signWith(key)
            .compact()
    }
}

class TokenRequest {
    String channelId
}
