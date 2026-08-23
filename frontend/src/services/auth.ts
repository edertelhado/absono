import axios from 'axios'
import type { AuthResponse, User, UserStatus } from '@/types'
import router from '@/router'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('absono_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let refreshPromise: Promise<string | null> | null = null

async function doRefresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem('absono_refresh')
  if (!refreshToken) return null
  try {
    const response = await axios.post('/api/auth/refresh', { refreshToken })
    const data = response.data as AuthResponse
    localStorage.setItem('absono_token', data.accessToken)
    return data.accessToken
  } catch {
    localStorage.removeItem('absono_token')
    localStorage.removeItem('absono_refresh')
    router.push('/login')
    return null
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config ?? {}
    const status = error.response?.status
    const isAuthCall = typeof config.url === 'string' && config.url.includes('/auth/')

    if (status === 401 && !isAuthCall && !config._retried) {
      config._retried = true
      refreshPromise = refreshPromise ?? doRefresh().finally(() => {
        refreshPromise = null
      })
      const newToken = await refreshPromise
      if (newToken) {
        config.headers.Authorization = `Bearer ${newToken}`
        return api(config)
      }
    }

    if (status === 401 && !isAuthCall) {
      localStorage.removeItem('absono_token')
      localStorage.removeItem('absono_refresh')
      router.push('/login')
    }

    return Promise.reject(error)
  }
)

export const authService = {
  async login(username: string, password: string): Promise<AuthResponse> {
    const response = await api.post('/auth/login', { username, password })
    return response.data
  },

  async register(username: string, displayName: string, password: string): Promise<AuthResponse> {
    const response = await api.post('/auth/register', { username, displayName, password })
    return response.data
  },

  async refresh(): Promise<AuthResponse> {
    // usa axios cru para não passar pelo interceptor de 401
    const refreshToken = localStorage.getItem('absono_refresh') || ''
    const response = await axios.post('/api/auth/refresh', { refreshToken })
    const data = response.data as AuthResponse
    localStorage.setItem('absono_token', data.accessToken)
    return data
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout')
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.put('/me/password', { currentPassword, newPassword })
  },

  async getMe(): Promise<User> {
    const response = await api.get('/me')
    return response.data
  },

  async updateProfile(data: { displayName?: string; bio?: string; avatarUrl?: string }): Promise<User> {
    const response = await api.put('/me/profile', data)
    return response.data
  },

  async updateStatus(status: UserStatus): Promise<User> {
    const response = await api.put('/me/status', { status })
    return response.data
  },

  async uploadAvatar(file: File): Promise<User> {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.put('/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  async getAllUsers(): Promise<User[]> {
    const response = await api.get('/users')
    return response.data
  },
}

export default api
