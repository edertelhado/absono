import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, UserStatus } from '@/types'
import { authService } from '@/services/auth'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem('absono_token'))
  const loading = ref(false)

  const isAuthenticated = computed(() => !!token.value && !!user.value)

  async function login(username: string, password: string) {
    loading.value = true
    try {
      const response = await authService.login(username, password)
      token.value = response.accessToken
      user.value = response.user
      localStorage.setItem('absono_token', response.accessToken)
      localStorage.setItem('absono_refresh', response.refreshToken)
      return response
    } finally {
      loading.value = false
    }
  }

  async function register(username: string, displayName: string, password: string, inviteCode: string) {
    loading.value = true
    try {
      const response = await authService.register(username, displayName, password, inviteCode)
      token.value = response.accessToken
      user.value = response.user
      localStorage.setItem('absono_token', response.accessToken)
      localStorage.setItem('absono_refresh', response.refreshToken)
      return response
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      await authService.logout()
    } finally {
      token.value = null
      user.value = null
      localStorage.removeItem('absono_token')
      localStorage.removeItem('absono_refresh')
    }
  }

  async function fetchCurrentUser() {
    if (!token.value) return
    loading.value = true
    try {
      user.value = await authService.getMe()
    } catch {
      token.value = null
      user.value = null
      localStorage.removeItem('absono_token')
    } finally {
      loading.value = false
    }
  }

  async function updateStatus(status: UserStatus) {
    const updated = await authService.updateStatus(status)
    if (user.value && updated) {
      user.value = { ...user.value, status: updated.status }
    }
    return updated
  }

  async function init() {
    if (token.value) {
      await fetchCurrentUser()
    }
  }

  return { user, token, loading, isAuthenticated, login, register, logout, fetchCurrentUser, updateStatus, init }
})
