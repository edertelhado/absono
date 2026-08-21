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

  return { participantsByChannel, totalConnected, init }
})
