import api from './auth'
import type { Channel, ChannelType } from '@/types'

export const channelService = {
  async listDirectMessages(): Promise<any[]> {
    const response = await api.get('/dm')
    return response.data
  },

  async openDmWith(userId: string): Promise<{ channelId: string }> {
    const response = await api.post(`/dm/with/${userId}`)
    return response.data
  },

  async getChannels(): Promise<Channel[]> {
    const response = await api.get('/channels')
    return response.data
  },

  async getChannel(id: string): Promise<Channel> {
    const response = await api.get(`/channels/${id}`)
    return response.data
  },

  async createChannel(name: string, type: ChannelType, description: string = ''): Promise<Channel> {
    const response = await api.post('/channels', { name, type, description })
    return response.data
  },

  async updateChannel(id: string, data: Partial<Channel>): Promise<Channel> {
    const response = await api.put(`/channels/${id}`, data)
    return response.data
  },

  async deleteChannel(id: string): Promise<void> {
    await api.delete(`/channels/${id}`)
  },

  async reorderChannel(id: string, position: number): Promise<void> {
    await api.put(`/channels/${id}/reorder`, { position })
  },
}
