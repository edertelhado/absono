<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import type { RemoteParticipant, RemoteVideoTrack, LocalVideoTrack } from 'livekit-client'
import { VideoQuality } from 'livekit-client'
import { useChannelStore } from '@/stores/useChannelStore'
import { useVoiceStore } from '@/stores/useVoiceStore'
import { useToast } from '@/composables/useToast'
import { RESOLUTION_OPTIONS, FPS_OPTIONS } from '@/utils/livekit-presets'
import type { ScreenResolution, ScreenFPS } from '@/utils/livekit-presets'
import {
  DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription,
  PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent,
} from 'reka-ui'
import {
  PhMicrophone, PhMicrophoneSlash, PhVideoCamera, PhVideoCameraSlash,
  PhMonitor, PhPhoneDisconnect, PhSpeakerHigh, PhSpeakerSlash,
  PhSpinner, PhStar, PhArrowsOutSimple,
  PhCopy, PhEye, PhGear, PhArrowClockwise, PhUser, PhX,
} from '@phosphor-icons/vue'

const toast = useToast()
const channelStore = useChannelStore()
const voiceStore = useVoiceStore()

const channel = computed(() => channelStore.currentChannel)
const connected = computed(() => voiceStore.connected)
const connecting = computed(() => voiceStore.connecting)
const isActiveCall = computed(() => connected.value && voiceStore.joinedChannelId === channel.value?.id)

const showSettings = ref(false)
const showShareDialog = ref(false)
const shareResolution = ref<ScreenResolution>('720p')
const shareFps = ref<ScreenFPS>(30)
const shareIncludeAudio = ref(true)
const pinnedIdentity = ref<string | null>(null)

interface Tile {
  key: string
  name: string
  isLocal: boolean
  cameraTrack: RemoteVideoTrack | LocalVideoTrack | null
  micMuted: boolean
  isSpeaking: boolean
}

interface ScreenShareInfo {
  key: string
  identity: string
  name: string
  isOwn: boolean
  track: RemoteVideoTrack | LocalVideoTrack
}

const tiles = computed<Tile[]>(() => {
  void voiceStore.revision
  const list: Tile[] = []

  for (const p of voiceStore.participants as RemoteParticipant[]) {
    list.push({
      key: p.identity,
      name: p.name || p.identity,
      isLocal: false,
      cameraTrack: voiceStore.getCameraTrack(p) ?? null,
      micMuted: !p.isMicrophoneEnabled,
      isSpeaking: voiceStore.activeSpeakers.has(p.identity),
    })
  }

  const lp = voiceStore.localParticipant
  if (lp) {
    list.push({
      key: lp.identity,
      name: 'Você',
      isLocal: true,
      cameraTrack: voiceStore.getLocalCameraTrack() ?? null,
      micMuted: !voiceStore.isMicrophoneEnabled,
      isSpeaking: voiceStore.activeSpeakers.has(lp.identity),
    })
  }

  return list
})

const screenShare = computed<ScreenShareInfo | null>(() => {
  void voiceStore.revision

  const ownTrack = voiceStore.getLocalScreenShare()
  if (ownTrack) {
    return { key: 'own-screen', identity: 'own', name: 'Você está compartilhando sua tela', isOwn: true, track: ownTrack }
  }

  for (const p of voiceStore.participants as RemoteParticipant[]) {
    const track = voiceStore.getRemoteScreenShare(p)
    if (track) {
      return { key: `${p.identity}-screen`, identity: p.identity, name: `Tela de ${p.name || p.identity}`, isOwn: false, track }
    }
  }
  return null
})

const pinnedTile = computed<Tile | null>(() => {
  if (!pinnedIdentity.value) return null
  return tiles.value.find(t => t.key === pinnedIdentity.value) ?? null
})

