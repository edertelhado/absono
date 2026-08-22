export interface User {
  id: string
  username: string
  displayName: string
  bio?: string
  avatarUrl?: string
  status?: UserStatus
  role?: UserRole
  createdAt?: string
}

export type UserStatus = 'ONLINE' | 'AWAY' | 'DO_NOT_DISTURB' | 'INVISIBLE' | 'OFFLINE'

export type UserRole = 'USER' | 'MODERATOR' | 'ADMIN'

export interface Channel {
  id: string
  name: string
  type: ChannelType
  description?: string
  position: number
  active: boolean
  createdBy?: string
  createdAt?: string
  updatedAt?: string
  peerId?: string
  peerName?: string
  peerUsername?: string
  peerAvatarUrl?: string
  peerStatus?: UserStatus
}

export type ChannelType = 'TEXT' | 'DIRECT' | 'VOICE'

export interface VoiceParticipant {
  channelId: string
  userId: string
  displayName: string
  micMuted: boolean
  cameraOn: boolean
}

export interface ChannelPermission {
  id: string
  channelId: string
  userId: string
  canRead: boolean
  canWrite: boolean
  canManage: boolean
  createdAt?: string
}

export interface EffectivePermissions {
  canRead: boolean
  canWrite: boolean
  canManage: boolean
}

export interface Message {
  id: string
  channelId: string
  userId: string
  content: string
  replyToId?: string
  edited: boolean
  createdAt: string
  updatedAt?: string
  username?: string
  displayName?: string
  avatarUrl?: string
  userStatus?: UserStatus
  attachments?: MessageAttachment[]
  reactions?: ReactionSummary[]
}

export interface MessageAttachment {
  id?: string
  messageId?: string
  fileName: string
  mimeType?: string
  fileSize: number
  s3Key?: string
  url?: string
  createdAt?: string
}

export interface ReactionSummary {
  emoji: string
  count: number
  userIds: string[]
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: User
}

export interface TokenResponse {
  serverUrl: string
  token: string
  roomName: string
}

export interface ApiResponse<T = any> {
  success: boolean
  message?: string
  data?: T
}

export interface PaginatedMessages {
  messages: Message[]
  total: number
  hasMore: boolean
}
