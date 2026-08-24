import { defineStore } from 'pinia'
import { ref, shallowRef, computed, watch, markRaw } from 'vue'
import type { RemoteParticipant, LocalParticipant, RemoteVideoTrack, LocalVideoTrack, LocalAudioTrack, RemoteAudioTrack } from 'livekit-client'
import { Room, RoomEvent, Track, VideoQuality } from 'livekit-client'
import { livekitService } from '@/services/livekit'
import { getScreenShareEncodingParams } from '@/utils/livekit-presets'
import type { ScreenResolution, ScreenFPS } from '@/utils/livekit-presets'
import { sendNotification } from '@/services/notification'

const audioCaptureDefaults = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
} as const

export const useVoiceStore = defineStore('voice', () => {
  const room = shallowRef<Room | null>(null)
  const connected = ref(false)
  const connecting = ref(false)
  const reconnecting = ref(false)
  const currentRoomName = ref<string | null>(null)
  const joinedChannelId = ref<string | null>(null)
  // Canal efetivamente desejado pelo usuário. Permite honrar trocas de canal
  // solicitadas enquanto uma conexão ainda está em andamento (connect() só
  // aceita uma conexão por vez).
  let desiredChannelId: string | null = null

  const participants = shallowRef<RemoteParticipant[]>([])
  const localParticipant = shallowRef<LocalParticipant | null>(null)

  const isMicrophoneEnabled = ref(false)
  const isCameraEnabled = ref(false)
  const isScreenSharing = ref(false)

  const selectedAudioInput = ref<string>('')
  const selectedAudioOutput = ref<string>('')
  const selectedVideoInput = ref<string>('')

  const screenShareResolution = ref<'480p' | '720p' | '1080p' | '2k' | 'ultrawide'>('720p')
  const screenShareFPS = ref<ScreenFPS>(30)

  const mediaToggling = ref(false)

  const audioDevices = ref<MediaDeviceInfo[]>([])
  const videoDevices = ref<MediaDeviceInfo[]>([])

  const revision = ref(0)
  const localScreenShareTrack = shallowRef<LocalVideoTrack | null>(null)
  const activeSpeakers = ref<Set<string>>(new Set())
  const screenWatchers = ref<string[]>([])

  // ===== Volume por participante + abafar =====
  const volumes = ref<Record<string, number>>({})
  const deafened = ref(false)

  // Elementos de áudio remoto presos ao <body> — sobrevivem à navegação
  // entre views (CallPanel desmonta, a chamada continua).
  const remoteAudioEls = new Map<string, HTMLAudioElement>()

  // Mute exclusivo do áudio de compartilhamento de tela — necessário porque
  // o loopback do sistema inclui o próprio áudio da chamada (eco)
  const screenShareAudioMuted = ref(false)

  function effectiveVolume(identity: string, isShare = false): number {
    if (isShare && screenShareAudioMuted.value) return 0
    return deafened.value ? 0 : (volumes.value[identity] ?? 100) / 100
  }

  function applyVolumeToEl(el: HTMLAudioElement) {
    const track = (el as any).__lkTrack as RemoteAudioTrack | undefined
    const identity = (el as any).__identity as string
    const isShare = !!(el as any).__isShare
    try {
      track?.setVolume(effectiveVolume(identity, isShare))
    } catch {
      // track pode ter sido despublicada no meio do ajuste
    }
  }

  function syncRemoteAudio() {
    const wanted = new Map<string, { track: RemoteAudioTrack; identity: string; isShare: boolean }>()
    for (const p of participants.value as RemoteParticipant[]) {
      for (const pub of Array.from(p.audioTrackPublications.values())) {
        const track = pub.audioTrack as RemoteAudioTrack | undefined
        if (pub.isSubscribed && track) {
          wanted.set(pub.trackSid, {
            track,
            identity: p.identity,
            isShare: pub.source === Track.Source.ScreenShareAudio,
          })
        }
      }
    }

    for (const [sid, el] of Array.from(remoteAudioEls.entries())) {
      if (!wanted.has(sid)) {
        ;((el as any).__lkTrack as RemoteAudioTrack | undefined)?.detach(el)
        el.remove()
        remoteAudioEls.delete(sid)
      }
    }

    for (const [sid, info] of wanted) {
      if (remoteAudioEls.has(sid)) continue
      const el = document.createElement('audio')
      el.autoplay = true
      info.track.attach(el)
      ;(el as any).__lkTrack = info.track
      ;(el as any).__identity = info.identity
      ;(el as any).__isShare = info.isShare
      if (selectedAudioOutput.value && typeof (el as any).setSinkId === 'function') {
        ;(el as any).setSinkId(selectedAudioOutput.value).catch(() => {})
      }
      document.body.appendChild(el)
      remoteAudioEls.set(sid, el)
      applyVolumeToEl(el)
    }
  }

  function clearRemoteAudio() {
    for (const [, el] of remoteAudioEls) {
      ;((el as any).__lkTrack as RemoteAudioTrack | undefined)?.detach(el)
      el.remove()
    }
    remoteAudioEls.clear()
  }

  function volumeFor(identity: string): number {
    return volumes.value[identity] ?? 100
  }

  function setVolume(identity: string, v: number) {
    volumes.value = { ...volumes.value, [identity]: v }
    for (const el of remoteAudioEls.values()) applyVolumeToEl(el)
  }

  function toggleDeafen() {
    deafened.value = !deafened.value
    for (const el of remoteAudioEls.values()) applyVolumeToEl(el)
  }

  function toggleScreenShareAudio() {
    screenShareAudioMuted.value = !screenShareAudioMuted.value
    for (const el of remoteAudioEls.values()) applyVolumeToEl(el)
  }

  watch(selectedAudioOutput, async (deviceId) => {
    if (!deviceId) return
    for (const el of remoteAudioEls.values()) {
      if (typeof (el as any).setSinkId === 'function') {
        try { await (el as any).setSinkId(deviceId) } catch {}
      }
    }
  })

  // ===== Preferências persistentes (localStorage) =====
  const SETTINGS_KEY = 'absono_voice_settings'

  function loadVoiceSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')
      selectedAudioInput.value = s.audioInput || ''
      selectedAudioOutput.value = s.audioOutput || ''
      selectedVideoInput.value = s.videoInput || ''
      if (s.shareResolution) screenShareResolution.value = s.shareResolution
      if (s.shareFps) screenShareFPS.value = s.shareFps
    } catch {
      // configurações corrompidas — segue com defaults
    }
  }

  loadVoiceSettings()

  watch(
    [selectedAudioInput, selectedAudioOutput, selectedVideoInput, screenShareResolution, screenShareFPS],
    () => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        audioInput: selectedAudioInput.value,
        audioOutput: selectedAudioOutput.value,
        videoInput: selectedVideoInput.value,
        shareResolution: screenShareResolution.value,
        shareFps: screenShareFPS.value,
      }))
    }
  )

  const textEncoder = new TextEncoder()
  const textDecoder = new TextDecoder()

  const localTracks = computed(() => {
    if (!localParticipant.value) return []
    return Array.from(localParticipant.value.trackPublications.values())
  })

  const remoteParticipants = computed(() => participants.value)

  function touch() {
    participants.value = room.value ? [...room.value.remoteParticipants.values()] : []
    revision.value++
    syncRemoteAudio()
  }

  function resetSessionState() {
    participants.value = []
    localParticipant.value = null
    localScreenShareTrack.value = null
    activeSpeakers.value = new Set()
    screenWatchers.value = []
    isMicrophoneEnabled.value = false
    isCameraEnabled.value = false
    isScreenSharing.value = false
    mediaToggling.value = false
    clearRemoteAudio()
    revision.value++
  }

  function sendScreenWatch(sharerIdentity: string, watching: boolean) {
    const lp = room.value?.localParticipant
    if (!lp || !connected.value) return
    try {
      lp.publishData(
        textEncoder.encode(JSON.stringify({ type: 'screen-watch', watching })),
        { reliable: true, destinationIdentities: [sharerIdentity] }
      )
    } catch (e) {
      console.warn('Falha ao avisar sobre screen share:', e)
    }
  }

  function handleDataReceived(payload: Uint8Array, participant?: RemoteParticipant) {
    try {
      const msg = JSON.parse(textDecoder.decode(payload))
      if (msg?.type !== 'screen-watch' || !participant) return
      const id = participant.identity
      if (msg.watching) {
        if (!screenWatchers.value.includes(id)) {
          screenWatchers.value = [...screenWatchers.value, id]
          revision.value++
        }
      } else if (screenWatchers.value.includes(id)) {
        screenWatchers.value = screenWatchers.value.filter(i => i !== id)
        revision.value++
      }
    } catch {
      // payload não reconhecido
    }
  }

  function syncMediaFlags(source: Track.Source, enabled: boolean) {
    if (source === Track.Source.Microphone) isMicrophoneEnabled.value = enabled
    else if (source === Track.Source.Camera) isCameraEnabled.value = enabled
  }

  async function enumerateDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const mics = devices.filter(d => d.kind === 'audioinput')
      const speakers = devices.filter(d => d.kind === 'audiooutput')
      const cams = devices.filter(d => d.kind === 'videoinput')
      audioDevices.value = [...mics, ...speakers]
      videoDevices.value = cams

      // Seleciona o primeiro dispositivo real quando não há escolha válida
      // (deviceId vazio = sem permissão ainda; mantém o que já está salvo)
      const pickDefault = (list: MediaDeviceInfo[], current: string) =>
        list.some(d => d.deviceId && d.deviceId === current)
          ? current
          : (list.find(d => d.deviceId)?.deviceId || '')
      selectedAudioInput.value = pickDefault(mics, selectedAudioInput.value)
      selectedAudioOutput.value = pickDefault(speakers, selectedAudioOutput.value)
      selectedVideoInput.value = pickDefault(cams, selectedVideoInput.value)
    } catch (e) {
      console.error('Erro ao listar dispositivos:', e)
    }
  }

  async function connect(channelId: string) {
    desiredChannelId = channelId
    if (connecting.value) {
      // Já há uma conexão em andamento: ela própria vai redirecionar para o
      // canal desejado quando terminar (veja o bloco finally). Evita ignorar
      // a troca de canal disparada durante o connecting.
      return
    }
    if (connected.value && joinedChannelId.value === channelId) return
    if (room.value) await disconnect()

    connecting.value = true

    try {
      const { serverUrl, token, roomName } = await livekitService.getToken(channelId)
      currentRoomName.value = roomName
      joinedChannelId.value = channelId

      const lkRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
      })

      lkRoom.on(RoomEvent.Connected, () => {
        connected.value = true
        reconnecting.value = false
        localParticipant.value = markRaw(lkRoom.localParticipant)
        touch()
      })

      lkRoom.on(RoomEvent.ParticipantConnected, (participant) => {
        touch()
        if (!document.hasFocus()) {
          sendNotification(
            participant.name || 'Alguém',
            'Entrou na chamada de voz'
          )
        }
      })

      lkRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
        if (screenWatchers.value.includes(participant.identity)) {
          screenWatchers.value = screenWatchers.value.filter(i => i !== participant.identity)
          revision.value++
        }
        touch()
      })

      lkRoom.on(RoomEvent.TrackSubscribed, (_track, publication, participant) => {
        touch()
        if (publication.source === Track.Source.ScreenShare) {
          sendScreenWatch(participant.identity, true)
        }
      })

      lkRoom.on(RoomEvent.TrackUnsubscribed, (_track, publication, participant) => {
        touch()
        if (publication.source === Track.Source.ScreenShare) {
          sendScreenWatch(participant.identity, false)
        }
      })

      lkRoom.on(RoomEvent.TrackPublished, touch)
      lkRoom.on(RoomEvent.TrackUnpublished, touch)
      lkRoom.on(RoomEvent.TrackMuted, (track, participant) => {
        if (participant === lkRoom.localParticipant) syncMediaFlags(track.source, false)
        touch()
      })
      lkRoom.on(RoomEvent.TrackUnmuted, (track, participant) => {
        if (participant === lkRoom.localParticipant) syncMediaFlags(track.source, true)
        touch()
      })

      lkRoom.on(RoomEvent.LocalTrackPublished, (_publication, participant) => {
        if (participant === lkRoom.localParticipant) {
          // noop — hook para futuros pós-processamentos
        }
        touch()
      })

      lkRoom.on(RoomEvent.LocalTrackUnpublished, (publication) => {
        if (publication.source === Track.Source.ScreenShare) {
          localScreenShareTrack.value = null
          isScreenSharing.value = false
          screenWatchers.value = []
        }
        touch()
      })

      lkRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        activeSpeakers.value = new Set(speakers.map(s => s.identity))
      })

      lkRoom.on(RoomEvent.Reconnecting, () => {
        reconnecting.value = true
      })

      lkRoom.on(RoomEvent.Reconnected, () => {
        reconnecting.value = false
        touch()
      })

      lkRoom.on(RoomEvent.DataReceived, handleDataReceived)

      lkRoom.on(RoomEvent.Disconnected, () => {
        connected.value = false
        reconnecting.value = false
        room.value = null
        joinedChannelId.value = null
        resetSessionState()
      })

      await lkRoom.connect(serverUrl, token)
      room.value = markRaw(lkRoom)
      touch()

      // Patch otimista na UI (sidebar) — refresh corrige depois
      try {
        const { useAuthStore } = await import('@/stores/useAuthStore')
        const { useVoiceStateStore } = await import('@/stores/useVoiceStateStore')
        const me = useAuthStore().user
        if (me) {
          useVoiceStateStore().localJoin(me.id, me.displayName || me.username, channelId)
        }
        setTimeout(() => useVoiceStateStore().refresh(), 1500)
      } catch {}

      // Habilita o microfone na entrada — dispara o pedido de permissão
      // do navegador. Se negado/ausente, entra mudo sem quebrar a chamada.
      try {
        await lkRoom.localParticipant.setMicrophoneEnabled(true, {
          deviceId: selectedAudioInput.value || undefined,
          ...audioCaptureDefaults,
        })
        isMicrophoneEnabled.value = true
      } catch (e) {
        console.warn('Microfone não habilitado automaticamente:', (e as Error)?.message || e)
      }

      touch()

      await enumerateDevices()
    } catch (e) {
      console.error('Erro ao conectar sala:', e)
      joinedChannelId.value = null
      throw e
    } finally {
      connecting.value = false
      // Se o usuário trocou de canal durante esta conexão, reconecta no desejado
      if (desiredChannelId && desiredChannelId !== joinedChannelId.value) {
        connect(desiredChannelId)
      }
    }
  }

  async function disconnect() {
    if (room.value) {
      // Avisa o backend IMEDIATAMENTE (sidebar atualiza na hora, sem webhook)
      const leavingChannel = joinedChannelId.value
      if (leavingChannel) {
        livekitService.notifyLeft(leavingChannel).catch(() => {})
      }

      // Patch otimista na UI antes de derrubar a sessão
      try {
        const { useAuthStore } = await import('@/stores/useAuthStore')
        const { useVoiceStateStore } = await import('@/stores/useVoiceStateStore')
        const me = useAuthStore().user
        if (me) {
          useVoiceStateStore().localLeave(me.id)
          setTimeout(() => useVoiceStateStore().refresh(), 1200)
        }
      } catch {}

      const lkRoom = room.value
      room.value = null
      await lkRoom.disconnect()
      connected.value = false
      reconnecting.value = false
      currentRoomName.value = null
      joinedChannelId.value = null
      resetSessionState()
    }
  }

  async function toggleMicrophone() {
    const lp = localParticipant.value
    if (!lp || mediaToggling.value) return
    mediaToggling.value = true
    try {
      const enabled = !isMicrophoneEnabled.value
      await lp.setMicrophoneEnabled(
        enabled,
        {
          deviceId: selectedAudioInput.value || undefined,
          ...audioCaptureDefaults,
        }
      )
      isMicrophoneEnabled.value = enabled
    } finally {
      mediaToggling.value = false
    }
  }

  async function toggleCamera() {
    const lp = localParticipant.value
    if (!lp || mediaToggling.value) return
    mediaToggling.value = true
    try {
      const enabled = !isCameraEnabled.value
      await lp.setCameraEnabled(
        enabled,
        selectedVideoInput.value ? { deviceId: selectedVideoInput.value } : undefined
      )
      isCameraEnabled.value = enabled
    } finally {
      mediaToggling.value = false
    }
  }

  async function startScreenShare(opts?: { resolution?: ScreenResolution; fps?: ScreenFPS; includeAudio?: boolean }) {
    if (!localParticipant.value) return
    const resolution = opts?.resolution ?? screenShareResolution.value
    const fps = opts?.fps ?? screenShareFPS.value
    const includeAudio = opts?.includeAudio ?? true
    const params = getScreenShareEncodingParams(resolution, fps)
    try {
      const constraints: any = {
        video: {
          width: { ideal: params.width },
          height: { ideal: params.height },
        },
      }
      if (includeAudio) {
        constraints.audio = {
          channelCount: 2,
          sampleRate: 48000,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          // Chrome 141+: exclui o áudio da PRÓPRIA chamada (renderizado
          // por esta aba) do loopback do sistema — elimina o eco para
          // quem assiste. Browsers antigos ignoram a constraint.
          restrictOwnAudio: true,
        }
      }

      const stream = await navigator.mediaDevices.getDisplayMedia(constraints)
      await publishScreenShareTracks(stream, params)
    } catch (e) {
      isScreenSharing.value = false
      throw e
    }
  }

  async function switchScreenShare() {
    if (!localParticipant.value || !isScreenSharing.value) return
    const params = getScreenShareEncodingParams(screenShareResolution.value, screenShareFPS.value)
    try {
      const constraints: any = {
        video: {
          width: { ideal: params.width },
          height: { ideal: params.height },
        },
      }

      const stream = await navigator.mediaDevices.getDisplayMedia(constraints)
      await replaceScreenShareTracks(stream, params)
    } catch (e) {
      throw e
    }
  }

  async function publishScreenShareTracks(stream: MediaStream, params: { width: number; height: number; maxBitrate: number; maxFramerate: number }) {
    if (!localParticipant.value) return
    const videoTrack = stream.getVideoTracks()[0]
    const audioTrack = stream.getAudioTracks()[0]

    if (!videoTrack) {
      throw new Error('Nenhuma trilha de video capturada')
    }

    const videoPub = await localParticipant.value.publishTrack(videoTrack, {
      source: Track.Source.ScreenShare,
      videoEncoding: { maxBitrate: params.maxBitrate, maxFramerate: params.maxFramerate },
      simulcast: true,
      degradationPreference: 'balanced',
    })

    if (audioTrack) {
      await localParticipant.value.publishTrack(audioTrack, {
        source: Track.Source.ScreenShareAudio,
      })
    }

    localScreenShareTrack.value = videoPub?.videoTrack as LocalVideoTrack ?? null
    isScreenSharing.value = true
    screenWatchers.value = []

    videoTrack.onended = () => {
      if (isScreenSharing.value) {
        stopScreenShare()
      }
    }
  }

  async function replaceScreenShareTracks(stream: MediaStream, params: { width: number; height: number; maxBitrate: number; maxFramerate: number }) {
    if (!localParticipant.value) return
    const lp = localParticipant.value
    const oldTracks: { pub: any; track: any }[] = []

    for (const pub of Array.from(lp.trackPublications.values())) {
      if ((pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) && pub.track) {
        oldTracks.push({ pub, track: pub.track })
      }
    }

    for (const { track } of oldTracks) {
      try {
        await lp.unpublishTrack(track, true)
      } catch {}
    }

    localScreenShareTrack.value = null

    await publishScreenShareTracks(stream, params)
  }

  async function stopScreenShare() {
    if (!localParticipant.value) return
    const lp = localParticipant.value
    try {
      await lp.setScreenShareEnabled(false)
    } catch (e) {
      console.warn('Falha ao desabilitar screen share:', e)
    }
    for (const pub of Array.from(lp.trackPublications.values())) {
      if ((pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) && pub.track) {
        try {
          await lp.unpublishTrack(pub.track as any, true)
        } catch (e) {
          console.warn('Falha ao remover publicação de tela:', e)
        }
      }
    }
    localScreenShareTrack.value = null
    isScreenSharing.value = false
    screenWatchers.value = []
  }

  function getCameraTrack(participant: RemoteParticipant): RemoteVideoTrack | undefined {
    const pub = participant.getTrackPublication(Track.Source.Camera)
    return pub?.isSubscribed && !pub.isMuted ? (pub.videoTrack as RemoteVideoTrack | undefined) : undefined
  }

  function getRemoteScreenShare(participant: RemoteParticipant): RemoteVideoTrack | undefined {
    const pub = participant.getTrackPublication(Track.Source.ScreenShare)
    return pub?.isSubscribed && !pub.isMuted ? (pub.videoTrack as RemoteVideoTrack | undefined) : undefined
  }

  function getLocalCameraTrack(): LocalVideoTrack | undefined {
    if (!localParticipant.value || !isCameraEnabled.value) return undefined
    const pub = localParticipant.value.getTrackPublication(Track.Source.Camera)
    return pub && !pub.isMuted ? (pub.videoTrack as LocalVideoTrack | undefined) : undefined
  }

  function getLocalScreenShare(): LocalVideoTrack | undefined {
    return localScreenShareTrack.value ?? undefined
  }

  function setRemoteScreenQuality(participant: RemoteParticipant, quality: VideoQuality | 'auto') {
    const pub = participant.getTrackPublication(Track.Source.ScreenShare)
    if (!pub) return
    try {
      if (quality === 'auto') {
        // restaura o adaptive stream (qualidade conforme tamanho do elemento)
        ;(pub as any).requestedMaxQuality = undefined
        ;(pub as any).requestedVideoDimensions = undefined
        ;(pub as any).emitTrackUpdate()
      } else {
        pub.setVideoQuality(quality)
      }
    } catch (e) {
      console.warn('Falha ao ajustar qualidade da transmissão:', e)
    }
  }

  async function setAudioInputDevice(deviceId: string) {
    selectedAudioInput.value = deviceId
    if (localParticipant.value) {
      await localParticipant.value.setMicrophoneEnabled(true, { deviceId })
    }
  }

  async function setAudioOutputDevice(deviceId: string) {
    selectedAudioOutput.value = deviceId
  }

  async function setVideoInputDevice(deviceId: string) {
    selectedVideoInput.value = deviceId
    if (localParticipant.value) {
      await localParticipant.value.setCameraEnabled(true, { deviceId })
    }
  }

  function setScreenShareQuality(resolution: ScreenResolution, fps: ScreenFPS) {
    screenShareResolution.value = resolution
    screenShareFPS.value = fps
  }

  return {
    room,
    connected,
    connecting,
    reconnecting,
    currentRoomName,
    joinedChannelId,
    participants,
    localParticipant,
    localTracks,
    remoteParticipants,
    revision,
    localScreenShareTrack,
    activeSpeakers,
    screenWatchers,
    volumes,
    deafened,
    volumeFor,
    setVolume,
    toggleDeafen,
    screenShareAudioMuted,
    toggleScreenShareAudio,
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenSharing,
    selectedAudioInput,
    selectedAudioOutput,
    selectedVideoInput,
    screenShareResolution,
    screenShareFPS,
    mediaToggling,
    audioDevices,
    videoDevices,
    enumerateDevices,
    connect,
    disconnect,
    toggleMicrophone,
    toggleCamera,
    startScreenShare,
    switchScreenShare,
    stopScreenShare,
    getCameraTrack,
    getRemoteScreenShare,
    getLocalCameraTrack,
    getLocalScreenShare,
    setRemoteScreenQuality,
    setAudioInputDevice,
    setAudioOutputDevice,
    setVideoInputDevice,
    setScreenShareQuality,
  }
})
