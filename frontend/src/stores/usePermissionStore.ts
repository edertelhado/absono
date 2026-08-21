import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ChannelPermission, EffectivePermissions } from '@/types'
import { permissionService } from '@/services/permission'

export const usePermissionStore = defineStore('permission', () => {
  const channelPermissions = ref<Record<string, ChannelPermission[]>>({})
  const effective = ref<Record<string, EffectivePermissions>>({})
  const loading = ref(false)

  function can(channelId: string | undefined, action: keyof EffectivePermissions): boolean {
    if (!channelId) return false
    return effective.value[channelId]?.[action] ?? false
  }

  async function fetchEffective(channelId: string): Promise<EffectivePermissions> {
    const perms = await permissionService.getMyPermissions(channelId)
    effective.value = { ...effective.value, [channelId]: perms }
    return perms
  }

  async function fetchPermissions(channelId: string): Promise<ChannelPermission[]> {
    loading.value = true
    try {
      const permissions = await permissionService.getChannelPermissions(channelId)
      channelPermissions.value = { ...channelPermissions.value, [channelId]: permissions }
      return permissions
    } finally {
      loading.value = false
    }
  }

  async function setPermission(
    channelId: string,
    data: { userId: string; canRead: boolean; canWrite: boolean; canManage: boolean }
  ) {
    const updated = await permissionService.setChannelPermission(channelId, data)
    const current = channelPermissions.value[channelId] ?? []
    const index = current.findIndex(p => p.userId === data.userId)
    if (index !== -1) {
      current[index] = updated
    } else {
      current.push(updated)
    }
    channelPermissions.value = { ...channelPermissions.value, [channelId]: [...current] }
  }

  async function deletePermission(channelId: string, userId: string) {
    await permissionService.deleteChannelPermission(channelId, userId)
    const current = (channelPermissions.value[channelId] ?? []).filter(p => p.userId !== userId)
    channelPermissions.value = { ...channelPermissions.value, [channelId]: current }
  }

  function setEffective(channelId: string, perms: EffectivePermissions) {
    effective.value = { ...effective.value, [channelId]: perms }
  }

  return {
    channelPermissions,
    effective,
    loading,
    can,
    fetchEffective,
    fetchPermissions,
    setPermission,
    deletePermission,
    setEffective,
  }
})
