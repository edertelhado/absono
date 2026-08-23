let permissionGranted = false
let swRegistration: ServiceWorkerRegistration | null | undefined

async function getSwRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (swRegistration !== undefined) return swRegistration
  try {
    swRegistration = 'serviceWorker' in navigator
      ? ((await navigator.serviceWorker.getRegistration()) ?? null)
      : null
  } catch {
    swRegistration = null
  }
  return swRegistration
}

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

  // Preferir Service Worker: mais confiável com PWA ativa e funciona
  // mesmo com a aba em segundo plano pesando menos
  const reg = await getSwRegistration()
  if (reg) {
    try {
      await reg.showNotification(title, {
        body,
        icon: options?.icon || '/pwa-192x192.png',
        tag: options?.channel || title,
      })
      return
    } catch {
      // cai para o fallback abaixo
    }
  }

  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: options?.icon, tag: options?.channel })
    }
  } catch (e) {
    console.error('Erro ao enviar notificação:', e)
  }
}

export function shouldNotify(channelId: string, focusedChannelId: string | null): boolean {
  return channelId !== focusedChannelId
}