const watcherNames = computed<string[]>(() => {
  void voiceStore.revision
  return voiceStore.screenWatchers
    .map(id => {
      const p = (voiceStore.participants as RemoteParticipant[]).find(x => x.identity === id)
      return p ? (p.name || id) : null
    })
    .filter((n): n is string => Boolean(n))
})

watch(watcherNames, (now, prev) => {
  const added = now.filter(n => !(prev ?? []).includes(n))
  if (added.length > 0 && voiceStore.isScreenSharing) {
    toast.info(`${added.join(', ')} começou a assistir sua tela`)
  }
})

const videoEls = new Map<string, HTMLVideoElement>()
let spotlightVideoEl: HTMLVideoElement | null = null

function bindVideo(el: unknown, key: string, track: RemoteVideoTrack | LocalVideoTrack | null | undefined) {
  const media = el as HTMLVideoElement | null
  if (!media) return
  videoEls.set(key, media)
  const current = (media as any).__lkTrack as RemoteVideoTrack | LocalVideoTrack | undefined
  if (current === track) return
  current?.detach(media)
  if (track) {
    track.attach(media)
    ;(media as any).__lkTrack = track
  } else {
    delete (media as any).__lkTrack
  }
}

function bindSpotlight(el: unknown, entry: ScreenShareInfo) {
  bindVideo(el, entry.key, entry.track)
  spotlightVideoEl = el as HTMLVideoElement | null
}

function detachStale() {
  for (const [key, el] of videoEls) {
    if (!el.isConnected) {
      const t = (el as any).__lkTrack as RemoteVideoTrack | LocalVideoTrack | undefined
      t?.detach(el)
      videoEls.delete(key)
    }
  }
}

watch([tiles, screenShare], () => {
  nextTick(detachStale)
})

watch(() => channel.value?.id, (id) => {
  const ch = channel.value
  // só troca de sala ao navegar entre canais de VOZ; canais de texto
  // mantêm a chamada e o compartilhamento ativos
  if (ch?.type === 'VOICE' && voiceStore.joinedChannelId && id !== voiceStore.joinedChannelId) {
    voiceStore.disconnect()
    pinnedIdentity.value = null
  }
})

onUnmounted(() => {
  for (const el of videoEls.values()) {
    const t = (el as any).__lkTrack as RemoteVideoTrack | LocalVideoTrack | undefined
    t?.detach(el)
  }
  videoEls.clear()
  spotlightVideoEl = null
})

function togglePin(tile: Tile) {
  pinnedIdentity.value = pinnedIdentity.value === tile.key ? null : tile.key
}

const pipSupported = computed(() =>
  typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled
)

// delegações à store (áudio remoto vive fora deste componente)
const volumeFor = (identity: string) => voiceStore.volumeFor(identity)
const effectiveVolume = (identity: string) => (voiceStore.deafened ? 0 : voiceStore.volumeFor(identity))
const setVolume = (identity: string, v: number) => voiceStore.setVolume(identity, v)
const toggleDeafen = () => voiceStore.toggleDeafen()
const deafened = computed(() => voiceStore.deafened)

async function togglePip() {
  const el = spotlightVideoEl
  if (!el) return
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture()
    } else {
      await el.requestPictureInPicture()
    }
  } catch {
    toast.warning('Picture-in-Picture não disponível para este vídeo')
  }
}

const remoteQuality = ref<VideoQuality | 'auto'>('auto')

function applyRemoteQuality(quality: VideoQuality | 'auto') {
  const share = screenShare.value
  if (share && !share.isOwn) {
    const participant = (voiceStore.participants as RemoteParticipant[]).find(p => p.identity === share.identity)
    if (participant) {
      voiceStore.setRemoteScreenQuality(participant, quality)
    }
  }
}

async function joinCall() {
  if (!channel.value) return
  try {
    await voiceStore.connect(channel.value.id)
  } catch (e: any) {
    console.error('Erro ao conectar à chamada:', e)
    toast.error(e?.message ? `Erro ao conectar à chamada: ${e.message}` : 'Erro ao conectar à chamada')
  }
}

