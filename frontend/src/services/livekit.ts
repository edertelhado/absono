import api from './auth'
import type { TokenResponse, VoiceParticipant } from '@/types'

export const livekitService = {
  async getToken(channelId: string): Promise<TokenResponse> {
    const response = await api.post('/livekit/token', { channelId })
    return response.data
  },

  async getVoiceState(): Promise<VoiceParticipant[]> {
    const response = await api.get('/livekit/voice-state')
    return response.data
  },

  /** Avisa o backend que saímos da sala — atualiza a sidebar na hora,
   *  sem depender da latência do webhook do LiveKit */
  async notifyLeft(channelId: string): Promise<void> {
    await api.post('/livekit/voice-state/leave', { channelId })
  },
}
