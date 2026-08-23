import { ref } from 'vue'

export interface ConfirmState {
  open: boolean
  title: string
  description: string
  confirmText: string
  cancelText: string
  type: 'info' | 'warning' | 'danger'
  resolve: ((value: boolean) => void) | null
}

const state = ref<ConfirmState>({
  open: false,
  title: '',
  description: '',
  confirmText: 'Confirmar',
  cancelText: 'Cancelar',
  type: 'warning',
  resolve: null,
})

export function useConfirm() {
  function confirm(opts: {
    title: string
    description?: string
    confirmText?: string
    cancelText?: string
    type?: 'info' | 'warning' | 'danger'
  }): Promise<boolean> {
    return new Promise((resolve) => {
      state.value = {
        open: true,
        title: opts.title,
        description: opts.description ?? '',
        confirmText: opts.confirmText ?? 'Confirmar',
        cancelText: opts.cancelText ?? 'Cancelar',
        type: opts.type ?? 'warning',
        resolve,
      }
    })
  }

  function handleConfirm() {
    state.value.resolve?.(true)
    state.value.open = false
  }

  function handleCancel() {
    state.value.resolve?.(false)
    state.value.open = false
  }

  return { state, confirm, handleConfirm, handleCancel }
}