async function leaveCall() {
  pinnedIdentity.value = null
  await voiceStore.disconnect()
}

async function toggleMicrophone() {
  try {
    await voiceStore.toggleMicrophone()
  } catch (e: any) {
    console.error('Erro ao alternar microfone:', e)
    toast.error('Não foi possível acessar o microfone — verifique as permissões do navegador')
  }
}

async function toggleCamera() {
  try {
    await voiceStore.toggleCamera()
  } catch (e: any) {
    console.error('Erro ao alternar câmera:', e)
    toast.error('Não foi possível acessar a câmera — verifique as permissões do navegador')
  }
}

async function toggleScreenShare() {
  if (voiceStore.isScreenSharing) {
    try {
      await voiceStore.stopScreenShare()
    } catch (e: any) {
      console.error('Erro ao parar compartilhamento:', e)
    }
    return
  }
  shareResolution.value = voiceStore.screenShareResolution
  shareFps.value = voiceStore.screenShareFPS
  shareIncludeAudio.value = true
  showShareDialog.value = true
}

async function confirmScreenShare() {
  showShareDialog.value = false
  try {
    await voiceStore.startScreenShare({
      resolution: shareResolution.value,
      fps: shareFps.value,
      includeAudio: shareIncludeAudio.value,
    })
  } catch (e: any) {
    console.error('Erro no compartilhamento de tela:', e)
    if (e?.name !== 'NotAllowedError') {
      toast.error('Erro ao compartilhar a tela')
    }
  }
}

async function switchScreen() {
  try {
    await voiceStore.switchScreenShare()
  } catch (e: any) {
    if (e?.name !== 'NotAllowedError') {
      toast.error('Erro ao trocar tela')
    }
  }
}

const spotlightAreaRef = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)

function onFullscreenChange() {
  isFullscreen.value = document.fullscreenElement === spotlightAreaRef.value
}

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
})

async function toggleFullscreen() {
  const el = spotlightAreaRef.value
  if (!el) return
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await el.requestFullscreen()
    }
  } catch {
    toast.warning('Tela cheia não disponível para este elemento')
  }
}
</script>

