<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'
import { useChannelStore } from '@/stores/useChannelStore'
import { channelService } from '@/services/channel'
import { useChatStore } from '@/stores/useChatStore'
import { useVoiceStore } from '@/stores/useVoiceStore'
import { usePresenceStore } from '@/stores/usePresenceStore'
import { useVoiceStateStore } from '@/stores/useVoiceStateStore'
import { usePermissionStore } from '@/stores/usePermissionStore'
import { useUnreadStore } from '@/stores/useUnreadStore'
import { webSocketService } from '@/services/websocket'
import { checkPermission, requestPermission, sendNotification } from '@/services/notification'
import { useToast } from '@/composables/useToast'
import { PhList, PhChatCircle, PhPhone, PhUsers, PhGearSix } from '@phosphor-icons/vue'
import ChannelSidebar from '@/components/ChannelSidebar.vue'
import ChatContent from '@/components/ChatContent.vue'
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
const toast = useToast()

const sidebarOpen = ref(false)
const isDesktop = ref(window.innerWidth > 768)

function closeSidebar() {
  sidebarOpen.value = false
}

function onResize() {
  isDesktop.value = window.innerWidth > 768
  if (isDesktop.value) sidebarOpen.value = false
}

const channelId = computed(() => route.params.id as string)
const isVoiceChannel = computed(() => channelStore.currentChannel?.type === 'VOICE')
const currentChannelName = computed(() => channelStore.currentChannel?.name ?? '')

async function loadChannelPermissions(id: string) {
  try {
    await permissionStore.fetchEffective(id)
  } catch {}
}

