<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { useChatStore } from '@/stores/useChatStore'
import { useVoiceStore } from '@/stores/useVoiceStore'
import { usePresenceStore } from '@/stores/usePresenceStore'
import { useVoiceStateStore } from '@/stores/useVoiceStateStore'
import { usePermissionStore } from '@/stores/usePermissionStore'
import { useUnreadStore } from '@/stores/useUnreadStore'
import { webSocketService } from '@/services/websocket'
import { checkPermission, requestPermission, sendNotification } from '@/services/notification'
import ChannelSidebar from '@/components/ChannelSidebar.vue'
import ChatContent from '@/components/ChatContent.vue'
import UserSidebar from '@/components/UserSidebar.vue'
import CallPanel from '@/components/CallPanel.vue'
import VoiceStatusBar from '@/components/VoiceStatusBar.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const channelStore = useChannelStore()
const chatStore = useChatStore()
const voiceStore = useVoiceStore()
const presenceStore = usePresenceStore()
const voiceStateStore = useVoiceStateStore()
const permissionStore = usePermissionStore()
const unreadStore = useUnreadStore()

// gavetas laterais em telas pequenas
const channelsOpen = ref(false)
const usersOpen = ref(false)
function closeDrawers() {
  channelsOpen.value = false
  usersOpen.value = false
}
function onResize() {
  if (window.innerWidth > 1100) usersOpen.value = false
  if (window.innerWidth > 820) channelsOpen.value = false
}

const channelId = computed(() => route.params.id as string)

async function loadChannelPermissions(id: string) {
  try {
    await permissionStore.fetchEffective(id)
  } catch {
    // Sem acesso ao canal — a listagem já filtra
  }
}

onMounted(async () => {
  window.addEventListener('resize', onResize)
  webSocketService.connect()
  await channelStore.fetchChannels()
  presenceStore.init()
  voiceStateStore.init()

  const granted = await checkPermission()
  if (!granted) {
    await requestPermission()
  }

  webSocketService.subscribeToNotifications((data) => {
    handleNotification(data)
  })

  if (channelId.value) {
    const channel = channelStore.channels.find(c => c.id === channelId.value)
    if (channel) {
      channelStore.setCurrentChannel(channel)
      unreadStore.clear(channel.id)
      await loadChannelPermissions(channel.id)
      if (['TEXT', 'DIRECT'].includes(channel.type)) {
        chatStore.setCurrentChannel(channel.id)
      }
    }
  } else {
    const firstText = channelStore.textChannels[0]
    if (firstText) {
      router.push(`/channel/${firstText.id}`)
    }
  }
})

function handleNotification(data: any) {
  if (data?.type !== 'NEW_MESSAGE' || !data.data) return

  const { channelId: msgChannelId, authorId, authorName, channelName, content } = data.data
  const isOwnMessage = authorId === authStore.user?.id
  const isViewingChannel = msgChannelId === (route.params.id as string)

  if (isOwnMessage) return
  if (!document.hidden && isViewingChannel) return

  if (!isViewingChannel) {
    unreadStore.increment(msgChannelId)
  }

  sendNotification(authorName, `#${channelName}: ${content}`)
}

watch(channelId, async (id) => {
  if (id) {
    const channel = channelStore.channels.find(c => c.id === id)
    if (channel) {
      channelStore.setCurrentChannel(channel)
      unreadStore.clear(id)
      await loadChannelPermissions(id)
      if (['TEXT', 'DIRECT'].includes(channel.type)) {
        chatStore.setCurrentChannel(id)
      }
    }
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
})

async function handleLogout() {
  webSocketService.disconnect()
  await voiceStore.disconnect()
  await authStore.logout()
  router.push('/login')
}

function openSettings() {
  router.push('/settings')
}
</script>

<template>
  <div class="main-layout">
    <ChannelSidebar
      class="sb-channels"
      :class="{ open: channelsOpen }"
      :channels="channelStore.channels"
      :current-channel="channelStore.currentChannel"
      :user="authStore.user"
      @select-channel="(ch) => { closeDrawers(); router.push(`/channel/${ch.id}`) }"
      @logout="handleLogout"
      @open-settings="openSettings"
    />

    <div class="main-content">
      <ChatContent v-if="['TEXT', 'DIRECT'].includes((channelStore.currentChannel?.type ?? 'TEXT'))" />

      <CallPanel v-else-if="channelStore.currentChannel?.type === 'VOICE'" />

      <VoiceStatusBar />
    </div>

    <UserSidebar class="sb-users" :class="{ open: usersOpen }" />

    <div v-if="channelsOpen || usersOpen" class="mobile-backdrop" @click="closeDrawers"></div>
    <button class="mobile-fab fab-left" title="Canais" @click="channelsOpen = !channelsOpen; usersOpen = false">
      <el-icon><Menu /></el-icon>
    </button>
    <button class="mobile-fab fab-right" title="Usuários" @click="usersOpen = !usersOpen; channelsOpen = false">
      <el-icon><User /></el-icon>
    </button>
  </div>
</template>

<style scoped lang="scss">
.main-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background-color: var(--absono-bg-base);
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}
.mobile-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.45);
}

.mobile-fab {
  display: none;
}

@media (max-width: 1100px) {
  .sb-users {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 60;
    transform: translateX(105%);
    transition: transform 0.22s ease;
    box-shadow: -8px 0 24px rgba(0, 0, 0, 0.4);

    &.open {
      transform: translateX(0);
    }
  }

  .mobile-fab.fab-right {
    display: inline-flex;
  }
}

@media (max-width: 820px) {
  .sb-channels {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 60;
    transform: translateX(-105%);
    transition: transform 0.22s ease;
    box-shadow: 8px 0 24px rgba(0, 0, 0, 0.4);

    &.open {
      transform: translateX(0);
    }
  }

  .mobile-fab.fab-left {
    display: inline-flex;
  }
}

.mobile-fab {
  position: fixed;
  bottom: 14px;
  width: 46px;
  height: 46px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--absono-border);
  background-color: var(--absono-surface-2);
  color: var(--absono-text);
  font-size: 20px;
  cursor: pointer;
  z-index: 55;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);

  &.fab-left { left: 14px; }
  &.fab-right { right: 14px; }
}
</style>