<template>
  <div class="call-panel">
    <div class="call-header" v-if="channel">
      <span class="call-icon">{{ channel.type === 'VOICE' ? '🔊' : '📹' }}</span>
      <span class="call-name">{{ channel.name }}</span>
    </div>

    <div class="call-content">
      <div v-if="!isActiveCall && !connecting" class="call-lobby">
        <div class="lobby-icon">{{ channel?.type === 'VOICE' ? '🔊' : '📹' }}</div>
        <h3>{{ channel?.name }}</h3>
        <p class="lobby-description">{{ channel?.description || 'Entrar na chamada' }}</p>
        <button class="btn btn-primary btn-lg" @click="joinCall">
          Entrar na Chamada
        </button>
      </div>

      <div v-else-if="connecting" class="call-connecting">
        <PhSpinner :size="48" class="spin" />
        <p>Conectando...</p>
      </div>

      <div v-else class="call-active">
        <div v-if="voiceStore.reconnecting" class="reconnect-overlay">
          <PhSpinner :size="28" class="spin" />
          <span>Reconectando à chamada...</span>
        </div>

        <div v-if="pinnedTile || screenShare" ref="spotlightAreaRef" class="spotlight-area">
          <template v-if="pinnedTile">
            <span class="share-badge pinned-badge">
              <PhStar :size="14" />
              {{ pinnedTile.name }} (fixado)
              <button class="btn btn-ghost btn-sm unpin-btn" @click="pinnedIdentity = null">Remover</button>
            </span>
            <video
              v-if="pinnedTile.cameraTrack"
              :ref="(el) => { const pt = pinnedTile; if (!pt?.cameraTrack) return; bindVideo(el, `pin-${pt.key}`, pt.cameraTrack) }"
              autoplay
              playsinline
              :muted="pinnedTile.isLocal"
              class="spotlight-video"
            ></video>
            <div v-else class="spotlight-avatar">
              <div class="avatar-placeholder avatar-lg">
                <PhUser :size="48" />
              </div>
            </div>
          </template>
          <template v-else-if="screenShare">
            <span class="share-badge" :class="{ own: screenShare.isOwn }">
              <PhMonitor :size="14" />
              {{ screenShare.name }}
            </span>
            <video
              :ref="(el) => { const ss = screenShare; if (!ss) return; bindSpotlight(el, ss) }"
              autoplay
              playsinline
              class="spotlight-video"
            ></video>
            <div class="spotlight-actions">
              <select
                v-if="!screenShare.isOwn"
                :value="remoteQuality"
                class="select-trigger quality-select"
                @change="(e: Event) => { const q = (e.target as HTMLSelectElement).value as VideoQuality | 'auto'; remoteQuality = q; applyRemoteQuality(q) }"
              >
                <option value="auto">Qualidade: Auto</option>
                <option :value="VideoQuality.HIGH">Qualidade: Alta</option>
                <option :value="VideoQuality.MEDIUM">Qualidade: Média</option>
                <option :value="VideoQuality.LOW">Qualidade: Baixa</option>
              </select>
              <button v-if="pipSupported" class="btn btn-icon btn-sm" @click="togglePip" title="Picture-in-Picture">
                <PhCopy :size="16" />
              </button>
              <button class="btn btn-icon btn-sm" @click="toggleFullscreen" :title="isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'">
                <PhArrowsOutSimple v-if="!isFullscreen" :size="16" />
                <PhX v-else :size="16" />
              </button>
            </div>
            <div v-if="screenShare.isOwn && watcherNames.length" class="watchers-badge">
              <PhEye :size="14" />
              <span class="watchers-count">{{ watcherNames.length }} assistindo</span>
              <span class="watcher-names">{{ watcherNames.join(', ') }}</span>
            </div>
          </template>
        </div>

        <div class="participants-grid" :class="{ compact: !!(pinnedTile || screenShare) }">
          <div
            v-for="tile in tiles"
            :key="tile.key"
            class="participant-card"
            :class="{ local: tile.isLocal, speaking: tile.isSpeaking, pinned: pinnedIdentity === tile.key }"
            @click="togglePin(tile)"
          >
            <video
              v-if="tile.cameraTrack"
              :ref="(el) => bindVideo(el, tile.key, tile.cameraTrack)"
              autoplay
              playsinline
              :muted="tile.isLocal"
              class="tile-video"
            ></video>
            <div v-else class="avatar-wrap">
              <div class="avatar-placeholder">
                <PhUser :size="32" />
              </div>
            </div>
            <span class="participant-name">{{ tile.name }}</span>
            <PopoverRoot v-if="!tile.isLocal">
              <PopoverTrigger as-child>
                <button
                  class="volume-btn"
                  :class="{ muted: effectiveVolume(tile.key) === 0 }"
                  @click.stop
                  title="Volume do participante"
                >
                  {{ effectiveVolume(tile.key) }}%
                </button>
              </PopoverTrigger>
              <PopoverPortal>
                <PopoverContent side="top" :side-offset="8" class="popover-content">
                  <div class="volume-slider">
                    <span class="volume-label">Volume — {{ tile.name }}</span>
                    <input
                      type="range"
                      :value="volumeFor(tile.key)"
                      @input="(e: Event) => setVolume(tile.key, Number((e.target as HTMLInputElement).value))"
                      :min="0"
                      :max="100"
                      class="range-slider"
                    />
                  </div>
                </PopoverContent>
              </PopoverPortal>
            </PopoverRoot>
            <span v-if="tile.micMuted" class="mic-indicator">
              <PhMicrophoneSlash :size="14" />
            </span>
          </div>
        </div>

        <div class="call-controls">
          <button
            class="btn btn-lg"
            :class="voiceStore.isMicrophoneEnabled ? 'btn-primary' : 'btn-danger'"
            title="Microfone"
            @click="toggleMicrophone"
          >
            <PhMicrophone v-if="voiceStore.isMicrophoneEnabled" :size="20" />
            <PhMicrophoneSlash v-else :size="20" />
          </button>

          <button
            class="btn btn-lg"
            :class="deafened ? 'btn-danger' : 'btn-default'"
            @click="toggleDeafen"
            :title="deafened ? 'Desabafar' : 'Abafar (silenciar todos)'"
          >
            <PhSpeakerHigh v-if="!deafened" :size="20" />
            <PhSpeakerSlash v-else :size="20" />
          </button>

          <button
            class="btn btn-lg"
            :class="voiceStore.isCameraEnabled ? 'btn-primary' : 'btn-danger'"
            title="Câmera"
            @click="toggleCamera"
          >
            <PhVideoCamera v-if="voiceStore.isCameraEnabled" :size="20" />
            <PhVideoCameraSlash v-else :size="20" />
          </button>

          <button
            class="btn btn-lg"
            :class="voiceStore.isScreenSharing ? 'btn-primary' : 'btn-default'"
            title="Compartilhar tela"
            @click="toggleScreenShare"
          >
            <PhMonitor :size="20" />
          </button>

          <button
            v-if="voiceStore.isScreenSharing"
            class="btn btn-lg btn-default"
            title="Trocar tela/janela"
            @click="switchScreen"
          >
            <PhArrowClockwise :size="20" />
          </button>

          <button class="btn btn-lg btn-danger" title="Desconectar" @click="leaveCall">
            <PhPhoneDisconnect :size="20" />
          </button>

          <button class="btn btn-lg btn-default" title="Configurações de chamada" @click="showSettings = true">
            <PhGear :size="20" />
          </button>
        </div>
      </div>
    </div>
  </div>

  <DialogRoot v-model:open="showSettings">
    <DialogPortal>
      <DialogOverlay class="dialog-overlay" />
      <DialogContent class="dialog-content">
        <DialogTitle class="dialog-title">Configurações de Chamada</DialogTitle>
        <div class="form-group">
          <label class="form-label">Microfone</label>
          <div class="select-trigger w-full">
            <select v-model="voiceStore.selectedAudioInput">
              <option
                v-for="device in voiceStore.audioDevices.filter(d => d.kind === 'audioinput')"
                :key="device.deviceId"
                :value="device.deviceId"
              >{{ device.label }}</option>
            </select>
          </div>
        </div>

        <div class="form-group" style="margin-top: var(--space-md);">
          <label class="form-label">Alto-falante</label>
          <div class="select-trigger w-full">
            <select v-model="voiceStore.selectedAudioOutput">
              <option
                v-for="device in voiceStore.audioDevices.filter(d => d.kind === 'audiooutput')"
                :key="device.deviceId"
                :value="device.deviceId"
              >{{ device.label }}</option>
            </select>
          </div>
        </div>

        <div class="form-group" style="margin-top: var(--space-md);">
          <label class="form-label">Câmera</label>
          <div class="select-trigger w-full">
            <select v-model="voiceStore.selectedVideoInput">
              <option
                v-for="device in voiceStore.videoDevices"
                :key="device.deviceId"
                :value="device.deviceId"
              >{{ device.label }}</option>
            </select>
          </div>
        </div>

        <div class="form-group" style="margin-top: var(--space-md);">
          <label class="form-label">Áudio</label>
          <label class="toggle-row">
            <input
              type="checkbox"
              class="toggle-input"
              :checked="voiceStore.noiseSuppression"
              @change="(e: Event) => voiceStore.setNoiseSuppression((e.target as HTMLInputElement).checked)"
            />
            <span class="toggle-switch"></span>
            <span class="toggle-label">Supressão de ruído (IA)</span>
          </label>
          <div class="setting-hint">Reduz ruído do ambiente no seu microfone (Krisp). Suporte no Chrome/Edge.</div>
        </div>

        <div class="dialog-footer">
          <button class="btn btn-default" @click="showSettings = false">Fechar</button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <DialogRoot v-model:open="showShareDialog">
    <DialogPortal>
      <DialogOverlay class="dialog-overlay" />
      <DialogContent class="dialog-content">
        <DialogTitle class="dialog-title">Compartilhar Tela</DialogTitle>
        <div class="form-group">
          <label class="form-label">Resolução</label>
          <div class="select-trigger w-full">
            <select v-model="shareResolution">
              <option
                v-for="opt in RESOLUTION_OPTIONS"
                :key="opt.value"
                :value="opt.value"
              >{{ opt.label }}</option>
            </select>
          </div>
        </div>

        <div class="form-group" style="margin-top: var(--space-md);">
          <label class="form-label">FPS</label>
          <div class="select-trigger w-full">
            <select v-model="shareFps">
              <option
                v-for="opt in FPS_OPTIONS"
                :key="opt.value"
                :value="opt.value"
              >{{ opt.label }}</option>
            </select>
          </div>
        </div>

        <div class="form-group" style="margin-top: var(--space-md);">
          <label class="form-label">Áudio do Desktop</label>
          <label class="toggle-row">
            <input
              type="checkbox"
              class="toggle-input"
              v-model="shareIncludeAudio"
            />
            <span class="toggle-switch"></span>
            <span class="toggle-label">Compartilhar áudio do sistema</span>
          </label>
          <div class="setting-hint">Captura o áudio reproduzido no seu computador (Chrome/Edge). Marque "Compartilhar áudio" no diálogo do navegador.</div>
        </div>

        <div class="dialog-footer">
          <button class="btn btn-default" @click="showShareDialog = false">Cancelar</button>
          <button class="btn btn-primary" @click="confirmScreenShare">Iniciar</button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped lang="scss">
