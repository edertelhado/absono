<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/useAuthStore'
import { usePresenceStore } from '@/stores/usePresenceStore'
import { authService } from '@/services/auth'
import { permissionService } from '@/services/permission'
import { inviteService } from '@/services/invite'
import type { Invite } from '@/services/invite'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { getAvatarUrl } from '@/utils'
import { copyToClipboard } from '@/utils/clipboard'
import type { UserRole } from '@/types'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectItemText,
} from 'reka-ui'
import {
  PhArrowLeft,
  PhCamera,
  PhFloppyDisk,
  PhKey,
  PhUserPlus,
  PhTrash,
  PhCopy,
  PhCheck,
  PhX,
} from '@phosphor-icons/vue'

const toast = useToast()
const { confirm } = useConfirm()
const authStore = useAuthStore()
const presenceStore = usePresenceStore()

const displayName = ref('')
const bio = ref('')
const loading = ref(false)
const avatarInput = ref<HTMLInputElement | null>(null)
const avatarUploading = ref(false)

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordLoading = ref(false)

onMounted(async () => {
  if (authStore.user) {
    displayName.value = authStore.user.displayName || ''
    bio.value = authStore.user.bio || ''
  }
  if (isAdmin.value) {
    await presenceStore.fetchUsers()
    await loadInvites()
  }
})

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'USER', label: 'Usuário' },
  { value: 'MODERATOR', label: 'Moderador' },
  { value: 'ADMIN', label: 'Admin' },
]

const isAdmin = computed(() => authStore.user?.role === 'ADMIN')

const invites = ref<Invite[]>([])
const inviteMaxUses = ref(1)
const inviteDuration = ref(15)
const inviteLoading = ref(false)
const generatedInviteLink = ref('')

async function loadInvites() {
  try {
    invites.value = await inviteService.listInvites()
  } catch {
    // ignore
  }
}

function getInviteLink(code: string): string {
  const base = window.location.origin
  return `${base}/register?invite=${code}`
}

async function createInvite() {
  inviteLoading.value = true
  try {
    const invite = await inviteService.createInvite(inviteMaxUses.value, inviteDuration.value)
    generatedInviteLink.value = getInviteLink(invite.code)
    await loadInvites()
    toast.success('Convite criado com sucesso')
  } catch (e: any) {
    toast.error(e.response?.data?.message || 'Erro ao criar convite')
  } finally {
    inviteLoading.value = false
  }
}

async function deleteInvite(id: string) {
  try {
    await confirm({ title: 'Confirmar', description: 'Excluir este convite?', type: 'warning' })
    await inviteService.deleteInvite(id)
    await loadInvites()
    toast.success('Convite excluido')
  } catch {
    // cancelled
  }
}

async function copyInviteLink(link: string) {
  try {
    await copyToClipboard(link)
    toast.success('Link copiado para a area de transferencia')
  } catch {
    toast.error('Não foi possível copiar o link')
  }
}

function isInviteExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date()
}

async function savePassword() {
  if (!currentPassword.value || !newPassword.value) {
    toast.warning('Preencha a senha atual e a nova senha')
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    toast.warning('A confirmação não confere com a nova senha')
    return
  }
  if (newPassword.value.length < 6) {
    toast.warning('A nova senha deve ter pelo menos 6 caracteres')
    return
  }
  passwordLoading.value = true
  try {
    await authService.changePassword(currentPassword.value, newPassword.value)
    toast.success('Senha alterada com sucesso')
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (e: any) {
    toast.error(e.response?.data?.message || 'Erro ao alterar senha')
  } finally {
    passwordLoading.value = false
  }
}

async function saveProfile() {
  loading.value = true
  try {
    await authService.updateProfile({
      displayName: displayName.value,
      bio: bio.value,
    })
    await authStore.fetchCurrentUser()
    toast.success('Perfil atualizado com sucesso')
  } catch (e: any) {
    toast.error(e.response?.data?.message || 'Erro ao atualizar perfil')
  } finally {
    loading.value = false
  }
}

function triggerAvatarUpload() {
  avatarInput.value?.click()
}

async function handleAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  avatarUploading.value = true
  try {
    await authService.uploadAvatar(file)
    await authStore.fetchCurrentUser()
    toast.success('Avatar atualizado com sucesso')
  } catch (e: any) {
    toast.error(e.response?.data?.message || 'Erro ao enviar avatar')
  } finally {
    avatarUploading.value = false
    if (avatarInput.value) {
      avatarInput.value.value = ''
    }
  }
}

