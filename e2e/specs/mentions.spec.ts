import { test, expect } from '@playwright/test'
import { ensureUser, uniqueSuffix } from '../helpers/api'
import { loginViaUi, openChannel, sendMessage } from '../helpers/ui'

test('menção: autocomplete, destaque na mensagem e aviso para o mencionado', async ({ browser }) => {
  const suffix = uniqueSuffix()
  const alice = `ma_${suffix}`
  const bob = `mb_${suffix}`
  await Promise.all([ensureUser(alice), ensureUser(bob)])

  const logs: string[] = []
  const hook = (pg: import('@playwright/test').Page, tag: string) => {
    pg.on('console', (m) => { if (m.text().includes('[NOTIF]') || m.text().includes('[MENTION]')) logs.push(`${tag}: ${m.text().slice(0,140)}`) })
  }
  const aliceCtx = await browser.newContext()
  const bobCtx = await browser.newContext()
  const alicePage = await aliceCtx.newPage()
  const bobPage = await bobCtx.newPage()
  hook(alicePage, 'ALICE')
  hook(bobPage, 'BOB')

  await loginViaUi(alicePage, alice)
  await loginViaUi(bobPage, bob)
  await openChannel(bobPage, 'geral')
  await openChannel(alicePage, 'geral')

  // ===== autocomplete: digitar @bob abre sugestão; clique completa =====
  const input = alicePage.getByPlaceholder('Enviar mensagem...')
  await input.fill(`@${bob}`)
  await expect(alicePage.locator('.mention-popover')).toBeVisible({ timeout: 10_000 })
  const option = alicePage.locator('.mention-option', { hasText: bob })
  await expect(option).toBeVisible()
  await option.click()

  await expect(input).toHaveValue(`@${bob} `)
  await input.type(`olá ${suffix}!`)
  await input.press('Enter')

  const msg = bobPage.locator('.message-wrapper', { hasText: `olá ${suffix}!` }).first()
  await expect(msg).toBeVisible({ timeout: 15_000 })
  await expect(msg.locator('.mention')).toHaveText(`@${bob}`)

  // notificação direcionada aparece para o mencionado mesmo estando no canal
  await expect(
    bobPage.locator('.el-message', { hasText: 'mencionou você' })
  ).toBeVisible({ timeout: 15_000 })

  for (const l of logs.slice(-8)) console.log('CAPTURED:', l)
  await aliceCtx.close()
  await bobCtx.close()
})

test('status manual muda o indicador para os outros usuários', async ({ browser }) => {
  const suffix = uniqueSuffix()
  const alice = `st_${suffix}`
  const bob = `sb_${suffix}`
  await Promise.all([ensureUser(alice), ensureUser(bob)])

  const logs: string[] = []
  const hook = (pg: import('@playwright/test').Page, tag: string) => {
    pg.on('console', (m) => { if (m.text().includes('[NOTIF]') || m.text().includes('[MENTION]')) logs.push(`${tag}: ${m.text().slice(0,140)}`) })
  }
  const aliceCtx = await browser.newContext()
  const bobCtx = await browser.newContext()
  const alicePage = await aliceCtx.newPage()
  const bobPage = await bobCtx.newPage()

  await loginViaUi(alicePage, alice)
  await loginViaUi(bobPage, bob)

  await alicePage.locator('.me-chip').click()
  await alicePage.getByRole('menuitem', { name: /Ausente/ }).click()
  await expect(alicePage.locator('.me-status')).toHaveText('Ausente', { timeout: 10_000 })

  const bobListItem = bobPage.locator('.user-item', { hasText: alice }).first()
  await expect(bobListItem).toContainText('Ausente', { timeout: 15_000 })

  await aliceCtx.close()
  await bobCtx.close()
})
