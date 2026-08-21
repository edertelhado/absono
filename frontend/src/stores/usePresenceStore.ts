import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { User, UserStatus } from '@/types'
import { authService } from '@/services/auth'
import { webSocketService } from '@/services/websocket'

export const usePresenceStore = defineStore('presence', () => {
  const users = ref<User[]>([])
  const statuses = ref<Record<string, UserStatus>>({})
  const loading = ref(false)
  let initialized = false

  function getStatus(userId: string): UserStatus {
    return statuses.value[userId] ?? 'OFFLINE'
  }

  function isOnline(userId: string): boolean {
    const status = getStatus(userId)
    return status === 'ONLINE' || status === 'AWAY' || status === 'DO_NOT_DISTURB'
  }

  function applyStatus(userId: string, status: UserStatus) {
    statuses.value = { ...statuses.value, [userId]: status }
  }

  async function fetchUsers() {
    loading.value = true
    try {
      users.value = await authService.getAllUsers()
      for (const user of users.value) {
        if (user.status) {
          statuses.value[user.id] = user.status
        }
      }
    } finally {
      loading.value = false
    }
  }

  async function init() {
    if (initialized) return
    initialized = true

    await fetchUsers()

    webSocketService.subscribeToPresence((data) => {
      if (data?.type === 'STATUS_CHANGE' && data.data?.userId) {
        applyStatus(data.data.userId, data.data.status as UserStatus)
      }
    })
  }

  return { users, statuses, loading, getStatus, isOnline, applyStatus, fetchUsers, init }
})
