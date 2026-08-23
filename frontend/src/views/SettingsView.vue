<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/useAuthStore'
import { usePresenceStore } from '@/stores/usePresenceStore'
import { authService } from '@/services/auth'
import { permissionService } from '@/services/permission'
import { ElMessage } from 'element-plus'
import { getAvatarUrl } from '@/utils'
import type { UserStatus, UserRole } from '@/types'

const authStore = useAuthStore()
const presenceStore = usePresenceStore()

const displayName = ref('')
const bio = ref('')
const loading = ref(false)
const statusLoading = ref(false)
const avatarInput = ref<HTMLInputElement | null>(null)
const avatarUploading = ref(false)

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordLoading = ref(false)

const STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: 'ONLINE', label: 'Online' },
  { value: 'AWAY', label: 'Ausente' },
  { value: 'DO_NOT_DISTURB', label: 'Não perturbar' },
  { value: 'INVISIBLE', label: 'Invisível' },
]

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'USER', label: 'Usuário' },
  { value: 'MODERATOR', label: 'Moderador' },
  { value: 'ADMIN', label: 'Admin' },
]

const isAdmin = computed(() => authStore.user?.role === 'ADMIN')

onMounted(async () => {
  if (authStore.user) {
    displayName.value = authStore.user.displayName || ''
    bio.value = authStore.user.bio || ''
  }
  if (isAdmin.value) {
    await presenceStore.fetchUsers()
  }
})

async function savePassword() {
  if (!currentPassword.value || !newPassword.value) {
    ElMessage.warning('Preencha a senha atual e a nova senha')
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    ElMessage.warning('A confirmação não confere com a nova senha')
    return
  }
  if (newPassword.value.length < 6) {
    ElMessage.warning('A nova senha deve ter pelo menos 6 caracteres')
    return
  }
  passwordLoading.value = true
  try {
    await authService.changePassword(currentPassword.value, newPassword.value)
    ElMessage.success('Senha alterada com sucesso')
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || 'Erro ao alterar senha')
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
    ElMessage.success('Perfil atualizado com sucesso')
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || 'Erro ao atualizar perfil')
  } finally {
    loading.value = false
  }
}

async function changeStatus(status: UserStatus) {
  statusLoading.value = true
  try {
    await authStore.updateStatus(status)
    ElMessage.success('Status atualizado')
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || 'Erro ao atualizar status')
  } finally {
    statusLoading.value = false
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
    ElMessage.success('Avatar atualizado com sucesso')
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || 'Erro ao enviar avatar')
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
    ElMessage.success('Role atualizada')
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || 'Erro ao alterar role')
  }
}
</script>

<template>
  <div class="settings-view">
    <div class="settings-container">
      <h1 class="settings-title">Configurações</h1>

      <el-card class="settings-card">
        <template #header>
          <span class="card-header">Perfil</span>
        </template>

        <div class="avatar-section">
          <div class="avatar-wrapper">
            <el-avatar :size="80" :src="getAvatarUrl(authStore.user?.avatarUrl, authStore.user?.username || '')" />
            <button
              type="button"
              class="avatar-edit-btn"
              :disabled="avatarUploading"
              title="Alterar avatar"
              @click="triggerAvatarUpload"
            >
              <el-icon v-if="!avatarUploading"><Camera /></el-icon>
              <el-icon v-else class="is-loading"><Loading /></el-icon>
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

        <el-form @submit.prevent="saveProfile" label-position="top">
          <el-form-item label="Alterar senha">
            <div class="password-grid">
              <el-input v-model="currentPassword" type="password" show-password placeholder="Senha atual" />
              <el-input v-model="newPassword" type="password" show-password placeholder="Nova senha (mín. 6)" />
              <el-input v-model="confirmPassword" type="password" show-password placeholder="Confirmar nova senha" />
              <el-button type="primary" :loading="passwordLoading" @click="savePassword">
                Alterar senha
              </el-button>
            </div>
          </el-form-item>

          <el-form-item label="Status">
            <el-select
              :model-value="authStore.user?.status || 'ONLINE'"
              class="w-full"
              :loading="statusLoading"
              @change="changeStatus"
            >
              <el-option
                v-for="option in STATUS_OPTIONS"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="Nome de Exibição">
            <el-input v-model="displayName" placeholder="Seu nome" />
          </el-form-item>

          <el-form-item label="Bio">
            <el-input
              v-model="bio"
              type="textarea"
              :rows="3"
              placeholder="Conte sobre você..."
            />
          </el-form-item>

          <el-button type="primary" :loading="loading" @click="saveProfile">
            Salvar Alterações
          </el-button>
        </el-form>
      </el-card>

      <el-card class="settings-card">
        <template #header>
          <span class="card-header">Áudio e Vídeo</span>
        </template>

        <el-form label-position="top">
          <el-form-item label="Microfone Padrão">
            <el-select placeholder="Selecionar microfone" class="w-full">
              <el-option label="Padrão do sistema" value="default" />
            </el-select>
          </el-form-item>

          <el-form-item label="Alto-falante Padrão">
            <el-select placeholder="Selecionar alto-falante" class="w-full">
              <el-option label="Padrão do sistema" value="default" />
            </el-select>
          </el-form-item>

          <el-form-item label="Câmera Padrão">
            <el-select placeholder="Selecionar câmera" class="w-full">
              <el-option label="Nenhuma" value="none" />
            </el-select>
          </el-form-item>
        </el-form>
      </el-card>

      <el-card class="settings-card">
        <template #header>
          <span class="card-header">Aparência</span>
        </template>

        <el-form label-position="top">
          <el-form-item label="Tema">
            <el-switch
              active-text="Escuro"
              inactive-text="Claro"
              model-value
            />
          </el-form-item>
        </el-form>
      </el-card>

      <el-card v-if="isAdmin" class="settings-card">
        <template #header>
          <span class="card-header">Gerenciar Usuários</span>
        </template>

        <div class="users-manage-list">
          <div
            v-for="user in presenceStore.users"
            :key="user.id"
            class="user-manage-row"
          >
            <el-avatar :size="32" :src="getAvatarUrl(user.avatarUrl, user.username)" />
            <div class="user-manage-info">
              <span class="user-manage-name">{{ user.displayName }}</span>
              <span class="user-manage-username">@{{ user.username }}</span>
            </div>
            <el-select
              :model-value="user.role || 'USER'"
              size="small"
              class="role-select"
              :disabled="user.id === authStore.user?.id"
              @change="(role: any) => changeUserRole(user.id, role as UserRole)"
            >
              <el-option
                v-for="option in ROLE_OPTIONS"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </div>
        </div>
      </el-card>
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
  background-color: var(--absono-surface-1) !important;
  border: 1px solid var(--absono-border) !important;
  border-radius: var(--radius-xl) !important;
}

.card-header {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--absono-text);
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

  .el-icon {
    font-size: 14px;
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
</style>
