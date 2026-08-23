import api from './auth'

export interface Invite {
  id: string
  code: string
  createdBy: string
  maxUses: number
  useCount: number
  expiresAt: string
  createdAt: string
}

export const inviteService = {
  async createInvite(maxUses: number, durationMinutes: number): Promise<Invite> {
    const response = await api.post('/invites', { maxUses, durationMinutes })
    return response.data
  },

  async listInvites(): Promise<Invite[]> {
    const response = await api.get('/invites')
    return response.data
  },

  async deleteInvite(id: string): Promise<void> {
    await api.delete(`/invites/${id}`)
  },
}
