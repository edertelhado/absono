import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/useAuthStore'
import './styles/main.scss'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// restaura a sessao antes de montar
const authStore = useAuthStore()
authStore.init().catch(() => {}).finally(() => {
  router.isReady().then(() => {
    if (authStore.isAuthenticated && router.currentRoute.value.name === 'login') {
      router.replace({ name: 'home' })
    }
    app.config.errorHandler = (err: any, instance: any, info: string) => {
      const name = instance?.$?.type?.__name || instance?.$?.type?.name || '?'
      console.error(`[VUE ERR] componente=${name} info=${info}`, err)
    }
    app.mount('#app')
  })
})
