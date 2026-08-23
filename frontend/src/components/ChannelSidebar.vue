<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Channel, VoiceParticipant, UserStatus } from '@/types'
import { useChannelStore } from '@/stores/useChannelStore'
import { useVoiceStateStore } from '@/stores/useVoiceStateStore'
import { usePresenceStore } from '@/stores/usePresenceStore'
import { useUnreadStore } from '@/stores/useUnreadStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { getAvatarUrl } from '@/utils'
import { copyToClipboard } from '@/utils/clipboard'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
} from 'reka-ui'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
} from 'reka-ui'
import {
  PhCaretDown,
  PhCaretRight,
  PhPlus,
  PhGearSix,
  PhMicrophoneSlash,
  PhVideoCamera,
  PhLink,
  PhSignOut,
  PhHash,
  PhSpeakerHigh,
  PhUsers,
} from '@phosphor-icons/vue'
import ChannelPermissionsDialog from '@/components/ChannelPermissionsDialog.vue'
import { inviteService } from '@/services/invite'

const props = defineProps<{
  channels: Channel[]
  currentChannel: Channel | null
  user: any
}>()

const emit = defineEmits<{
  selectChannel: [channel: Channel]
  logout: []
  openSettings: []
}>()

const channelStore = useChannelStore()
const voiceStateStore = useVoiceStateStore()
const presenceStore = usePresenceStore()
const unreadStore = useUnreadStore()
const authStore = useAuthStore()
const toast = useToast()
const { confirm } = useConfirm()

const STATUS_LABELS: Record<UserStatus, string> = {
  ONLINE: 'Online',
  AWAY: 'Ausente',
  DO_NOT_DISTURB: 'Não perturbar',
  INVISIBLE: 'Invisível',
  OFFLINE: 'Offline',
}

function myEffectiveStatus(): UserStatus {
  const u = authStore.user
  if (!u) return 'OFFLINE'
  const live = presenceStore.getStatus(u.id)
  if (live && live !== 'OFFLINE') return live
  return (u.status ?? 'OFFLINE') as UserStatus
}

function myStatusLabel(): string {
  return STATUS_LABELS[myEffectiveStatus()] ?? 'Online'
}

function myStatusClass(): string {
  return `status-${myEffectiveStatus().toLowerCase()}`
}

async function setStatus(status: UserStatus) {
  const u = authStore.user
  if (!u || status === (u.status ?? 'ONLINE')) return
  try {
    await authStore.updateStatus(status)
  } catch (e: any) {
    toast.error(e.response?.data?.message || 'Erro ao mudar status')
  }
}

const inviteLoading = ref(false)
async function generateInvite() {
  inviteLoading.value = true
  try {
    const invite = await inviteService.createInvite(10, 1440)
    const link = `${window.location.origin}/register?invite=${invite.code}`
    await copyToClipboard(link)
    toast.success('Link copiado para a área de transferência!')
  } catch (e: any) {
    toast.error(e.response?.data?.message || 'Erro ao gerar convite')
  } finally {
    inviteLoading.value = false
  }
}

function unreadLabel(channelId: string): string | null {
  const n = unreadStore.counts[channelId]
  if (!n) return null
  return n > 99 ? '99+' : String(n)
}

const showCreateChannel = ref(false)
const newChannelName = ref('')
const newChannelType = ref<'TEXT' | 'VOICE'>('TEXT')
const newChannelDescription = ref('')

const permissionsDialogVisible = ref(false)
const permissionsChannel = ref<Channel | null>(null)

const collapsedSections = ref<Record<string, boolean>>({})

function toggleSection(section: string) {
  collapsedSections.value[section] = !collapsedSections.value[section]
}

function isCollapsed(section: string): boolean {
  return !!collapsedSections.value[section]
}

const canCreate = computed(() =>
  ['ADMIN', 'MODERATOR'].includes(props.user?.role)
)

function canManageChannel(channel: Channel): boolean {
  if (canCreate.value) return true
  return channel.createdBy === props.user?.id
}

const textChannels = computed(() => props.channels.filter(c => c.type === 'TEXT' && c.active))
const directChannels = computed(() => props.channels.filter(c => c.type === 'DIRECT' && c.active))
const voiceChannels = computed(() => props.channels.filter(c => c.type === 'VOICE' && c.active))

async function createChannel() {
  if (!newChannelName.value.trim()) {
    toast.warning('Digite o nome do canal')
    return
  }

  try {
    await channelStore.createChannel(newChannelName.value.trim(), newChannelType.value, newChannelDescription.value)
    showCreateChannel.value = false
    newChannelName.value = ''
    newChannelDescription.value = ''
    toast.success('Canal criado com sucesso')
  } catch (e: any) {
    toast.error(e.response?.data?.message || 'Erro ao criar canal')
  }
}

