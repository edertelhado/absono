<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
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

const channelId = computed(() => route.params.id as string)

async function loadChannelPermissions(id: string) {
  try {
    await permissionStore.fetchEffective(id)
  } catch {
    // Sem acesso ao canal — a listagem já filtra
  }
}

onMounted(async () => {
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
      if (channel.type === 'TEXT') {
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
      if (channel.type === 'TEXT') {
        chatStore.setCurrentChannel(id)
      }
    }
  }
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
      :channels="channelStore.channels"
      :current-channel="channelStore.currentChannel"
      :user="authStore.user"
      @select-channel="(ch) => router.push(`/channel/${ch.id}`)"
      @logout="handleLogout"
      @open-settings="openSettings"
    />

    <div class="main-content">
      <ChatContent v-if="channelStore.currentChannel?.type === 'TEXT'" />

      <CallPanel v-else-if="channelStore.currentChannel?.type === 'VOICE'" />

      <VoiceStatusBar />
    </div>

    <UserSidebar />
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
</style>
