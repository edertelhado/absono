let permissionGranted = false

export async function requestPermission(): Promise<boolean> {
  try {
    if (!('Notification' in window)) return false
    const result = await Notification.requestPermission()
    permissionGranted = result === 'granted'
    return permissionGranted
  } catch {
    return false
  }
}

export async function checkPermission(): Promise<boolean> {
  try {
    if (!('Notification' in window)) return false
    permissionGranted = Notification.permission === 'granted'
    return permissionGranted
  } catch {
    return false
  }
}

export async function sendNotification(title: string, body: string, options?: {
  icon?: string
  channel?: string
}) {
  if (!permissionGranted) {
    const granted = await requestPermission()
    if (!granted) return
  }

  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: options?.icon })
    }
  } catch (e) {
    console.error('Erro ao enviar notificação:', e)
  }
}

export function shouldNotify(channelId: string, focusedChannelId: string | null): boolean {
  return channelId !== focusedChannelId
}
