import { test, expect } from '@playwright/test'
import { ensureUser, uniqueSuffix } from '../helpers/api'
import { loginViaUi, openChannel } from '../helpers/ui'

test('DEBUG share', async ({ page }) => {
  const all: string[] = []
  page.on('console', (m) => {
    all.push(`${m.type()}: ${m.text().slice(0, 160)}`)
    if (m.type() === 'error') console.log(`PAGE(err): ${m.text().slice(0, 300)}`)
  })
  page.on('pageerror', (e) => console.log(`PAGEEXCEPTION: ${String(e).slice(0, 300)}`))

  const username = `shr_${uniqueSuffix()}`
  await ensureUser(username)
  await loginViaUi(page, username)
  await openChannel(page, 'Reunião')
  await page.getByRole('button', { name: 'Entrar na Chamada' }).click()
  await expect(page.locator('.call-active')).toBeVisible({ timeout: 20_000 })
  test.setTimeout(90_000)

  await page.getByTitle('Compartilhar tela').click()
  await page.waitForTimeout(4000)

  async function dump(label: string) {
    const st = await page.evaluate(() => {
      const app = (document.querySelector('#app') as any).__vue_app__
      const s = app.config.globalProperties.$pinia.state.value.voice
      const spot = document.querySelector('.spotlight-area')
      return {
        isScreenSharing: s.isScreenSharing,
        hasLocalTrack: !!s.localScreenShareTrack,
        spotlightChildren: spot ? Array.from(spot.children).map((c) => `${c.tagName}.${(c.className || '').toString().slice(0, 30)}`) : [],
        badgeTexts: Array.from(document.querySelectorAll('.share-badge')).map((b) => b.textContent?.trim()?.slice(0, 40)),
      }
    })
    console.log(`${label}:`, JSON.stringify(st))
  }

  await dump('DEPOIS SHARE')
  await page.getByTitle('Compartilhar tela').click()
  await page.waitForTimeout(3000)
  await dump('DEPOIS STOP')

  // força reavaliação dos computeds
  await page.evaluate(() => {
    const app = (document.querySelector('#app') as any).__vue_app__
    const store = app.config.globalProperties.$pinia._s.get('voice')
    store.revision++
  })
  await page.waitForTimeout(1000)
  await dump('APOS FORCE REVISION')
  void all
})
