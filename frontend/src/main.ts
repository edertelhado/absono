import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/useAuthStore'
import './styles/main.scss'

const app = createApp(App)
const pinia = createPinia()

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(pinia)
app.use(router)
app.use(ElementPlus, { size: 'default' })

// restaura a sessão antes de montar: o vue-router dispara a navegação
// inicial já no install, então o guard precisa da sessão pronta — e se ela
// chegou depois, devolve o usuário autenticado que caiu em /login
const authStore = useAuthStore()
authStore.init().catch(() => {}).finally(() => {
  router.isReady().then(() => {
    if (authStore.isAuthenticated && router.currentRoute.value.name === 'login') {
      router.replace({ name: 'home' })
    }
    app.mount('#app')
  })
})
