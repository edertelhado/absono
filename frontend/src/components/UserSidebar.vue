<script setup lang="ts">
import { computed } from 'vue'
import type { User, UserRole, UserStatus } from '@/types'
import { useAuthStore } from '@/stores/useAuthStore'
import { usePresenceStore } from '@/stores/usePresenceStore'
import { useVoiceStore } from '@/stores/useVoiceStore'
import { permissionService } from '@/services/permission'
import { ElMessage } from 'element-plus'
import { getAvatarUrl } from '@/utils'
import { useRouter } from 'vue-router'
import { channelService } from '@/services/channel'
import { useChannelStore } from '@/stores/useChannelStore'

const authStore = useAuthStore()
const presenceStore = usePresenceStore()
const voiceStore = useVoiceStore()
const router = useRouter()
const channelStore = useChannelStore()

async function openDm(userId: string) {
  try {
    const { channelId } = await channelService.openDmWith(userId)
    await channelStore.fetchChannels()
    const ch = channelStore.channels.find(c => c.id === channelId)
    console.log('[DM DEBUG] channelId=', channelId, '| na lista=', !!ch,
      '| tipo=', (ch as any)?.type, '| total=', channelStore.channels.length)
    router.push(`/channel/${channelId}`)
  } catch (e: any) {
    console.error('[DM DEBUG] falhou:', e?.message)
    ElMessage.error(e.response?.data?.message || 'Erro ao abrir mensagem direta')
  }
}

const STATUS_LABELS: Record<UserStatus, string> = {
  ONLINE: 'Online',
  AWAY: 'Ausente',
  DO_NOT_DISTURB: 'Não perturbar',
  INVISIBLE: 'Invisível',
  OFFLINE: 'Offline',
}

const ROLE_BADGES: Partial<Record<UserRole, string>> = {
  ADMIN: 'Admin',
  MODERATOR: 'Mod',
}

const isAdmin = computed(() => authStore.user?.role === 'ADMIN')

const onlineUsers = computed<User[]>(() =>
  presenceStore.users.filter(u => effectiveStatus(u) !== 'OFFLINE')
)

const offlineUsers = computed<User[]>(() =>
  presenceStore.users.filter(u => effectiveStatus(u) === 'OFFLINE')
)

// prioriza o mapa de presença ao vivo (WS); cai para o status persistido só como fallback
function effectiveStatus(user: User): UserStatus {
  const live = presenceStore.getStatus(user.id)
  if (live && live !== 'OFFLINE') return live
  return (user.status ?? 'OFFLINE') as UserStatus
}

function statusLabel(user: User): string {
  return STATUS_LABELS[effectiveStatus(user)] ?? 'Offline'
}

function statusClass(user: User): string {
  return `status-${effectiveStatus(user).toLowerCase()}`
}

function roleBadge(user: User): string | undefined {
  return ROLE_BADGES[user.role ?? 'USER']
}

async function changeRole(user: User, role: UserRole) {
  try {
    const updated = await permissionService.updateUserRole(user.id, role)
    user.role = updated.role
    ElMessage.success(`Role de ${user.displayName} alterada para ${role}`)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || 'Erro ao alterar role')
  }
}

const speakingIds = computed<Set<string>>(() => voiceStore.activeSpeakers)

const me = computed(() => authStore.user)

async function setStatus(status: UserStatus) {
  if (!me.value || status === (me.value.status ?? 'ONLINE')) return
  try {
    await authStore.updateStatus(status)
    ElMessage.success(`Status: ${STATUS_LABELS[status]}`)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || 'Erro ao mudar status')
  }
}

function myStatusLabel(): string {
  return me.value ? STATUS_LABELS[me.value.status ?? 'ONLINE'] ?? 'Online' : ''
}
</script>

