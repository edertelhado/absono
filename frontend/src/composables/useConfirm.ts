import { ref } from 'vue'

export interface ConfirmState {
  open: boolean
  title: string
  description: string
  confirmText: string
  cancelText: string
  type: 'info' | 'warning' | 'danger'
}

interface Pending extends ConfirmState {
  resolve: (value: boolean) => void
}

const queue: Pending[] = []
let current: Pending | null = null

const state = ref<ConfirmState>({
  open: false,
  title: '',
  description: '',
  confirmText: 'Confirmar',
  cancelText: 'Cancelar',
  type: 'warning',
})

function showNext() {
  current = queue.shift() ?? null
  if (!current) {
    state.value = { ...state.value, open: false }
    return
  }
  state.value = {
    open: true,
    title: current.title,
    description: current.description,
    confirmText: current.confirmText,
    cancelText: current.cancelText,
    type: current.type,
  }
}

export function useConfirm() {
  function confirm(opts: {
    title: string
    description?: string
    confirmText?: string
    cancelText?: string
    type?: 'info' | 'warning' | 'danger'
  }): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      queue.push({
        open: true,
        title: opts.title,
        description: opts.description ?? '',
        confirmText: opts.confirmText ?? 'Confirmar',
        cancelText: opts.cancelText ?? 'Cancelar',
        type: opts.type ?? 'warning',
        resolve,
      })
      // Só exibe se nenhum diálogo estiver aberto; caso contrário entra na fila
      if (!state.value.open) showNext()
    })
  }

  function handleConfirm() {
    current?.resolve(true)
    showNext()
  }

  function handleCancel() {
    current?.resolve(false)
    showNext()
  }

  return { state, confirm, handleConfirm, handleCancel }
}