async function changeUserRole(userId: string, role: UserRole) {
  try {
    const updated = await permissionService.updateUserRole(userId, role)
    const user = presenceStore.users.find(u => u.id === userId)
    if (user && updated.role) {
      user.role = updated.role
    }
    toast.success('Role atualizada')
  } catch (e: any) {
    toast.error(e.response?.data?.message || 'Erro ao alterar role')
  }
}
</script>

<template>
  <div class="settings-view">
    <div class="settings-container">
      <h1 class="settings-title">Configurações</h1>

      <!-- Profile Card -->
      <div class="card settings-card">
        <div class="card-header">
          <span class="card-header-title">Perfil</span>
        </div>
        <div class="card-body">
          <div class="avatar-section">
            <div class="avatar-wrapper">
              <div class="avatar avatar-2xl">
                <img :src="getAvatarUrl(authStore.user?.avatarUrl, authStore.user?.username || '')" alt="Avatar" />
              </div>
              <button
                type="button"
                class="avatar-edit-btn"
                :disabled="avatarUploading"
                title="Alterar avatar"
                @click="triggerAvatarUpload"
              >
                <PhCamera v-if="!avatarUploading" :size="14" />
                <span v-else class="spinner"></span>
              </button>
            </div>
            <input
              ref="avatarInput"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              style="display: none"
              @change="handleAvatarChange"
            />
            <div class="avatar-info">
              <p class="avatar-username">{{ authStore.user?.username }}</p>
              <p class="avatar-id">ID: {{ authStore.user?.id }}</p>
            </div>
          </div>

          <form @submit.prevent="saveProfile">
            <div class="form-group">
              <label class="form-label">Alterar senha</label>
              <div class="password-grid">
                <input v-model="currentPassword" type="password" class="input" placeholder="Senha atual" />
                <input v-model="newPassword" type="password" class="input" placeholder="Nova senha (mín. 6)" />
                <input v-model="confirmPassword" type="password" class="input" placeholder="Confirmar nova senha" />
                <button type="button" class="btn btn-primary" :disabled="passwordLoading" @click="savePassword">
                  <PhKey v-if="!passwordLoading" :size="16" />
                  <span v-else class="spinner"></span>
                  Alterar senha
                </button>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Nome de Exibição</label>
              <input v-model="displayName" type="text" class="input" placeholder="Seu nome" />
            </div>

            <div class="form-group">
              <label class="form-label">Bio</label>
              <textarea v-model="bio" class="textarea" rows="3" placeholder="Conte sobre você..."></textarea>
            </div>

            <button type="submit" class="btn btn-primary save-btn" :disabled="loading">
              <PhFloppyDisk v-if="!loading" :size="16" />
              <span v-else class="spinner"></span>
              Salvar Alterações
            </button>
          </form>
        </div>
      </div>

      <!-- Manage Users Card (Admin only) -->
      <div v-if="isAdmin" class="card settings-card">
        <div class="card-header">
          <span class="card-header-title">Gerenciar Usuários</span>
        </div>
        <div class="card-body">
          <div class="users-manage-list">
            <div
              v-for="user in presenceStore.users"
              :key="user.id"
              class="user-manage-row"
            >
              <div class="avatar">
                <img :src="getAvatarUrl(user.avatarUrl, user.username)" :alt="user.displayName" />
              </div>
              <div class="user-manage-info">
                <span class="user-manage-name">{{ user.displayName }}</span>
                <span class="user-manage-username">@{{ user.username }}</span>
              </div>
              <SelectRoot
                :model-value="user.role || 'USER'"
                :disabled="user.id === authStore.user?.id"
                @update:model-value="(val: any) => changeUserRole(user.id, val as UserRole)"
              >
                <SelectTrigger class="select-trigger role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="option in ROLE_OPTIONS"
                    :key="option.value"
                    :value="option.value"
                  >
                    <SelectItemText>{{ option.label }}</SelectItemText>
                  </SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>
          </div>
        </div>
      </div>

      <!-- Manage Invites Card (Admin only) -->
      <div v-if="isAdmin" class="card settings-card">
        <div class="card-header">
          <span class="card-header-title">Gerenciar Convites</span>
        </div>
        <div class="card-body">
          <div class="invite-create">
            <div class="invite-form">
              <div class="invite-fields">
                <div class="form-group">
                  <label class="form-label">Maximo de usos</label>
                  <input v-model.number="inviteMaxUses" type="number" class="input-number" min="1" max="100" />
                </div>
                <div class="form-group">
                  <label class="form-label">Duracao (minutos)</label>
                  <input v-model.number="inviteDuration" type="number" class="input-number" min="1" max="1440" step="5" />
                </div>
              </div>
              <button class="btn btn-primary" :disabled="inviteLoading" @click="createInvite">
                <PhUserPlus v-if="!inviteLoading" :size="16" />
                <span v-else class="spinner"></span>
                Gerar Link de Convite
              </button>
            </div>

            <div v-if="generatedInviteLink" class="generated-link">
              <div class="input-group">
                <input :value="generatedInviteLink" readonly class="input" />
                <button class="btn btn-default" @click="copyInviteLink(generatedInviteLink)">
                  <PhCopy :size="16" />
                </button>
              </div>
            </div>
          </div>

          <div v-if="invites.length" class="invites-list">
            <div
              v-for="invite in invites"
              :key="invite.id"
              class="invite-row"
              :class="{ expired: isInviteExpired(invite.expiresAt) || invite.useCount >= invite.maxUses }"
            >
              <div class="invite-info-col">
                <span class="invite-code">{{ invite.code }}</span>
                <span class="invite-meta">
                  {{ invite.useCount }}/{{ invite.maxUses }} usos
                  &middot;
                  expira em {{ new Date(invite.expiresAt).toLocaleString('pt-BR') }}
                </span>
              </div>
              <div class="invite-actions">
                <button class="btn btn-ghost" @click="copyInviteLink(getInviteLink(invite.code))">
                  <PhCopy :size="14" />
                  Copiar Link
                </button>
                <button class="btn btn-danger" @click="deleteInvite(invite.id)">
                  <PhTrash :size="14" />
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.settings-view {
  display: flex;
  justify-content: center;
  padding: var(--space-xl);
  overflow-y: auto;
  height: 100%;
  background-color: var(--absono-bg-base);
}

