import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { VoiceParticipant } from '@/types'
import { livekitService } from '@/services/livekit'
import { webSocketService } from '@/services/websocket'

export const useVoiceStateStore = defineStore('voiceState', () => {
  const participantsByChannel = ref<Record<string, VoiceParticipant[]>>({})
  let initialized = false

  const totalConnected = computed(() =>
    Object.values(participantsByChannel.value).reduce((sum, list) => sum + list.length, 0)
  )

  function applySnapshot(participants: VoiceParticipant[]) {
    const next: Record<string, VoiceParticipant[]> = {}
    for (const p of participants) {
      if (!next[p.channelId]) next[p.channelId] = []
      next[p.channelId].push(p)
    }
    participantsByChannel.value = next
  }

  /** Patch otimista: remove o usuário de todos os canais na UI já,
   *  antes do webhook do LiveKit chegar. O próximo snapshot corrige. */
  function localLeave(userId: string) {
    const next: Record<string, VoiceParticipant[]> = {}
    for (const [cid, list] of Object.entries(participantsByChannel.value)) {
      const filtered = list.filter(p => p.userId !== userId)
      if (filtered.length) next[cid] = filtered
    }
    participantsByChannel.value = next
  }

  /** Patch otimista: adiciona o usuário num canal na UI imediatamente. */
  function localJoin(userId: string, displayName: string, channelId: string) {
    localLeave(userId)
    const entry: VoiceParticipant = {
      userId,
      displayName,
      channelId,
      micMuted: false,
      cameraOn: false,
    }
    participantsByChannel.value = {
      ...participantsByChannel.value,
      [channelId]: [...(participantsByChannel.value[channelId] || []), entry],
    }
  }

  async function init() {
    if (initialized) return
    initialized = true

    try {
      const snapshot = await livekitService.getVoiceState()
      applySnapshot(snapshot)
    } catch (e) {
      console.error('Erro ao carregar voice state:', e)
    }

    webSocketService.subscribeToVoiceState((data) => {
      if (data?.type === 'VOICE_STATE' && Array.isArray(data.data)) {
        applySnapshot(data.data)
      }
    })
  }

  /** Busca snapshot fresco — usado após conectar/desconectar para corrigir
   *  rapidamente qualquer divergência sem esperar webhook/reconciliação */
  async function refresh() {
    try {
      applySnapshot(await livekitService.getVoiceState())
    } catch {
      // silencioso — próximo evento corrige
    }
  }

  return { participantsByChannel, totalConnected, init, refresh, localLeave, localJoin }
})