<template>
  <aside class="user-sidebar">
    <div class="sidebar-header">
      <span class="section-title">Usuários — {{ onlineUsers.length }}</span>
    </div>

    <div class="user-list">
      <template v-if="onlineUsers.length > 0">
        <div class="list-group-title">Online</div>
        <div
          v-for="user in onlineUsers"
          :key="user.id"
          class="user-item"
          :class="{ speaking: speakingIds.has(user.id) }"
        >
          <div class="user-avatar-wrapper">
            <el-avatar :size="32" :src="getAvatarUrl(user.avatarUrl, user.username)" />
            <span class="status-dot" :class="statusClass(user)"></span>
          </div>
          <div class="user-info">
            <span class="user-name">
              {{ user.displayName }}
              <span v-if="roleBadge(user)" class="role-badge" :class="{ admin: user.role === 'ADMIN' }">
                {{ roleBadge(user) }}
              </span>
            </span>
            <span class="user-status" :class="statusClass(user)">{{ statusLabel(user) }}</span>
          </div>
          <button
            v-if="user.id !== authStore.user?.id && effectiveStatus(user) !== 'OFFLINE'"
            class="dm-btn"
            :title="`Mensagem direta para ${user.displayName}`"
            @click.stop="openDm(user.id)"
          >
            <el-icon><ChatDotRound /></el-icon>
          </button>

          <el-dropdown
            v-if="isAdmin && user.id !== authStore.user?.id"
            trigger="click"
            @command="(cmd: any) => changeRole(user, cmd as UserRole)"
          >
            <el-button text circle size="small" class="role-btn">
              <el-icon><MoreFilled /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="USER" :disabled="user.role === 'USER'">Usuário</el-dropdown-item>
                <el-dropdown-item command="MODERATOR" :disabled="user.role === 'MODERATOR'">Moderador</el-dropdown-item>
                <el-dropdown-item command="ADMIN" :disabled="user.role === 'ADMIN'">Admin</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </template>

      <template v-if="offlineUsers.length > 0">
        <div class="list-group-title">Offline</div>
        <div
          v-for="user in offlineUsers"
          :key="user.id"
          class="user-item offline"
        >
          <div class="user-avatar-wrapper">
            <el-avatar :size="32" :src="getAvatarUrl(user.avatarUrl, user.username)" />
            <span class="status-dot" :class="statusClass(user)"></span>
          </div>
          <div class="user-info">
            <span class="user-name">
              {{ user.displayName }}
              <span v-if="roleBadge(user)" class="role-badge" :class="{ admin: user.role === 'ADMIN' }">
                {{ roleBadge(user) }}
              </span>
            </span>
            <span class="user-status" :class="statusClass(user)">Offline</span>
          </div>
        </div>
      </template>

      <div v-if="presenceStore.users.length === 0 && !presenceStore.loading" class="empty-state">
        <p>Nenhum usuário registrado</p>
      </div>
    </div>

    <div class="sidebar-footer" v-if="me">
      <div class="me-chip">
        <span class="status-dot" :class="statusClass(me)"></span>
        <span class="me-name">{{ me.displayName }}</span>
        <span class="me-status">{{ myStatusLabel() }}</span>
      </div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.user-sidebar {
  width: 240px;
  background-color: var(--absono-surface-1);
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--absono-border);
}

.sidebar-header {
  padding: var(--space-lg);
  border-bottom: 1px solid var(--absono-border);
}

.section-title {
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--absono-text-muted);
  letter-spacing: 0.06em;
}

.user-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-sm);
}

.list-group-title {
  font-family: var(--font-display);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--absono-text-muted);
  padding: var(--space-md) var(--space-md) var(--space-xs);
}

.user-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background-color 0.12s ease;

  &:hover {
    background-color: var(--absono-hover);
  }

  &.offline {
    opacity: 0.45;
  }

  &.speaking {
    .user-name::after {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      margin-left: 6px;
      border-radius: 50%;
      background-color: var(--absono-online);
      vertical-align: middle;
    }
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
  border: 2px solid var(--absono-surface-1);

  &.status-online {
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

.user-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--absono-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  vertical-align: middle;
  background-color: var(--absono-surface-3, var(--absono-hover));
  color: var(--absono-text-muted);

  &.admin {
    background-color: var(--absono-primary-subtle);
    color: var(--absono-primary);
  }
}

.dm-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--absono-text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease, background-color 0.12s ease, color 0.12s ease;

  &:hover {
    background-color: var(--absono-hover);
    color: var(--absono-primary);
    opacity: 1;
  }

  .user-item:hover & { opacity: 1; }
}

.role-btn {
  opacity: 0;
  transition: opacity 0.12s ease;

  .user-item:hover & {
    opacity: 1;
  }
}

.user-status {
  font-size: 12px;

  &.status-online {
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

.empty-state {
  text-align: center;
  padding: var(--space-xl);
  color: var(--absono-text-muted);
  font-size: 13px;
}
.sidebar-footer {
  padding: var(--space-sm);
  border-top: 1px solid var(--absono-border);
}

.me-chip {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  width: 100%;
  padding: var(--space-sm);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  cursor: pointer;
  transition: background-color 0.12s ease;

  &:hover { background-color: var(--absono-hover); }
}

.me-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--absono-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.me-status {
  font-size: 12px;
  color: var(--absono-text-muted);
  margin-left: auto;
}

.me-caret {
  font-size: 12px;
  color: var(--absono-text-muted);
}
</style>
