import { ref } from 'vue'

export interface Toast {
  id: number
  title?: string
  description?: string
  type?: 'info' | 'success' | 'error' | 'warning'
  duration?: number
}

const toasts = ref<Toast[]>([])
let nextId = 0

export function useToast() {
  function show(opts: Omit<Toast, 'id'>) {
    const id = nextId++
    const toast: Toast = { id, type: 'info', duration: 4000, ...opts }
    toasts.value.push(toast)

    if (toast.duration && toast.duration > 0) {
      setTimeout(() => dismiss(id), toast.duration)
    }

    return id
  }

  function dismiss(id: number) {
    const idx = toasts.value.findIndex(t => t.id === id)
    if (idx !== -1) toasts.value.splice(idx, 1)
  }

  function success(title: string, description?: string) {
    return show({ title, description, type: 'success' })
  }

  function error(title: string, description?: string) {
    return show({ title, description, type: 'error' })
  }

  function warning(title: string, description?: string) {
    return show({ title, description, type: 'warning' })
  }

  function info(title: string, description?: string) {
    return show({ title, description, type: 'info' })
  }

  return { toasts, show, dismiss, success, error, warning, info }
}
