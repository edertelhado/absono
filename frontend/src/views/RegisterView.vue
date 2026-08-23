<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'
import { ElMessage } from 'element-plus'
import api from '@/services/auth'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const username = ref('')
const displayName = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const inviteValid = ref(false)
const inviteLoading = ref(true)
const inviteError = ref('')
const inviteExpiresAt = ref('')
const inviteRemaining = ref(0)

const inviteCode = ref((route.query.invite as string) || '')

onMounted(async () => {
  if (!inviteCode.value) {
    inviteError.value = 'Link de convite invalido ou ausente.'
    inviteLoading.value = false
    return
  }
  try {
    const { data } = await api.get(`/invites/validate/${inviteCode.value}`)
    inviteValid.value = data.valid
    inviteExpiresAt.value = new Date(data.expiresAt).toLocaleString('pt-BR')
    inviteRemaining.value = data.remainingUses
  } catch (e: any) {
    inviteError.value = e.response?.data?.message || 'Convite invalido ou expirado.'
  } finally {
    inviteLoading.value = false
  }
})

async function handleRegister() {
  if (!username.value || !displayName.value || !password.value) {
    ElMessage.warning('Preencha todos os campos')
    return
  }

  if (password.value !== confirmPassword.value) {
    ElMessage.warning('As senhas nao coincidem')
    return
  }

  if (password.value.length < 6) {
    ElMessage.warning('A senha deve ter pelo menos 6 caracteres')
    return
  }

  loading.value = true
  try {
    await authStore.register(username.value, displayName.value, password.value, inviteCode.value)
    router.push('/')
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || 'Erro ao criar conta')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="register-view">
    <div class="register-card">
      <div class="register-accent" />

      <div class="register-body">
        <div class="register-header">
          <h1 class="register-title">Absono</h1>
          <p class="register-subtitle">Crie sua conta</p>
        </div>

        <div v-if="inviteLoading" class="invite-status">
          <el-icon class="is-loading" :size="24"><Loading /></el-icon>
          <span>Validando convite...</span>
        </div>

        <div v-else-if="inviteError" class="invite-error">
          <el-icon :size="24"><CircleCloseFilled /></el-icon>
          <span>{{ inviteError }}</span>
          <router-link to="/login" class="back-link">Voltar para o login</router-link>
        </div>

        <template v-else>
          <div class="invite-info">
            <el-icon :size="16"><InfoFilled /></el-icon>
            <span>Convite valido ate {{ inviteExpiresAt }} ({{ inviteRemaining }} uso{{ inviteRemaining !== 1 ? 's' : '' }} restante{{ inviteRemaining !== 1 ? 's' : '' }})</span>
          </div>

          <el-form @submit.prevent="handleRegister" class="register-form">
            <el-form-item>
              <el-input
                v-model="username"
                placeholder="Username"
                size="large"
                prefix-icon="User"
              />
            </el-form-item>

            <el-form-item>
              <el-input
                v-model="displayName"
                placeholder="Nome de exibicao"
                size="large"
                prefix-icon="UserFilled"
              />
            </el-form-item>

            <el-form-item>
              <el-input
                v-model="password"
                type="password"
                placeholder="Senha"
                size="large"
                prefix-icon="Lock"
                show-password
              />
            </el-form-item>

            <el-form-item>
              <el-input
                v-model="confirmPassword"
                type="password"
                placeholder="Confirmar senha"
                size="large"
                prefix-icon="Lock"
                show-password
              />
            </el-form-item>

            <el-button
              type="primary"
              size="large"
              :loading="loading"
              class="register-button"
              @click="handleRegister"
            >
              Criar conta
            </el-button>
          </el-form>
        </template>

        <div class="register-footer">
          <span class="register-footer-text">Ja tem conta?</span>
          <router-link to="/login" class="register-link">Fazer login</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.register-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: var(--absono-bg-base);
}

.register-card {
  width: 400px;
  background: var(--absono-surface-1);
  border-radius: var(--radius-xl);
  border: 1px solid var(--absono-border);
  overflow: hidden;
  box-shadow:
    0 0 0 1px var(--absono-border-subtle),
    0 8px 32px rgba(0, 0, 0, 0.3);
}

.register-accent {
  height: 3px;
  background: linear-gradient(90deg, var(--absono-primary), var(--absono-primary-hover));
}

.register-body {
  padding: var(--space-2xl) var(--space-2xl) var(--space-xl);
}

.register-header {
  text-align: center;
  margin-bottom: var(--space-2xl);
}

.register-title {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  color: var(--absono-text);
  margin-bottom: var(--space-sm);
  letter-spacing: -0.02em;
}

.register-subtitle {
  color: var(--absono-text-muted);
  font-size: 14px;
}

.invite-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-xl);
  color: var(--absono-text-muted);
  font-size: 14px;
}

.invite-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-xl);
  color: var(--absono-danger, #ef4444);
  font-size: 14px;
  text-align: center;
}

.back-link {
  color: var(--absono-primary);
  text-decoration: none;
  font-weight: 500;

  &:hover {
    text-decoration: underline;
  }
}

.invite-info {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  margin-bottom: var(--space-lg);
  background-color: var(--absono-surface-2);
  border-radius: var(--radius-md);
  font-size: 12px;
  color: var(--absono-text-muted);
}

.register-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.register-button {
  width: 100%;
  height: 44px;
  margin-top: var(--space-sm);
  font-size: 14px;
}

.register-footer {
  text-align: center;
  margin-top: var(--space-xl);
  font-size: 13px;
}

.register-footer-text {
  color: var(--absono-text-muted);
}

.register-link {
  color: var(--absono-primary);
  text-decoration: none;
  font-weight: 500;
  margin-left: var(--space-xs);
  transition: color 0.15s ease;

  &:hover {
    color: var(--absono-primary-hover);
  }
}
</style>
