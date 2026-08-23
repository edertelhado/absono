import { test, expect } from '@playwright/test'
import { ensureUser, uniqueSuffix } from '../helpers/api'
import { loginViaUi, openChannel, sendMessage, expectSidebar } from '../helpers/ui'

test('thread: responder, contador ao vivo, abrir/fechar painel', async ({ browser }) => {
  const suffix = uniqueSuffix()
  const alice = `ta_${suffix}`
  const bob = `tb_${suffix}`
  await Promise.all([ensureUser(alice), ensureUser(bob)])

  const aliceCtx = await browser.newContext()
  const bobCtx = await browser.newContext()
  const alicePage = await aliceCtx.newPage()
  const bobPage = await bobCtx.newPage()

  await loginViaUi(alicePage, alice)
  await loginViaUi(bobPage, bob)
  for (const page of [alicePage, bobPage]) {
    await openChannel(page, 'geral')
  }

  const base = `tópico principal ${suffix}`
  await sendMessage(alicePage, base)
  const msgBob = bobPage.locator('.message-wrapper', { hasText: base }).first()
  await expect(msgBob).toBeVisible({ timeout: 15_000 })

  await msgBob.hover()
  await msgBob.getByTitle('Responder em thread').click()
  await expect(bobPage.locator('.thread-panel')).toBeVisible({ timeout: 10_000 })
  await expect(bobPage.locator('.thread-empty')).toBeVisible()

  const reply = `resposta do bob ${suffix}`
  await bobPage.getByPlaceholder('Responder na thread...').fill(reply)
  await bobPage.getByPlaceholder('Responder na thread...').press('Enter')

  await expect(
    bobPage.locator('.thread-msg', { hasText: reply })
  ).toBeVisible({ timeout: 15_000 })

  const indicatorAlice = alicePage.locator('.thread-indicator', { hasText: '1 resposta' }).first()
  await expect(indicatorAlice).toBeVisible({ timeout: 15_000 })

  await indicatorAlice.click()
  await expect(alicePage.locator('.thread-panel')).toBeVisible()
  await expect(alicePage.locator('.thread-msg', { hasText: reply })).toBeVisible()

  const reply2 = `resposta da alice ${suffix}`
  await alicePage.getByPlaceholder('Responder na thread...').fill(reply2)
  await alicePage.getByPlaceholder('Responder na thread...').press('Enter')
  await expect(
    bobPage.locator('.thread-msg', { hasText: reply2 })
  ).toBeVisible({ timeout: 15_000 })
  await expect(alicePage.locator('.thread-indicator', { hasText: '2 resposta' })).toBeVisible()
  await expect(bobPage.locator('.thread-indicator', { hasText: '2 resposta' })).toBeVisible()

  await bobPage.getByTitle('Fechar thread').click()
  await expect(bobPage.locator('.thread-panel')).toHaveCount(0)

  await aliceCtx.close()
  await bobCtx.close()
})

test('mensagens de thread não aparecem no fluxo principal do canal', async ({ browser }) => {
  const suffix = uniqueSuffix()
  const alice = `iso_${suffix}`
  await ensureUser(alice)

  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await loginViaUi(page, alice)
  await openChannel(page, 'geral')

  const base = `mensagem solitária ${suffix}`
  await sendMessage(page, base)

  await page.locator('.message-wrapper', { hasText: base }).first().hover()
  await page
    .locator('.message-wrapper', { hasText: base })
    .first()
    .getByTitle('Responder em thread')
    .click()
  await expect(page.locator('.thread-panel')).toBeVisible()

  await page.getByPlaceholder('Responder na thread...').fill(`escondida ${suffix}`)
  await page.getByPlaceholder('Responder na thread...').press('Enter')
  await expect(page.locator('.thread-msg', { hasText: `escondida ${suffix}` })).toBeVisible()

  await page.reload()
  await expectSidebar(page)
  await expect(page.locator('.message-wrapper', { hasText: `escondida ${suffix}` })).toHaveCount(0, { timeout: 15_000 })
  await expect(page.locator('.message-wrapper', { hasText: base })).toBeVisible()
  await expect(page.locator('.thread-indicator', { hasText: '1 resposta' })).toBeVisible({ timeout: 15_000 })

  await ctx.close()
})
