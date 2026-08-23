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

  async sendMessage(channelId: string, content: string, replyToId?: string, parentMessageId?: string): Promise<any> {
    const response = await api.post(`/channels/${channelId}/messages`, {
      content,
      replyToId,
      parentMessageId,
    })
    return response.data
  },

  async getThread(parentMessageId: string): Promise<Message[]> {
    const response = await api.get(`/messages/${parentMessageId}/thread`)
    return response.data
  },

  async editMessage(messageId: string, content: string): Promise<any> {
    const response = await api.put(`/messages/${messageId}`, { content })
    return response.data
  },

  async deleteMessage(messageId: string): Promise<void> {
    await api.delete(`/messages/${messageId}`)
  },

  async uploadAttachment(file: File, onProgress?: (pct: number) => void): Promise<MessageAttachment> {
    const { data: pre } = await api.post('/attachments/presign', {
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
    })

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', pre.uploadUrl)
      xhr.setRequestHeader('Content-Type', pre.mimeType)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Falha no upload (${xhr.status})`)))
      xhr.onerror = () => reject(new Error('Erro de rede no upload'))
      xhr.send(file)
    })

    return {
      fileName: pre.fileName,
      mimeType: pre.mimeType,
      fileSize: pre.fileSize,
      s3Key: pre.s3Key,
      url: pre.url,
    }
  },

  async addReaction(messageId: string, emoji: string): Promise<void> {
    await api.post(`/messages/${messageId}/reactions`, { emoji })
  },

  async removeReaction(messageId: string, emoji: string): Promise<void> {
    await api.delete(`/messages/${messageId}/reactions`, { params: { emoji } })
  },

  async attachToMessage(messageId: string, attachment: Partial<MessageAttachment>): Promise<MessageAttachment> {
    const response = await api.post(`/messages/${messageId}/attachments`, attachment)
    return response.data
  },
}
