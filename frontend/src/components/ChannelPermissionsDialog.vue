<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { ChannelPermission, User } from '@/types'
import { usePermissionStore } from '@/stores/usePermissionStore'
import { usePresenceStore } from '@/stores/usePresenceStore'
import { authService } from '@/services/auth'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  modelValue: boolean
  channelId: string
  channelName: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const permissionStore = usePermissionStore()
const presenceStore = usePresenceStore()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const permissions = ref<ChannelPermission[]>([])
const loading = ref(false)
const saving = ref(false)

const addDialogVisible = ref(false)
const selectedUserId = ref('')
const newPerm = ref({ canRead: true, canWrite: true, canManage: false })
const editingUserId = ref<string | null>(null)

const availableUsers = computed<User[]>(() => {
  const assigned = new Set(permissions.value.map(p => p.userId))
  return presenceStore.users.filter(u => !assigned.has(u.id))
})

watch(visible, async (isOpen) => {
  if (isOpen) {
    await loadPermissions()
  }
})

async function loadPermissions() {
  loading.value = true
  try {
    permissions.value = await permissionStore.fetchPermissions(props.channelId)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || 'Erro ao carregar permissões')
    visible.value = false
  } finally {
    loading.value = false
  }
}

function userName(userId: string): string {
  const user = presenceStore.users.find(u => u.id === userId)
  return user?.displayName || userId
}

function openAddDialog() {
  selectedUserId.value = ''
  newPerm.value = { canRead: true, canWrite: true, canManage: false }
  editingUserId.value = null
  addDialogVisible.value = true
}

function openEditDialog(permission: ChannelPermission) {
  selectedUserId.value = permission.userId
  newPerm.value = {
    canRead: permission.canRead,
    canWrite: permission.canWrite,
    canManage: permission.canManage,
  }
  editingUserId.value = permission.userId
  addDialogVisible.value = true
}

async function savePermission() {
  if (!selectedUserId.value) return

  saving.value = true
  try {
    await permissionStore.setPermission(props.channelId, {
      userId: selectedUserId.value,
      ...newPerm.value,
    })
    await loadPermissions()
    addDialogVisible.value = false
    ElMessage.success('Permissão salva')
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || 'Erro ao salvar permissão')
  } finally {
    saving.value = false
  }
}

async function removePermission(permission: ChannelPermission) {
  try {
    await permissionStore.deletePermission(props.channelId, permission.userId)
    await loadPermissions()
    ElMessage.success('Permissão removida')
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || 'Erro ao remover permissão')
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`Permissões — #${channelName}`"
    width="560px"
    class="permissions-dialog"
  >
    <div v-loading="loading" class="dialog-body">
      <div class="permissions-header">
        <span class="hint">
          Canais com permissões explícitas ficam restritos aos usuários listados.
        </span>
        <el-button type="primary" size="small" @click="openAddDialog" :disabled="availableUsers.length === 0">
          Adicionar usuário
        </el-button>
      </div>

      <div v-if="permissions.length === 0 && !loading" class="empty-state">
        Nenhuma permissão explícita. O canal está aberto a todos os usuários.
      </div>

      <div v-else class="permission-list">
        <div v-for="perm in permissions" :key="perm.id" class="permission-item">
          <div class="perm-user">
            <span class="perm-name">{{ userName(perm.userId) }}</span>
          </div>
          <div class="perm-flags">
            <el-tag :type="perm.canRead ? 'success' : 'info'" size="small">Ler</el-tag>
            <el-tag :type="perm.canWrite ? 'success' : 'info'" size="small">Escrever</el-tag>
            <el-tag :type="perm.canManage ? 'warning' : 'info'" size="small">Gerenciar</el-tag>
          </div>
          <div class="perm-actions">
            <el-button text circle size="small" @click="openEditDialog(perm)">
              <el-icon><Edit /></el-icon>
            </el-button>
            <el-button text circle size="small" type="danger" @click="removePermission(perm)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="addDialogVisible"
      :title="editingUserId ? 'Editar permissão' : 'Adicionar permissão'"
      width="420px"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item label="Usuário">
          <el-select
            v-model="selectedUserId"
            placeholder="Selecionar usuário"
            class="w-full"
            :disabled="!!editingUserId"
            filterable
          >
            <el-option
              v-for="user in (editingUserId ? presenceStore.users : availableUsers)"
              :key="user.id"
              :label="user.displayName"
              :value="user.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="Permissões">
          <div class="checkbox-group">
            <el-checkbox v-model="newPerm.canRead">Ler mensagens</el-checkbox>
            <el-checkbox v-model="newPerm.canWrite">Enviar mensagens</el-checkbox>
            <el-checkbox v-model="newPerm.canManage">Gerenciar canal</el-checkbox>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="addDialogVisible = false">Cancelar</el-button>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="!selectedUserId"
          @click="savePermission"
        >
          Salvar
        </el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<style scoped lang="scss">
.dialog-body {
  min-height: 120px;
}

.permissions-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}

.hint {
  font-size: 12px;
  color: var(--absono-text-muted);
}

.empty-state {
  text-align: center;
  padding: var(--space-xl);
  color: var(--absono-text-muted);
  font-size: 13px;
}

.permission-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.permission-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background-color: var(--absono-surface-2);
  border-radius: var(--radius-md);

  &:hover {
    .perm-actions {
      opacity: 1;
    }
  }
}

.perm-user {
  flex: 1;
  min-width: 0;
}

.perm-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--absono-text);
}

.perm-flags {
  display: flex;
  gap: var(--space-xs);
}

.perm-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.w-full {
  width: 100%;
}
</style>
