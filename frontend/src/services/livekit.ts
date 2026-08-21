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
}
