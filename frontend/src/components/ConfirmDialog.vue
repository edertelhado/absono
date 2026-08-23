<script setup lang="ts">
import {
  AlertDialogRoot, AlertDialogPortal, AlertDialogOverlay,
  AlertDialogContent, AlertDialogTitle, AlertDialogDescription,
  AlertDialogAction, AlertDialogCancel,
} from 'reka-ui'
import { useConfirm } from '@/composables/useConfirm'

const { state, handleConfirm, handleCancel } = useConfirm()
</script>

<template>
  <AlertDialogRoot :open="state.open">
    <AlertDialogPortal>
      <AlertDialogOverlay class="dialog-overlay" />
      <AlertDialogContent class="dialog-content">
        <AlertDialogTitle class="dialog-title">{{ state.title }}</AlertDialogTitle>
        <AlertDialogDescription v-if="state.description" class="dialog-description">
          {{ state.description }}
        </AlertDialogDescription>
        <div class="dialog-footer">
          <AlertDialogCancel class="btn btn-default" @click="handleCancel">
            {{ state.cancelText }}
          </AlertDialogCancel>
          <AlertDialogAction
            class="btn"
            :class="state.type === 'danger' ? 'btn-danger' : 'btn-primary'"
            @click="handleConfirm"
          >
            {{ state.confirmText }}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>
