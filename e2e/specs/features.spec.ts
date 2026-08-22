import { test, expect } from '@playwright/test'
import { ensureUser, uniqueSuffix } from '../helpers/api'
import { loginViaUi, openChannel, sendMessage } from '../helpers/ui'

test('markdown rico renderiza na mensagem', async ({ page }) => {
  const username = `md_${uniqueSuffix()}`
  await ensureUser(username)
  await loginViaUi(page, username)
  await openChannel(page, 'geral')

  // input é single-line: cada bloco vai em uma mensagem
  await sendMessage(page, '## Título Rico')
  await sendMessage(page, '**negrito** e *itálico* e __sublinhado__')
  await sendMessage(page, '- item um')
  await sendMessage(page, '> citação')
  await sendMessage(page, '`codigo`')

  const mdOf = (t: string) => page.locator('.message-wrapper', { hasText: t }).last().locator('.message-text.md')

  await expect(mdOf('Título Rico').locator('h2')).toContainText('Título Rico')
  await expect(mdOf('sublinhado').locator('strong')).toHaveText('negrito')
  await expect(mdOf('sublinhado').locator('em')).toHaveText('itálico')
  await expect(mdOf('sublinhado').locator('u')).toHaveText('sublinhado')
  await expect(mdOf('item um').locator('li')).toHaveText('item um')
  await expect(mdOf('citação').locator('blockquote')).toContainText('citação')
  await expect(mdOf('codigo').locator('code')).toHaveText('codigo')

  // HTML perigoso é sanitizado
  const evil = `<img src=x onerror="window.__pwned=1">inocente`
  await sendMessage(page, evil)
  const evilMsg = page.locator('.message-wrapper', { hasText: 'inocente' }).last()
  await expect(evilMsg).toBeVisible({ timeout: 15_000 })
  expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined()
})

test('reações: adicionar, ver no outro usuário, alternar', async ({ browser }) => {
  const suffix = uniqueSuffix()
  const alice = `re_${suffix}`
  const bob = `rb_${suffix}`
  await Promise.all([ensureUser(alice), ensureUser(bob)])

  const aliceCtx = await browser.newContext()
  const bobCtx = await browser.newContext()
  const alicePage = await aliceCtx.newPage()
  const bobPage = await bobCtx.newPage()

  await loginViaUi(alicePage, alice)
  await loginViaUi(bobPage, bob)
  await openChannel(bobPage, 'geral')
  await openChannel(alicePage, 'geral')

  const text = `mensagem para reagir ${suffix}`
  await sendMessage(alicePage, text)
  const msgBob = bobPage.locator('.message-wrapper', { hasText: text }).first()
  await expect(msgBob).toBeVisible()

  // Alice reage com 👍 via seletor
  const msgAlice = alicePage.locator('.message-wrapper', { hasText: text }).first()
  await msgAlice.hover()
  await msgAlice.locator('.reaction-add').click()
  await alicePage.locator('.emoji-grid:visible button', { hasText: '👍' }).click()

  // chip aparece nos dois
  const chipAlice = msgAlice.locator('.reaction-chip', { hasText: '👍' })
  const chipBob = msgBob.locator('.reaction-chip', { hasText: '👍' })
  await expect(chipAlice).toBeVisible({ timeout: 15_000 })
  await expect(chipBob).toBeVisible({ timeout: 15_000 })
  await expect(chipAlice).toHaveClass(/mine/)
  await expect(chipBob).not.toHaveClass(/mine/)

  // bob clica no chip: contagem vai a 2 e marca como dele
  await bobPage.hover('.message-wrapper >> nth=-1').catch(() => {})
  await chipBob.click()
  await expect(chipAlice).toContainText('2', { timeout: 15_000 })
  await expect(chipBob).toHaveClass(/mine/, { timeout: 15_000 })

  // bob alterna de volta: contagem volta a 1
  await chipBob.click()
  await expect(chipAlice).toContainText('1', { timeout: 15_000 })

  await aliceCtx.close()
  await bobCtx.close()
})

test('status manual muda o indicador para os outros usuários', async ({ browser }) => {
  const suffix = uniqueSuffix()
  const alice = `st_${suffix}`
  const bob = `sb_${suffix}`
  await Promise.all([ensureUser(alice), ensureUser(bob)])

  const aliceCtx = await browser.newContext()
  const bobCtx = await browser.newContext()
  const alicePage = await aliceCtx.newPage()
  const bobPage = await bobCtx.newPage()

  await loginViaUi(alicePage, alice)
  await loginViaUi(bobPage, bob)

  // alice escolhe "Ausente" no rodapé da sidebar
  await alicePage.locator('.me-chip').click()
  await alicePage.getByRole('menuitem', { name: /Ausente/ }).click()
  await expect(alicePage.locator('.me-status')).toHaveText('Ausente', { timeout: 10_000 })

  // bob vê o novo status na lista
  const bobListItem = bobPage.locator('.user-item', { hasText: alice }).first()
  await expect(bobItem(bobPage, alice)).toContainText('Ausente', { timeout: 15_000 })

  await aliceCtx.close()
  await bobCtx.close()
})

function bobItem(_page: import('@playwright/test').Page, _name: string) {
  return _page.locator('.user-item', { hasText: _name }).first()
}
