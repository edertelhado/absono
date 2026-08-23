import { defineStore } from 'pinia'
import { ref, shallowRef, computed, watch, markRaw } from 'vue'
import type { RemoteParticipant, LocalParticipant, RemoteVideoTrack, LocalVideoTrack, LocalAudioTrack, RemoteAudioTrack } from 'livekit-client'
import { Room, RoomEvent, Track, VideoQuality } from 'livekit-client'
import { KrispNoiseFilter, isKrispNoiseFilterSupported } from '@livekit/krisp-noise-filter'
import type { KrispNoiseFilterProcessor } from '@livekit/krisp-noise-filter'
import { livekitService } from '@/services/livekit'
import { getScreenShareEncodingParams } from '@/utils/livekit-presets'
import { sendNotification } from '@/services/notification'

export const useVoiceStore = defineStore('voice', () => {
  const room = shallowRef<Room | null>(null)
  const connected = ref(false)
  const connecting = ref(false)
  const reconnecting = ref(false)
  const currentRoomName = ref<string | null>(null)
  const joinedChannelId = ref<string | null>(null)

  const participants = shallowRef<RemoteParticipant[]>([])
  const localParticipant = shallowRef<LocalParticipant | null>(null)

  const isMicrophoneEnabled = ref(false)
  const isCameraEnabled = ref(false)
  const isScreenSharing = ref(false)

  const selectedAudioInput = ref<string>('')
  const selectedAudioOutput = ref<string>('')
  const selectedVideoInput = ref<string>('')

  const screenShareResolution = ref<'480p' | '720p' | '1080p' | '2k' | 'ultrawide'>('720p')
  const screenShareFPS = ref<15 | 30 | 60>(30)

  const noiseSuppression = ref(false)
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

  function effectiveVolume(identity: string): number {
    return deafened.value ? 0 : (volumes.value[identity] ?? 100) / 100
  }

  function applyVolumeToEl(el: HTMLAudioElement) {
    const track = (el as any).__lkTrack as RemoteAudioTrack | undefined
    const identity = (el as any).__identity as string
    try {
      track?.setVolume(effectiveVolume(identity))
    } catch {
      // track pode ter sido despublicada no meio do ajuste
    }
  }

  function syncRemoteAudio() {
    const wanted = new Map<string, { track: RemoteAudioTrack; identity: string }>()
    for (const p of participants.value as RemoteParticipant[]) {
      for (const pub of Array.from(p.audioTrackPublications.values())) {
        const track = pub.audioTrack as RemoteAudioTrack | undefined
        if (pub.isSubscribed && track) {
          wanted.set(pub.trackSid, { track, identity: p.identity })
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
      noiseSuppression.value = !!s.noiseSuppression
    } catch {
      // configurações corrompidas — segue com defaults
    }
  }

  loadVoiceSettings()

  watch(
    [selectedAudioInput, selectedAudioOutput, selectedVideoInput, screenShareResolution, screenShareFPS, noiseSuppression],
    () => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        audioInput: selectedAudioInput.value,
        audioOutput: selectedAudioOutput.value,
        videoInput: selectedVideoInput.value,
        shareResolution: screenShareResolution.value,
        shareFps: screenShareFPS.value,
        noiseSuppression: noiseSuppression.value,
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
      audioDevices.value = devices.filter(d => d.kind === 'audioinput' || d.kind === 'audiooutput')
      videoDevices.value = devices.filter(d => d.kind === 'videoinput')
    } catch (e) {
      console.error('Erro ao listar dispositivos:', e)
    }
  }

  async function connect(channelId: string) {
    if (connecting.value) return
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
          void applyNoiseSuppressionIfEnabled()
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

      // Habilita o microfone na entrada — dispara o pedido de permissão
      // do navegador. Se negado/ausente, entra mudo sem quebrar a chamada.
      try {
        await lkRoom.localParticipant.setMicrophoneEnabled(true, selectedAudioInput.value ? { deviceId: selectedAudioInput.value } : undefined)
        isMicrophoneEnabled.value = true
        if (noiseSuppression.value) {
          void applyNoiseSuppressionIfEnabled()
        }
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
    }
  }

  async function disconnect() {
    if (room.value) {
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
        selectedAudioInput.value ? { deviceId: selectedAudioInput.value } : undefined
      )
      isMicrophoneEnabled.value = enabled
      if (enabled && noiseSuppression.value) {
        await applyNoiseSuppressionIfEnabled()
      }
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

  async function startScreenShare() {
    if (!localParticipant.value) return
    const params = getScreenShareEncodingParams(screenShareResolution.value, screenShareFPS.value)
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: params.width },
          height: { ideal: params.height },
          frameRate: { ideal: params.maxFramerate },
        },
        audio: {
          channelCount: 2,
          sampleRate: 48000,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })

      const videoTrack = stream.getVideoTracks()[0]
      const audioTrack = stream.getAudioTracks()[0]

      if (!videoTrack) {
        throw new Error('Nenhuma trilha de video capturada')
      }

      const videoPub = await localParticipant.value.publishTrack(videoTrack, {
        source: Track.Source.ScreenShare,
        videoEncoding: { maxBitrate: params.maxBitrate, maxFramerate: params.maxFramerate },
        simulcast: true,
        degradationPreference: 'maintain-resolution',
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
    } catch (e) {
      isScreenSharing.value = false
      throw e
    }
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

  async function applyNoiseSuppressionIfEnabled() {
    if (!noiseSuppression.value) return
    const lp = localParticipant.value
    if (!lp || !isKrispNoiseFilterSupported()) return
    const pub = lp.getTrackPublication(Track.Source.Microphone)
    const track = pub?.audioTrack as LocalAudioTrack | undefined
    if (!track) return
    try {
      let proc = (track as any).processor as KrispNoiseFilterProcessor | undefined
      if (!proc || proc.name !== 'livekit-noise-filter') {
        proc = KrispNoiseFilter()
        await track.setProcessor(proc)
      }
      await proc.setEnabled(true)
    } catch (e) {
      console.warn('Não foi possível ativar a supressão de ruído:', e)
    }
  }

  async function setNoiseSuppression(on: boolean) {
    noiseSuppression.value = on
    if (!on) {
      const lp = localParticipant.value
      const track = lp?.getTrackPublication(Track.Source.Microphone)?.audioTrack as LocalAudioTrack | undefined
      const proc = (track as any)?.processor as KrispNoiseFilterProcessor | undefined
      if (proc?.name === 'livekit-noise-filter') {
        try {
          await proc.setEnabled(false)
        } catch {}
      }
      return
    }
    await applyNoiseSuppressionIfEnabled()
  }

  function setScreenShareQuality(resolution: '480p' | '720p' | '1080p' | '2k' | 'ultrawide', fps: 15 | 30 | 60) {
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
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenSharing,
    selectedAudioInput,
    selectedAudioOutput,
    selectedVideoInput,
    screenShareResolution,
    screenShareFPS,
    noiseSuppression,
    mediaToggling,
    audioDevices,
    videoDevices,
    enumerateDevices,
    connect,
    disconnect,
    toggleMicrophone,
    toggleCamera,
    startScreenShare,
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
    setNoiseSuppression,
  }
})