function openCreate(type: 'TEXT' | 'VOICE') {
  newChannelType.value = type
  showCreateChannel.value = true
}

async function deleteChannel(channel: Channel) {
  const confirmed = await confirm({
    title: `Tem certeza que deseja excluir o canal #${channel.name}? Todas as mensagens serão perdidas.`,
    description: 'Excluir canal',
    confirmText: 'Excluir',
    cancelText: 'Cancelar',
    type: 'danger',
  })
  if (confirmed) {
    try {
      await channelStore.deleteChannel(channel.id)
      toast.success('Canal excluído')
    } catch {}
  }
}

function openPermissions(channel: Channel) {
  permissionsChannel.value = channel
  permissionsDialogVisible.value = true
}

function participantAvatar(p: VoiceParticipant): string {
  const user = presenceStore.users.find(u => u.id === p.userId)
  return getAvatarUrl(user?.avatarUrl, user?.username ?? p.userId)
}

function participantName(p: VoiceParticipant): string {
  const user = presenceStore.users.find(u => u.id === p.userId)
  return user?.displayName ?? p.displayName
}
</script>

<template>
  <aside class="channel-sidebar">
    <div class="sidebar-header">
      <div class="header-left">
        <svg class="app-logo" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
        <h2 class="app-title">Ábsono</h2>
      </div>
      <button
        v-if="user?.role === 'ADMIN'"
        class="invite-btn"
        title="Gerar link de convite"
        :disabled="inviteLoading"
        @click="generateInvite"
      >
        <PhLink :size="16" />
      </button>
    </div>

    <div class="sidebar-content">
      <!-- Canais de texto -->
      <div class="channel-section">
        <div class="section-header" @click="toggleSection('text')">
          <PhCaretDown class="section-chevron" :class="{ collapsed: isCollapsed('text') }" :size="11" />
          <span class="section-title">Canais de texto</span>
          <button v-if="canCreate" class="section-add-btn" title="Criar canal de texto" @click.stop="openCreate('TEXT')">
            <PhPlus :size="14" />
          </button>
        </div>
        <template v-if="!isCollapsed('text')">
          <div
            v-for="channel in textChannels"
            :key="channel.id"
            class="channel-item"
            :class="{ active: currentChannel?.id === channel.id && currentChannel.type === 'TEXT' }"
            @click="emit('selectChannel', channel)"
          >
            <PhHash class="channel-hash" :size="16" />
            <span class="channel-name">{{ channel.name }}</span>
            <span v-if="unreadLabel(channel.id)" class="unread-badge">{{ unreadLabel(channel.id) }}</span>
            <button v-if="canManageChannel(channel)" class="channel-manage" title="Permissões" @click.stop="openPermissions(channel)">
              <PhGearSix :size="14" />
            </button>
          </div>
        </template>
      </div>

      <!-- Mensagens diretas -->
      <div class="channel-section" v-if="directChannels.length">
        <div class="section-header" @click="toggleSection('dm')">
          <PhCaretDown class="section-chevron" :class="{ collapsed: isCollapsed('dm') }" :size="11" />
          <span class="section-title">Mensagens diretas</span>
        </div>
        <template v-if="!isCollapsed('dm')">
          <div
            v-for="channel in directChannels"
            :key="channel.id"
            class="channel-item dm-item"
            :class="{ active: currentChannel?.id === channel.id }"
            @click="emit('selectChannel', channel)"
          >
            <img class="dm-avatar" :src="getAvatarUrl(channel.peerAvatarUrl, channel.peerUsername || channel.peerName || '')" />
            <span class="channel-name">{{ channel.peerName || channel.peerUsername }}</span>
            <span v-if="unreadLabel(channel.id)" class="unread-badge">{{ unreadLabel(channel.id) }}</span>
          </div>
        </template>
      </div>

      <!-- Canais de voz -->
      <div class="channel-section">
        <div class="section-header" @click="toggleSection('voice')">
          <PhCaretDown class="section-chevron" :class="{ collapsed: isCollapsed('voice') }" :size="11" />
          <span class="section-title">Canais de voz</span>
          <button v-if="canCreate" class="section-add-btn" title="Criar canal de voz" @click.stop="openCreate('VOICE')">
            <PhPlus :size="14" />
          </button>
        </div>
        <template v-if="!isCollapsed('voice')">
          <div
            v-for="channel in voiceChannels"
            :key="channel.id"
            class="channel-group"
          >
            <div
              class="channel-item"
              :class="{ active: currentChannel?.id === channel.id && currentChannel.type === 'VOICE' }"
              @click="emit('selectChannel', channel)"
            >
              <PhSpeakerHigh class="channel-icon" :size="16" />
              <span class="channel-name">{{ channel.name }}</span>
              <span
                v-if="(voiceStateStore.participantsByChannel[channel.id]?.length ?? 0) > 0"
                class="voice-count"
              >{{ voiceStateStore.participantsByChannel[channel.id].length }}</span>
              <button v-if="canManageChannel(channel)" class="channel-manage" title="Permissões" @click.stop="openPermissions(channel)">
                <PhGearSix :size="14" />
              </button>
            </div>

            <div v-if="voiceStateStore.participantsByChannel[channel.id]?.length" class="voice-participants">
              <div
                v-for="p in voiceStateStore.participantsByChannel[channel.id]"
                :key="p.userId"
                class="voice-participant"
              >
                <img
                  class="participant-avatar"
                  :src="participantAvatar(p)"
                  :alt="participantName(p)"
                />
                <span class="participant-name">{{ participantName(p) }}</span>
                <PhMicrophoneSlash v-if="p.micMuted" class="participant-mic-muted" :size="12" />
                <PhVideoCamera v-else-if="p.cameraOn" class="participant-camera-on" :size="12" />
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div class="sidebar-footer">
      <DropdownMenuRoot>
        <DropdownMenuTrigger as-child>
          <div class="user-info">
            <div class="user-avatar-wrapper">
              <div class="avatar avatar-md">
                <img :src="getAvatarUrl(user?.avatarUrl, user?.username || '')" />
              </div>
              <span class="status-dot" :class="myStatusClass()" />
            </div>
            <div class="user-details">
              <span class="user-display-name">{{ user?.displayName || user?.username }}</span>
              <span class="user-status-text" :class="myStatusClass()">{{ myStatusLabel() }}</span>
            </div>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent class="dropdown-content" :side-offset="4" align="start">
            <DropdownMenuItem class="dropdown-item" @select="setStatus('ONLINE')">🟢 Online</DropdownMenuItem>
            <DropdownMenuItem class="dropdown-item" @select="setStatus('AWAY')">🟡 Ausente</DropdownMenuItem>
            <DropdownMenuItem class="dropdown-item" @select="setStatus('DO_NOT_DISTURB')">🔴 Não perturbe</DropdownMenuItem>
            <DropdownMenuItem class="dropdown-item" @select="setStatus('INVISIBLE')">⚫ Invisível</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
      <div class="footer-actions">
        <button class="btn-icon settings-btn" title="Configurações" @click="emit('openSettings')">
          <PhGearSix :size="16" />
        </button>
        <button class="btn-icon logout-btn" title="Sair" @click="emit('logout')">
          <PhSignOut :size="16" />
        </button>
      </div>
    </div>
  </aside>

  <DialogRoot v-model:open="showCreateChannel">
    <DialogPortal>
      <DialogOverlay class="dialog-overlay" />
      <DialogContent class="dialog-content">
        <DialogTitle class="dialog-title">Criar Canal</DialogTitle>
        <form @submit.prevent="createChannel">
          <div class="form-group">
            <label class="form-label">Tipo</label>
            <div class="radio-group">
              <button
                type="button"
                class="radio-btn"
                :class="{ active: newChannelType === 'TEXT' }"
                @click="newChannelType = 'TEXT'"
              >Texto</button>
              <button
                type="button"
                class="radio-btn"
                :class="{ active: newChannelType === 'VOICE' }"
                @click="newChannelType = 'VOICE'"
              >Voz</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Nome</label>
            <input v-model="newChannelName" class="input" placeholder="nome-do-canal" />
          </div>
          <div class="form-group">
            <label class="form-label">Descrição</label>
            <textarea v-model="newChannelDescription" class="textarea" placeholder="Descrição do canal (opcional)" />
          </div>
        </form>
        <div class="dialog-footer">
          <button class="btn btn-default" @click="showCreateChannel = false">Cancelar</button>
          <button class="btn btn-primary" @click="createChannel">Criar</button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <ChannelPermissionsDialog
    v-if="permissionsChannel"
    v-model="permissionsDialogVisible"
    :channel-id="permissionsChannel.id"
    :channel-name="permissionsChannel.name"
  />
