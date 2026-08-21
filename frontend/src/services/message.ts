import api from './auth'
import type { PaginatedMessages, MessageAttachment, Message } from '@/types'

export const messageService = {
  async getMessages(channelId: string, limit = 50, offset = 0): Promise<PaginatedMessages> {
    const response = await api.get(`/channels/${channelId}/messages`, {
      params: { limit, offset },
    })
    return response.data
  },

  async searchMessages(channelId: string, q: string, limit = 30): Promise<Message[]> {
    const response = await api.get(`/channels/${channelId}/messages/search`, {
      params: { q, limit },
    })
    return response.data.messages
  },

  async sendMessage(channelId: string, content: string, replyToId?: string): Promise<any> {
    const response = await api.post(`/channels/${channelId}/messages`, {
      content,
      replyToId,
    })
    return response.data
  },

  async editMessage(messageId: string, content: string): Promise<any> {
    const response = await api.put(`/messages/${messageId}`, { content })
    return response.data
  },

  async deleteMessage(messageId: string): Promise<void> {
    await api.delete(`/messages/${messageId}`)
  },

  async uploadAttachment(file: File): Promise<MessageAttachment> {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post('/attachments', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  async attachToMessage(messageId: string, attachment: Partial<MessageAttachment>): Promise<MessageAttachment> {
    const response = await api.post(`/messages/${messageId}/attachments`, attachment)
    return response.data
  },
}