.call-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--absono-bg-base);
}

.call-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 0 var(--space-lg);
  height: 48px;
  min-height: 48px;
  border-bottom: 1px solid var(--absono-border);
  background-color: var(--absono-surface-1);
}

.call-icon {
  font-size: 18px;
}

.call-name {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--absono-text);
}

.call-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.remote-audio {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

.call-lobby {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;

  .lobby-icon {
    font-size: 64px;
    margin-bottom: var(--space-lg);
    opacity: 0.8;
  }

  h3 {
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 600;
    color: var(--absono-text);
    margin-bottom: var(--space-sm);
  }

  .lobby-description {
    color: var(--absono-text-muted);
    margin-bottom: var(--space-xl);
    font-size: 14px;
  }
}

.call-connecting {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--absono-text-muted);

  p {
    margin-top: var(--space-lg);
    font-size: 14px;
  }
}

.call-active {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.reconnect-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 14px;
  border-radius: var(--radius-md);
}

.spotlight-area {
  position: relative;
  flex: 1;
  min-height: 0;
  margin: var(--space-md) var(--space-md) 0;
  background: #000;
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--absono-border);
}

.spotlight-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;

  &.contain {
    object-fit: cover;
  }
}

.spotlight-avatar {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.share-badge {
  position: absolute;
  top: var(--space-sm);
  left: var(--space-sm);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 4px var(--space-sm);
  font-size: 12px;
  font-weight: 500;
  color: var(--absono-text);
  background: rgba(0, 0, 0, 0.6);
  border-radius: var(--radius-md);

  &.own {
    color: #7ee787;
  }

  &.pinned-badge {
    color: var(--absono-primary);
  }
}

.unpin-btn {
  color: var(--absono-text-muted);
}

.spotlight-actions {
  position: absolute;
  top: var(--space-sm);
  right: var(--space-sm);
  z-index: 2;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.quality-select {
  width: 160px;
  background: rgba(0, 0, 0, 0.6);
  border: none;

  select {
    color: #fff;
  }
}

.watchers-badge {
  position: absolute;
  bottom: var(--space-sm);
  left: var(--space-sm);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  max-width: calc(100% - 2 * var(--space-md));
  padding: 4px var(--space-sm);
  font-size: 12px;
  color: #7ee787;
  background: rgba(0, 0, 0, 0.6);
  border-radius: var(--radius-md);

  .watchers-count {
    font-weight: 600;
    white-space: nowrap;
  }

  .watcher-names {
    color: rgba(255, 255, 255, 0.85);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.participants-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-md);
  padding: var(--space-md);
  overflow-y: auto;
  align-content: start;

  &.compact {
    flex-shrink: 0;
    grid-template-columns: repeat(auto-fit, minmax(200px, 220px));
    max-height: 190px;
  }
}

.participant-card {
  position: relative;
  background-color: var(--absono-surface-1);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  border: 2px solid var(--absono-border);
  cursor: pointer;
  transition: border-color 0.15s ease;

  &.local {
    border-color: var(--absono-primary);
  }

  &.speaking {
    border-color: var(--absono-online, #3ba55d);
  }

  &.pinned {
    border-color: var(--absono-primary);
    box-shadow: 0 0 0 1px var(--absono-primary);
  }
}

.tile-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--absono-surface-3);
  color: var(--absono-text-muted);

  &.avatar-lg {
    width: 96px;
    height: 96px;
  }
}

.participant-name {
  position: absolute;
  bottom: var(--space-sm);
  left: var(--space-sm);
  z-index: 2;
  padding: 2px var(--space-sm);
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 500;
  color: var(--absono-text);
  background: rgba(0, 0, 0, 0.55);
  border-radius: var(--radius-md);
}

.mic-indicator {
  position: absolute;
  top: var(--space-sm);
  right: var(--space-sm);
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(220, 38, 38, 0.85);
  color: #fff;
  font-size: 14px;
}

.volume-btn {
  position: absolute;
  bottom: var(--space-sm);
  right: var(--space-sm);
  z-index: 2;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-display);
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background-color 0.12s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.75);
  }

  &.muted {
    color: #fca5a5;
    background: rgba(220, 38, 38, 0.5);
  }
}