</template>

<style scoped lang="scss">
.channel-sidebar {
  width: 240px;
  background-color: var(--absono-surface-1);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--absono-border);
  user-select: none;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--absono-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.app-logo {
  width: 22px;
  height: 22px;
  color: var(--absono-primary);
  flex-shrink: 0;
}

.app-title {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--absono-text);
}

.invite-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--absono-text-secondary);
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;

  &:hover {
    background-color: var(--absono-hover);
    color: var(--absono-primary);
  }
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-sm) var(--space-xs);
}

.channel-section {
  margin-bottom: var(--space-md);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px var(--space-sm);
  cursor: pointer;
  transition: background-color 0.12s ease;

  &:hover {
    .section-title {
      color: var(--absono-text);
    }

    .section-add-btn {
      opacity: 1;
    }
  }
}

.section-chevron {
  color: var(--absono-text-secondary);
  transition: transform 0.12s ease;

  &.collapsed {
    transform: rotate(-90deg);
  }
}

.section-title {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--absono-text-secondary);
  transition: color 0.12s ease;
}

.section-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--absono-text-secondary);
  cursor: pointer;
  opacity: 0;
  border-radius: var(--radius-sm);
  transition: opacity 0.12s ease, color 0.12s ease;

  &:hover {
    color: var(--absono-text);
    background-color: var(--absono-hover);
  }
}

