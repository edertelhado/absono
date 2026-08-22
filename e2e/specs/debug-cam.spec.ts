import { test, expect } from '@playwright/test'
import { ensureUser, uniqueSuffix } from '../helpers/api'
import { loginViaUi, openChannel } from '../helpers/ui'

test('DEBUG câmera', async ({ page }) => {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning' || m.text().includes('[SC-FAIL]')) {
      console.log(`PAGE(${m.type()}): ${m.text().slice(0, 200)}`)
    }
  })

  const username = `cam_${uniqueSuffix()}`
  await ensureUser(username)
  // intercepta structuredClone que falha e loga o conteúdo
  await page.addInitScript(() => {
    const orig = window.structuredClone.bind(window)
    window.structuredClone = function (val: any, opts?: any) {
      try {
        return orig(val, opts)
      } catch (e) {
        console.warn('[SC-FAIL] tipo:', typeof val, '| keys:', Object.keys(val ?? {}))
        for (const k of Object.keys(val ?? {})) {
          const v = (val as any)[k]
          console.warn(`[SC-FAIL] ${k}:`, typeof v, String(v).slice(0, 60))
        }
        throw e
      }
    }
  })

  await loginViaUi(page, username)
  await openChannel(page, 'Reunião')
  await page.getByRole('button', { name: 'Entrar na Chamada' }).click()
  await expect(page.locator('.call-active')).toBeVisible({ timeout: 20_000 })
  test.setTimeout(60_000)

  const result = await page.evaluate(async () => {
    const app = (document.querySelector('#app') as any).__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('voice')
    try {
      await store.toggleCamera()
      return 'OK — câmera habilitada'
    } catch (e: any) {
      return `${e.name}: ${e.message}\nSTACK:\n${(e.stack || '').slice(0, 1200)}`
    }
  })
  console.log('RESULTADO:', result)

  const state = await page.evaluate(() => {
    const app = (document.querySelector('#app') as any).__vue_app__
    const s = app.config.globalProperties.$pinia.state.value.voice
    return {
      isCameraEnabled: s.isCameraEnabled,
      revision: s.revision,
      localHasPub: !!s.localParticipant,
      toasts: Array.from(document.querySelectorAll('.el-message')).map(e => e.textContent?.trim()),
      localCardHtml: document.querySelector('.participant-card.local')?.innerHTML.slice(0, 300),
    }
  })
  console.log('STATE:', JSON.stringify(state, null, 2))
})
