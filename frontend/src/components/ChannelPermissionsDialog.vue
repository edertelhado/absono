<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { ChannelPermission, User } from '@/types'
import { usePermissionStore } from '@/stores/usePermissionStore'
import { usePresenceStore } from '@/stores/usePresenceStore'
import { useToast } from '@/composables/useToast'
import {
  DialogRoot, DialogPortal, DialogOverlay, DialogContent,
  DialogTitle, DialogClose,
  SwitchRoot, SwitchThumb,
} from 'reka-ui'
import { PhPencilSimple, PhTrash } from '@phosphor-icons/vue'

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
const toast = useToast()

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
    toast.error(e.response?.data?.message || 'Erro ao carregar permissões')
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
    toast.success('Permissão salva')
  } catch (e: any) {
    toast.error(e.response?.data?.message || 'Erro ao salvar permissão')
  } finally {
    saving.value = false
  }
}

async function removePermission(permission: ChannelPermission) {
  try {
    await permissionStore.deletePermission(props.channelId, permission.userId)
    await loadPermissions()
    toast.success('Permissão removida')
  } catch (e: any) {
    toast.error(e.response?.data?.message || 'Erro ao remover permissão')
  }
}
</script>

<template>
  <DialogRoot :open="visible" @update:open="(v: boolean) => visible = v">
    <DialogPortal>
      <DialogOverlay class="dialog-overlay" />
      <DialogContent class="dialog-content permissions-dialog">
        <DialogTitle class="dialog-title">Permissões — #{{ channelName }}</DialogTitle>

        <div class="dialog-body">
          <div v-if="loading" class="loading-state">Carregando...</div>

          <template v-else>
            <div class="permissions-header">
              <span class="hint">
                Canais com permissões explícitas ficam restritos aos usuários listados.
              </span>
              <button class="btn btn-primary btn-sm" @click="openAddDialog" :disabled="availableUsers.length === 0">
                Adicionar usuário
              </button>
            </div>

            <div v-if="permissions.length === 0" class="empty-state">
              Nenhuma permissão explícita. O canal está aberto a todos os usuários.
            </div>

            <div v-else class="permission-list">
              <div v-for="perm in permissions" :key="perm.id" class="permission-item">
                <div class="perm-user">
                  <span class="perm-name">{{ userName(perm.userId) }}</span>
                </div>
                <div class="perm-flags">
                  <span class="badge" :class="perm.canRead ? 'badge-success' : 'badge-muted'">Ler</span>
                  <span class="badge" :class="perm.canWrite ? 'badge-success' : 'badge-muted'">Escrever</span>
                  <span class="badge" :class="perm.canManage ? 'badge-success' : 'badge-muted'">Gerenciar</span>
                </div>
                <div class="perm-actions">
                  <button class="btn-icon" @click="openEditDialog(perm)" title="Editar">
                    <PhPencilSimple :size="16" />
                  </button>
                  <button class="btn-icon" @click="removePermission(perm)" title="Remover">
                    <PhTrash :size="16" />
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>

        <div class="dialog-footer">
          <DialogClose class="btn btn-default" as-child>
            <button>Fechar</button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>

  <DialogRoot :open="addDialogVisible" @update:open="(v: boolean) => addDialogVisible = v">
    <DialogPortal>
      <DialogOverlay class="dialog-overlay" />
      <DialogContent class="dialog-content" style="max-width: 420px;">
        <DialogTitle class="dialog-title">
          {{ editingUserId ? 'Editar permissão' : 'Adicionar permissão' }}
        </DialogTitle>

        <div class="form-group">
          <label class="form-label">Usuário</label>
          <div class="select-trigger">
            <select v-model="selectedUserId" :disabled="!!editingUserId" class="w-full">
              <option value="" disabled>Selecionar usuário</option>
              <option
                v-for="user in (editingUserId ? presenceStore.users : availableUsers)"
                :key="user.id"
                :value="user.id"
              >
                {{ user.displayName }}
              </option>
            </select>
          </div>
        </div>

        <div class="form-group" style="margin-top: var(--space-md);">
          <label class="form-label">Permissões</label>
          <div class="checkbox-group">
            <label class="switch">
              <SwitchRoot :checked="newPerm.canRead" @update:checked="(v: boolean) => newPerm.canRead = v" class="switch-root">
                <SwitchThumb class="switch-thumb" />
              </SwitchRoot>
              <span>Ler mensagens</span>
            </label>
            <label class="switch">
              <SwitchRoot :checked="newPerm.canWrite" @update:checked="(v: boolean) => newPerm.canWrite = v" class="switch-root">
                <SwitchThumb class="switch-thumb" />
              </SwitchRoot>
              <span>Enviar mensagens</span>
            </label>
            <label class="switch">
              <SwitchRoot :checked="newPerm.canManage" @update:checked="(v: boolean) => newPerm.canManage = v" class="switch-root">
                <SwitchThumb class="switch-thumb" />
              </SwitchRoot>
              <span>Gerenciar canal</span>
            </label>
          </div>
        </div>

        <div class="dialog-footer">
          <DialogClose class="btn btn-default" as-child>
            <button>Cancelar</button>
          </DialogClose>
          <button
            class="btn btn-primary"
            :disabled="!selectedUserId || saving"
            @click="savePermission"
          >
            {{ saving ? 'Salvando...' : 'Salvar' }}
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped lang="scss">
.dialog-body {
  min-height: 120px;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  color: var(--absono-text-muted);
  font-size: 13px;
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
