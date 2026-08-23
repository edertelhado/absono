<script setup lang="ts">
import { computed } from 'vue'
import { useChannelStore } from '@/stores/useChannelStore'
import { useVoiceStore } from '@/stores/useVoiceStore'
import { useVoiceStateStore } from '@/stores/useVoiceStateStore'
import { ElMessage } from 'element-plus'

const channelStore = useChannelStore()
const voiceStore = useVoiceStore()
const voiceStateStore = useVoiceStateStore()

const channel = computed(() =>
  channelStore.channels.find(c => c.id === voiceStore.joinedChannelId)
)

const visible = computed(() =>
  !!voiceStore.joinedChannelId && voiceStore.joinedChannelId !== channelStore.currentChannel?.id
)

const watcherCount = computed(() => voiceStore.screenWatchers.length)

const participantCount = computed(() => {
  const serverSide = voiceStateStore.participantsByChannel[voiceStore.joinedChannelId ?? '']?.length ?? 0
  return Math.max(serverSide, voiceStore.participants.length + 1)
})

async function toggleMicrophone() {
  try {
    await voiceStore.toggleMicrophone()
  } catch {
    ElMessage.error('Não foi possível acessar o microfone')
  }
}

async function toggleScreenShare() {
  try {
    if (voiceStore.isScreenSharing) {
      await voiceStore.stopScreenShare()
    } else {
      await voiceStore.startScreenShare()
    }
  } catch (e: any) {
    if (e?.name !== 'NotAllowedError') {
      ElMessage.error('Erro ao compartilhar a tela')
    }
  }
}

</script>

<template>
  <div v-if="visible" class="voice-status-bar">
    <span class="vsb-channel">
      <svg class="vsb-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
      </svg>
      <span class="vsb-name">{{ channel?.name || 'Canal de voz' }}</span>
      <span class="vsb-count">{{ participantCount }}</span>
      <span v-if="voiceStore.isScreenSharing" class="vsb-sharing">
        <el-icon><Monitor /></el-icon>
        transmitindo
        <span v-if="watcherCount > 0" class="vsb-watchers">
          · {{ watcherCount }} assistindo
        </span>
      </span>
    </span>

    <span class="vsb-controls">
      <el-button
        :type="voiceStore.isMicrophoneEnabled ? 'primary' : 'danger'"
        circle
        size="small"
        @click="toggleMicrophone"
        :title="voiceStore.isMicrophoneEnabled ? 'Desligar microfone' : 'Ligar microfone'"
      >
        <el-icon><Microphone v-if="voiceStore.isMicrophoneEnabled" /><Mute v-else /></el-icon>
      </el-button>

      <el-button
        :type="voiceStore.deafened ? 'danger' : 'default'"
        circle
        size="small"
        @click="voiceStore.toggleDeafen()"
        :title="voiceStore.deafened ? 'Desabafar' : 'Abafar'"
      >
        <el-icon><Headset v-if="!voiceStore.deafened" /><Mute v-else /></el-icon>
      </el-button>

      <el-button
        :type="voiceStore.isScreenSharing ? 'success' : 'default'"
        circle
        size="small"
        @click="toggleScreenShare"
        title="Compartilhar tela"
      >
        <el-icon><Monitor /></el-icon>
      </el-button>

      <el-button type="danger" circle size="small" @click="voiceStore.disconnect()" title="Desconectar">
        <el-icon><SwitchButton /></el-icon>
      </el-button>
    </span>
  </div>
</template>

<style scoped lang="scss">
.voice-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  min-height: 52px;
  padding: var(--space-sm) var(--space-lg);
  background-color: var(--absono-surface-1);
  border-top: 1px solid var(--absono-border);
}

.vsb-channel {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-width: 0;
}

.vsb-icon {
  width: 18px;
  height: 18px;
  color: var(--absono-primary);
  flex-shrink: 0;
}

.vsb-name {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 600;
  color: var(--absono-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vsb-count {
  font-size: 11px;
  font-weight: 600;
  color: var(--absono-text-secondary);
  background: var(--absono-surface-2);
  border-radius: 9999px;
  padding: 1px 8px;
}

.vsb-watchers {
  color: rgba(255, 255, 255, 0.75);
}

.vsb-sharing {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #7ee787;

  .el-icon {
    animation: pulse-share 1.6s infinite ease-in-out;
  }
}

@keyframes pulse-share {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

.vsb-controls {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  flex-shrink: 0;
}
</style>
