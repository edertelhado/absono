<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/useAuthStore'
import { ElMessage } from 'element-plus'

const authStore = useAuthStore()
const router = useRouter()

const username = ref('')
const password = ref('')
const loading = ref(false)

async function handleLogin() {
  if (!username.value || !password.value) {
    ElMessage.warning('Preencha todos os campos')
    return
  }

  loading.value = true
  try {
    await authStore.login(username.value, password.value)
    router.push('/')
  } catch (e: any) {
    ElMessage.error(e.response?.data?.message || 'Erro ao fazer login')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-view">
    <div class="login-card">
      <div class="login-accent" />

      <div class="login-body">
        <div class="login-header">
          <h1 class="login-title">Ábsono</h1>
          <p class="login-subtitle">Entre na sua conta para continuar</p>
        </div>

        <el-form @submit.prevent="handleLogin" class="login-form">
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
              v-model="password"
              type="password"
              placeholder="Senha"
              size="large"
              prefix-icon="Lock"
              show-password
            />
          </el-form-item>

          <el-button
            type="primary"
            size="large"
            :loading="loading"
            class="login-button"
            @click="handleLogin"
          >
            Entrar
          </el-button>
        </el-form>

        <div class="login-footer">
          <span class="login-footer-text">Não tem conta?</span>
          <router-link to="/register" class="login-link">Criar conta</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.login-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: var(--absono-bg-base);
}

.login-card {
  width: 400px;
  background: var(--absono-surface-1);
  border-radius: var(--radius-xl);
  border: 1px solid var(--absono-border);
  overflow: hidden;
  box-shadow:
    0 0 0 1px var(--absono-border-subtle),
    0 8px 32px rgba(0, 0, 0, 0.3);
}

.login-accent {
  height: 3px;
  background: linear-gradient(90deg, var(--absono-primary), var(--absono-primary-hover));
}

.login-body {
  padding: var(--space-2xl) var(--space-2xl) var(--space-xl);
}

.login-header {
  text-align: center;
  margin-bottom: var(--space-2xl);
}

.login-title {
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 700;
  color: var(--absono-text);
  margin-bottom: var(--space-sm);
  letter-spacing: -0.02em;
}

.login-subtitle {
  color: var(--absono-text-muted);
  font-size: 14px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.login-button {
  width: 100%;
  height: 44px;
  margin-top: var(--space-sm);
  font-size: 14px;
}

.login-footer {
  text-align: center;
  margin-top: var(--space-xl);
  font-size: 13px;
}

.login-footer-text {
  color: var(--absono-text-muted);
}

.login-link {
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
