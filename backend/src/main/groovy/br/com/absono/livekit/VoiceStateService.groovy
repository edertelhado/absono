package br.com.absono.livekit

import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import org.slf4j.Logger
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.messaging.simp.SimpMessagingTemplate
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.web.client.RestTemplate

import javax.crypto.SecretKey
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap

@Service
class VoiceStateService {

    private static final Logger log = LoggerFactory.getLogger(VoiceStateService)
    private static final String CHANNEL_PREFIX = 'channel-'

    private final SimpMessagingTemplate messagingTemplate
    private final RestTemplate restTemplate = new RestTemplate()

    @Value('${livekit.internal-url}')
    String internalUrl

    @Value('${livekit.api-key}')
    String apiKey

    @Value('${livekit.api-secret}')
    String apiSecret

    // roomName -> (identity -> estado do participante)
    private final Map<String, Map<String, Map<String, Object>>> rooms = new ConcurrentHashMap<>()
    private volatile List<Map> snapshot = []

    VoiceStateService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate
    }

    List<Map> currentSnapshot() {
        return snapshot
    }

    // ==================== Webhooks (tempo real) ====================

    synchronized void onParticipantJoined(String roomName, String identity, String name) {
        if (!roomName?.startsWith(CHANNEL_PREFIX) || !identity) return
        def room = rooms.computeIfAbsent(roomName) { new ConcurrentHashMap<>() }
        def existing = room.get(identity)
        if (existing == null) {
            room.put(identity, [
                userId      : identity,
                displayName : name ?: identity,
                micMuted    : true,
                cameraOn    : false,
            ])
            broadcastIfChanged()
        } else if ((name ?: identity) != existing.displayName) {
            existing.displayName = name ?: identity
            broadcastIfChanged()
        }
    }

    synchronized void onParticipantLeft(String roomName, String identity) {
        if (!roomName?.startsWith(CHANNEL_PREFIX)) return
        def room = rooms[roomName]
        if (room == null) return
        if (room.remove(identity) != null) {
            broadcastIfChanged()
        }
        if (room.isEmpty()) rooms.remove(roomName)
    }

    synchronized void onRoomFinished(String roomName) {
        if (!roomName?.startsWith(CHANNEL_PREFIX)) return
        if (rooms.remove(roomName) != null) {
            broadcastIfChanged()
        }
    }

    synchronized void onTrackStateChanged(String roomName, String identity, String source, boolean published, boolean muted) {
        if (!roomName?.startsWith(CHANNEL_PREFIX) || !identity) return
        def p = rooms[roomName]?.get(identity)
        if (p == null) return

        switch (source) {
            case 'MICROPHONE':
                // publicado e nao-mutado => microfone aberto; sem publicacao => mudo
                boolean newState = published ? muted : true
                if (p.micMuted != newState) { p.micMuted = newState; broadcastIfChanged() }
                break
            case 'CAMERA':
                boolean newState = published ? !muted : false
                if (p.cameraOn != newState) { p.cameraOn = newState; broadcastIfChanged() }
                break
        }
    }

    // ==================== Reconciliação (fallback periódico) ====================

    @Scheduled(fixedDelay = 30000L, initialDelay = 10000L)
    void reconcile() {
        try {
            reconcileFromLiveKit()
        } catch (Exception e) {
            log.warn('Falha ao reconciliar voice state do LiveKit: {}', e.message)
        }
    }

    synchronized void reconcileFromLiveKit() {
        def novo = [:]

        listRooms().findAll { it?.name?.startsWith(CHANNEL_PREFIX) }.each { room ->
            def participants = [:]
            listParticipants(room.name).each { p ->
                participants[p.identity] = [
                    userId      : p.identity,
                    displayName : p.name ?: p.identity,
                    micMuted    : deriveMicMuted(p),
                    cameraOn    : deriveCameraOn(p),
                ]
            }
            novo[room.name] = participants
        }

        rooms.clear()
        rooms.putAll(novo)
        broadcastIfChanged()
    }

    // ==================== Interno ====================

    private void broadcastIfChanged() {
        def states = []
        rooms.each { entry ->
            String channelId = entry.key.substring(CHANNEL_PREFIX.length())
            entry.value.values().each { p ->
                states << [
                    channelId  : channelId,
                    userId     : p.userId,
                    displayName: p.displayName,
                    micMuted   : p.micMuted,
                    cameraOn   : p.cameraOn,
                ]
            }
        }

        if (states != snapshot) {
            snapshot = states
            messagingTemplate.convertAndSend('/topic/voice-state', [
                type: 'VOICE_STATE',
                data: states
            ])
        }
    }

    private List listRooms() {
        def response = post('ListRooms', [:], adminToken([roomList: true]))
        return (response.rooms ?: []) as List
    }

    private List listParticipants(String roomName) {
        def response = post('ListParticipants', [room: roomName], adminToken([roomAdmin: true, room: roomName]))
        return (response.participants ?: []) as List
    }

    private Map post(String method, Map body, String token) {
        def headers = new HttpHeaders()
        headers.contentType = MediaType.APPLICATION_JSON
        headers.set(HttpHeaders.AUTHORIZATION, "Bearer ${token}")
        def entity = new HttpEntity<Map>(body, headers)
        return restTemplate.postForObject("${internalUrl}/twirp/livekit.RoomService/${method}", entity, Map)
    }

    private static boolean deriveMicMuted(Map participant) {
        def audioTracks = (participant.tracks ?: []).findAll { it.type == 'AUDIO' && it.source != 'SCREEN_SHARE_AUDIO' }
        if (audioTracks.isEmpty()) return true
        return audioTracks.every { it.muted == true }
    }

    private static boolean deriveCameraOn(Map participant) {
        return (participant.tracks ?: []).any { it.type == 'VIDEO' && it.source == 'CAMERA' && it.muted != true }
    }

    private String adminToken(Map videoGrants) {
        byte[] secretBytes = apiSecret.getBytes(StandardCharsets.UTF_8)
        SecretKey key = Keys.hmacShaKeyFor(secretBytes)

        long now = System.currentTimeMillis()

        Jwts.builder()
            .issuer(apiKey)
            .subject('voice-state-poller')
            .claim('video', videoGrants)
            .issuedAt(new Date(now))
            .expiration(new Date(now + 30000))
            .header().keyId(apiKey).add('alg', 'HS256').add('typ', 'JWT').and()
            .signWith(key)
            .compact()
    }
}
