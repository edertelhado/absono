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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
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

  async logout(): Promise<void> {
    await api.post('/auth/logout')
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