.settings-container {
  width: 100%;
  max-width: 600px;
}

.settings-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--absono-text);
  margin-bottom: var(--space-xl);
  letter-spacing: -0.01em;
}

.settings-card {
  margin-bottom: var(--space-lg);
}

.save-btn {
  margin-top: var(--space-lg);
  width: 100%;
}

.avatar-section {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  margin-bottom: var(--space-xl);
  padding: var(--space-lg);
  background-color: var(--absono-surface-2);
  border-radius: var(--radius-lg);
}

.avatar-wrapper {
  position: relative;
  display: inline-flex;
}

.avatar-edit-btn {
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background-color: var(--absono-primary);
  color: #fff;
  cursor: pointer;
  transition: background-color 0.12s ease, transform 0.12s ease;

  &:hover:not(:disabled) {
    background-color: var(--absono-primary-hover, var(--absono-primary));
    transform: scale(1.08);
  }

  &:disabled {
    opacity: 0.7;
    cursor: wait;
  }
}

.avatar-info {
  .avatar-username {
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 600;
    color: var(--absono-text);
  }

  .avatar-id {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--absono-text-muted);
    margin-top: var(--space-xs);
  }
}

.w-full {
  width: 100%;
}

.users-manage-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.user-manage-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background-color: var(--absono-surface-2);
  border-radius: var(--radius-md);
}

.user-manage-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.user-manage-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--absono-text);
}

.user-manage-username {
  font-size: 12px;
  color: var(--absono-text-muted);
}

.role-select {
  width: 140px;
}

.password-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  width: 100%;
}

.invite-create {
  margin-bottom: var(--space-lg);
}

.invite-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.invite-fields {
  display: flex;
  gap: var(--space-lg);
}

.input-group {
  display: flex;
  gap: var(--space-xs);

  .input {
    flex: 1;
  }
}

.generated-link {
  margin-top: var(--space-md);
}

.invites-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.invite-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background-color: var(--absono-surface-2);
  border-radius: var(--radius-md);

  &.expired {
    opacity: 0.5;
  }
}

.invite-info-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.invite-code {
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 600;
  color: var(--absono-text);
}

.invite-meta {
  font-size: 12px;
  color: var(--absono-text-muted);
  margin-top: 2px;
}

.invite-actions {
  display: flex;
  gap: var(--space-xs);
  flex-shrink: 0;
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