onMounted(async () => {
  window.addEventListener('resize', onResize)
  webSocketService.connect()
  await channelStore.fetchChannels()
  presenceStore.init()
  voiceStateStore.init()

  let granted = await checkPermission()
  if (!granted) {
    granted = await requestPermission()
  }
  notifyGranted.value = granted

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

const notifyGranted = ref(false)

function notifyFallback(title: string, body: string) {
  if (notifyGranted.value && document.hidden) {
    sendNotification(title, body)
  } else {
    toast.info(title, body)
  }
}

function handleNotification(data: any) {
  if (data?.type !== 'NEW_MESSAGE' || !data.data) return

  const { channelId: msgChannelId, authorId, authorName, channelName, content } = data.data
  const isOwnMessage = authorId === authStore.user?.id
  const isViewingChannel = msgChannelId === (route.params.id as string)
  const isMentioned = data.data.mentioned === true

  if (isOwnMessage) return

  if (isMentioned) {
    unreadStore.increment(msgChannelId)
    if (!document.hidden) {
      toast.warning(`${authorName} mencionou você em #${channelName}`)
    } else {
      notifyFallback(`@${authorName}`, `#${channelName}: ${content}`)
    }
    return
  }

  if (!document.hidden && isViewingChannel) return

  if (!isViewingChannel) {
    unreadStore.increment(msgChannelId)
    notifyFallback(authorName, content)
  }
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
  presenceStore.stop()
  await authStore.logout()
  router.push('/login')
}

function openSettings() {
  closeSidebar()
  router.push('/settings')
}

async function handleOpenDm(user: any) {
  try {
    const { channelId } = await channelService.openDmWith(user.id)
    if (!channelStore.channels.some(c => c.id === channelId)) {
      await channelStore.fetchChannels()
    }
    const ch = channelStore.channels.find(c => c.id === channelId)
    if (ch) selectChannel(ch)
  } catch {
    toast.error('Não foi possível abrir a conversa')
  }
}

function selectChannel(channel: { id: string }) {
  closeSidebar()
  router.push(`/channel/${channel.id}`)
}
</script>

<template>
  <div class="main-layout">
    <!-- Desktop sidebar -->
    <ChannelSidebar
      v-if="isDesktop"
      class="sidebar-desktop"
      :channels="channelStore.channels"
      :current-channel="channelStore.currentChannel"
      :user="authStore.user"
      @select-channel="selectChannel"
      @logout="handleLogout"
      @open-settings="openSettings"
      @open-dm="handleOpenDm"
    />

    <!-- Mobile header -->
    <header class="mobile-header" v-if="!isDesktop">
      <button class="btn-icon" @click="sidebarOpen = !sidebarOpen">
        <PhList :size="20" />
      </button>
      <img class="mobile-logo" src="/mask-icon.svg" alt="Ábsono" />
      <span class="mobile-header-title">{{ currentChannelName }}</span>
    </header>

    <!-- Main content -->
    <div class="main-content" :class="{ 'has-mobile-header': !isDesktop, 'has-mobile-nav': !isDesktop }">
      <router-view v-if="route.name === 'settings'" />
      <template v-else>
        <ChatContent v-if="['TEXT', 'DIRECT'].includes((channelStore.currentChannel?.type ?? 'TEXT'))" />
        <CallPanel v-else-if="isVoiceChannel" />
        <VoiceStatusBar />
      </template>
    </div>

    <!-- Mobile bottom nav -->
    <nav class="mobile-nav" v-if="!isDesktop">
      <button class="mobile-nav-item" :class="{ active: !isVoiceChannel }" @click="sidebarOpen = true">
        <PhChatCircle :size="20" />
        <span>Chat</span>
      </button>
      <button class="mobile-nav-item" :class="{ active: isVoiceChannel }" @click="sidebarOpen = true">
        <PhPhone :size="20" />
        <span>Voz</span>
      </button>
      <button class="mobile-nav-item" @click="sidebarOpen = true">
        <PhUsers :size="20" />
        <span>Online</span>
      </button>
      <button class="mobile-nav-item" @click="openSettings">
        <PhGearSix :size="20" />
        <span>Config</span>
      </button>
    </nav>

    <!-- Mobile sidebar drawer -->
    <div class="sidebar-mobile" :class="{ open: sidebarOpen }">
      <ChannelSidebar
        :channels="channelStore.channels"
        :current-channel="channelStore.currentChannel"
        :user="authStore.user"
        @select-channel="selectChannel"
        @logout="handleLogout"
        @open-settings="openSettings"
        @open-dm="handleOpenDm"
      />
    </div>

    <!-- Backdrop -->
    <div v-if="sidebarOpen && !isDesktop" class="mobile-backdrop" @click="closeSidebar" />
  </div>
</template>

<style scoped lang="scss">
.main-layout {
  display: flex;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background-color: var(--absono-bg-base);
}

/* Desktop sidebar */
.sidebar-desktop {
  width: 240px;
  flex-shrink: 0;
}

/* Main content */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;

  &.has-mobile-header {
    padding-top: 48px;
  }

  &.has-mobile-nav {
    padding-bottom: 56px;
  }
}

/* Mobile header */
.mobile-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 48px;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 0 var(--space-md);
  background-color: var(--absono-surface-1);
  border-bottom: 1px solid var(--absono-border);
  z-index: 40;
}

.mobile-logo {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.mobile-header-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--absono-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Mobile bottom nav */
.mobile-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-around;
  background-color: var(--absono-surface-1);
  border-top: 1px solid var(--absono-border);
  z-index: 40;
}

.mobile-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 12px;
  background: none;
  border: none;
  border-radius: var(--radius-md);
  color: var(--absono-text-muted);
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: color var(--transition-fast);

  &:hover,
  &.active {
    color: var(--absono-primary);
  }
}

/* Mobile sidebar drawer */
.sidebar-mobile {
  display: none;

  &.open {
    display: block;
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: 280px;
    z-index: 60;
    box-shadow: 8px 0 24px rgba(0, 0, 0, 0.4);
  }

  > .channel-sidebar {
    width: 100%;
    height: 100%;
  }
}

/* Backdrop */
.mobile-backdrop {
  position: fixed;
  inset: 0;
  z-index: 55;
  background: rgba(0, 0, 0, 0.5);
  animation: fade-in 0.15s ease;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