.volume-slider {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);

  .volume-label {
    font-size: 12px;
    color: var(--absono-text-secondary);
  }
}

.range-slider {
  width: 100%;
  height: 4px;
  appearance: none;
  background: var(--absono-surface-3);
  border-radius: 2px;
  outline: none;
  cursor: pointer;

  &::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--absono-primary);
    cursor: pointer;
  }

  &::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--absono-primary);
    border: none;
    cursor: pointer;
  }
}

.call-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  padding: var(--space-lg);
  background-color: var(--absono-surface-1);
  border-top: 1px solid var(--absono-border);
}

.w-full {
  width: 100%;
}

.setting-hint {
  font-size: 11px;
  color: var(--absono-text-muted);
  margin-top: var(--space-xs);
  line-height: 1.4;
}

.popover-content {
  background: var(--absono-surface-1);
  border: 1px solid var(--absono-border);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  box-shadow: var(--shadow-modal);
  z-index: 100;
  min-width: 190px;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
  user-select: none;
}

.toggle-input {
  display: none;

  &:checked + .toggle-switch {
    background-color: var(--absono-primary);

    &::after {
      transform: translateX(16px);
    }
  }
}

.toggle-switch {
  position: relative;
  width: 36px;
  height: 20px;
  background-color: var(--absono-surface-3);
  border-radius: 10px;
  transition: background-color 0.2s ease;
  flex-shrink: 0;

  &::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: #fff;
    border-radius: 50%;
    transition: transform 0.2s ease;
  }
}

.toggle-label {
  font-size: 13px;
  color: var(--absono-text);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
