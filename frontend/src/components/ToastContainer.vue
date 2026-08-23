<script setup lang="ts">
import { ToastProvider, ToastRoot, ToastTitle, ToastDescription, ToastClose, ToastViewport } from 'reka-ui'
import { useToast } from '@/composables/useToast'
import { PhX } from '@phosphor-icons/vue'

const { toasts, dismiss } = useToast()
</script>

<template>
  <ToastProvider :duration="4000">
    <slot />

    <ToastViewport class="toast-viewport">
      <ToastRoot
        v-for="toast in toasts"
        :key="toast.id"
        :type="toast.type"
        class="toast-root"
        @close="dismiss(toast.id)"
      >
        <div class="toast-content">
          <ToastTitle v-if="toast.title" class="toast-title">
            {{ toast.title }}
          </ToastTitle>
          <ToastDescription v-if="toast.description" class="toast-description">
            {{ toast.description }}
          </ToastDescription>
        </div>
        <ToastClose class="toast-close" as-child>
          <button aria-label="Fechar">
            <PhX :size="14" />
          </button>
        </ToastClose>
      </ToastRoot>
    </ToastViewport>
  </ToastProvider>
</template>