.channel-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  height: 32px;
  padding: 0 var(--space-sm);
  margin: 1px 0;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--absono-text-secondary);
  transition: background-color 0.12s ease, color 0.12s ease;

  &:hover {
    background-color: var(--absono-surface-2);
    color: var(--absono-text);

    .channel-manage {
      opacity: 1;
    }
  }

  &.active {
    background-color: var(--absono-primary-subtle);
    color: var(--absono-text);

    .channel-hash,
    .channel-icon {
      color: var(--absono-primary);
      opacity: 1;
    }
  }
}

.channel-hash {
  width: 18px;
  text-align: center;
  color: var(--absono-text-secondary);
  flex-shrink: 0;
}

.channel-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--absono-text-secondary);

  .channel-item.active & {
    color: var(--absono-primary);
  }
}

.channel-name {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.dm-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex-shrink: 0;
  object-fit: cover;
}

.unread-badge {
  flex-shrink: 0;
  padding: 1px 7px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background-color: var(--absono-dnd, #da373c);
  border-radius: 9999px;
  line-height: 1.4;
}

.voice-count {
  font-size: 11px;
  font-weight: 500;
  color: var(--absono-text-muted);
  background-color: var(--absono-surface-3);
  border-radius: 9999px;
  min-width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  flex-shrink: 0;
}

.channel-manage {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--absono-text-secondary);
  cursor: pointer;
  opacity: 0;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  transition: opacity 0.12s ease, color 0.12s ease;

  &:hover {
    color: var(--absono-text);
    background-color: var(--absono-hover);
  }
}

.voice-participants {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px 0 4px 30px;
}

.voice-participant {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  height: 26px;
  padding: 0 var(--space-sm);
  border-radius: var(--radius-md);
  color: var(--absono-text-secondary);

  &:hover {
    background-color: var(--absono-hover);
  }
}

.participant-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  flex-shrink: 0;
}

.participant-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.participant-mic-muted {
  color: var(--absono-dnd);
  flex-shrink: 0;
}

.participant-camera-on {
  color: var(--absono-online);
  flex-shrink: 0;
}

.sidebar-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-sm) var(--space-md);
  border-top: 1px solid var(--absono-border);
  background-color: var(--absono-bg-base);
}

.user-info {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
  padding: var(--space-xs);
  border-radius: var(--radius-md);
  transition: background-color 0.12s ease;
  flex: 1;
  min-width: 0;

  &:hover {
    background-color: var(--absono-hover);
  }
}

.user-avatar-wrapper {
  position: relative;
  flex-shrink: 0;
}

.status-dot {
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--absono-bg-base);

  &.status-online, &.online {
    background-color: var(--absono-online);
  }

  &.status-away {
    background-color: var(--absono-away);
  }

  &.status-do_not_disturb {
    background-color: var(--absono-dnd);
  }

  &.status-invisible,
  &.status-offline {
    background-color: var(--absono-offline);
  }
}

.user-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-display-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--absono-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 130px;
}

.user-status-text {
  font-size: 11px;

  &.status-online, &.online {
    color: var(--absono-online);
  }

  &.status-away {
    color: var(--absono-away);
  }

  &.status-do_not_disturb {
    color: var(--absono-dnd);
  }

  &.status-invisible,
  &.status-offline {
    color: var(--absono-text-muted);
  }
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--absono-text-secondary);
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;

  &:hover {
    background-color: var(--absono-hover);
    color: var(--absono-text);
  }
}

.logout-btn:hover {
  color: var(--absono-dnd) !important;
}

.radio-group {
  display: flex;
  gap: 0;
  border-radius: var(--radius-md);
  border: 1px solid var(--absono-border);
  overflow: hidden;
}

.radio-btn {
  flex: 1;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  background: transparent;
  border: none;
  color: var(--absono-text-secondary);
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;

  & + & {
    border-left: 1px solid var(--absono-border);
  }

  &.active {
    background-color: var(--absono-primary);
    color: #fff;
  }

  &:hover:not(.active) {
    background-color: var(--absono-hover);
    color: var(--absono-text);
  }
}
</style>
