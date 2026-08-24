export function getAvatarUrl(avatarUrl: string | null | undefined, username: string): string {
  if (avatarUrl) {
    return avatarUrl
  }
  return `https://api.dicebear.com/8.x/bottts/svg?seed=${encodeURIComponent(username)}`
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  if (bytes < 1) return `${bytes} Bytes`
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.min(sizes.length - 1, Math.max(0, Math.floor(Math.log(bytes) / Math.log(k))))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'agora'
  if (minutes < 60) return `${minutes}min atrás`
  if (hours < 24) return `${hours}h atrás`
  if (days < 7) return `${days}d atrás`

  return date.toLocaleDateString('pt-BR')
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('pt-BR')
}
