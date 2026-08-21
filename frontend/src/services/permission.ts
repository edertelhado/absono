import api from './auth'
import type { ChannelPermission, EffectivePermissions, User, UserRole } from '@/types'

export const permissionService = {
  async getMyPermissions(channelId: string): Promise<EffectivePermissions> {
    const response = await api.get(`/channels/${channelId}/my-permissions`)
    return response.data
  },

  async getChannelPermissions(channelId: string): Promise<ChannelPermission[]> {
    const response = await api.get(`/channels/${channelId}/permissions`)
    return response.data.permissions
  },

  async setChannelPermission(
    channelId: string,
    data: { userId: string; canRead: boolean; canWrite: boolean; canManage: boolean }
  ): Promise<ChannelPermission> {
    const response = await api.put(`/channels/${channelId}/permissions`, data)
    return response.data
  },

  async deleteChannelPermission(channelId: string, userId: string): Promise<void> {
    await api.delete(`/channels/${channelId}/permissions/${userId}`)
  },

  async updateUserRole(userId: string, role: UserRole): Promise<User> {
    const response = await api.put(`/users/${userId}/role`, { role })
    return response.data
  },
}
