import { test } from '@playwright/test'
import { ensureUser, uniqueSuffix } from '../helpers/api'
import { loginViaUi } from '../helpers/ui'

test('DEBUG dm', async ({ page }) => {
  const net: string[] = []
  page.on('response', (r) => { if (r.url().includes('/api/dm')) net.push(`${r.status()} ${r.request().method()} ${r.url()}`) })
  page.on('console', (m) => { if (m.type() === 'error') console.log('ERR:', m.text().slice(0, 150)) })

  const alice = `dx_${uniqueSuffix()}`
  const bob = `dy_${uniqueSuffix()}`
  await Promise.all([ensureUser(alice), ensureUser(bob)])
  await loginViaUi(page, alice)

  const item = page.locator('.user-item', { hasText: bob }).first()
  await item.hover()
  await page.waitForTimeout(800)
  const info = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.user-item'))
    const target = items.find(i => i.textContent.includes('dy_'))
    if (!target) return { found: false }
    const btn = target.querySelector('.dm-btn')
    const r = btn ? btn.getBoundingClientRect() : null
    return {
      found: true,
      group: target.closest('.list-group-title') ? target.previousElementSibling?.textContent : null,
      btnExists: !!btn,
      rect: r ? { w: r.width, h: r.height } : null,
      styleDisplay: btn ? getComputedStyle(btn).display : null,
      styleOpacity: btn ? getComputedStyle(btn).opacity : null,
      html: target.innerHTML.slice(0, 300),
    }
  })
  console.log('INFO:', JSON.stringify(info))
  const btnVisible = info.btnExists && info.rect && info.rect.w > 0
  console.log('BTN VISIVEL:', btnVisible)
  if (btnVisible) {
    await item.locator('.dm-btn').click()
    await page.waitForTimeout(2500)
  }

  console.log('URL:', page.url())
  console.log('NET:', JSON.stringify(net))
  console.log('TOASTS:', JSON.stringify(await page.evaluate(() =>
    Array.from(document.querySelectorAll('.el-message')).map(e => e.textContent?.trim()))))
})
