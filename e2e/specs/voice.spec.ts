import { test, expect } from '@playwright/test'
import { ensureUser, uniqueSuffix } from '../helpers/api'
import { loginViaUi, openChannel, expectSidebar } from '../helpers/ui'

test('dois usuários entram na mesma chamada e se veem na sidebar', async ({ browser }) => {
  const suffix = uniqueSuffix()
  const alice = `vz_${suffix}`
  const bob = `vy_${suffix}`
  await Promise.all([ensureUser(alice), ensureUser(bob)])

  const aliceCtx = await browser.newContext()
  const bobCtx = await browser.newContext()
  const alicePage = await aliceCtx.newPage()
  const bobPage = await bobCtx.newPage()

  await loginViaUi(alicePage, alice)
  await loginViaUi(bobPage, bob)

  // ambos entram no canal de voz "Reunião"
  for (const page of [alicePage, bobPage]) {
    await openChannel(page, 'Reunião')
    await page.getByRole('button', { name: 'Entrar na Chamada' }).click()
    await expect(page.locator('.participant-name', { hasText: 'Você' })).toBeVisible({ timeout: 20_000 })
  }

  // cada um vê o outro no grid (nome do outro usuário)
  await expect(bobPage.locator('.participant-name', { hasText: alice })).toBeVisible({ timeout: 20_000 })
  await expect(alicePage.locator('.participant-name', { hasText: bob })).toBeVisible({ timeout: 20_000 })

  // contador na sidebar reflete os dois conectados
  const voiceItem = alicePage.locator('.channel-item', { hasText: 'Reunião' }).first()
  await expect(voiceItem.locator('.voice-count')).toHaveText('2', { timeout: 25_000 })

  await aliceCtx.close()
  await bobCtx.close()
})

test('navegar para canal de texto mantém a chamada ativa', async ({ browser }) => {
  const suffix = uniqueSuffix()
  const alice = `nav_${suffix}`
  await ensureUser(alice)

  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await loginViaUi(page, alice)

  await openChannel(page, 'Reunião')
  await page.getByRole('button', { name: 'Entrar na Chamada' }).click()
  await expect(page.locator('.participant-card')).toHaveCount(1, { timeout: 20_000 })

  // vai para um canal de TEXTO — não deve desconectar
  await openChannel(page, 'geral')
  await expect(page.locator('.chat-input-area')).toBeVisible()

  // barra de status de voz visível com controles
  const bar = page.locator('.voice-status-bar')
  await expect(bar).toBeVisible()
  await expect(bar.locator('.vsb-name')).toHaveText('Reunião')
  await expect(bar.locator('.vsb-controls button')).toHaveCount(4)

  // volta para o canal de voz — ainda conectado, sem lobby
  await openChannel(page, 'Reunião')
  await expect(page.locator('.call-active')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Entrar na Chamada' })).toHaveCount(0)

  await ctx.close()
})

test('desconectar pela barra de status encerra a chamada', async ({ browser }) => {
  const suffix = uniqueSuffix()
  const alice = `dsc_${suffix}`
  await ensureUser(alice)

  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await loginViaUi(page, alice)

  await openChannel(page, 'Reunião')
  await page.getByRole('button', { name: 'Entrar na Chamada' }).click()
  await expect(page.locator('.call-active')).toBeVisible({ timeout: 20_000 })

  await openChannel(page, 'avisos')
  await page.locator('.voice-status-bar').getByTitle('Desconectar').click()

  // volta ao canal de voz: deve mostrar o lobby (desconectado)
  await openChannel(page, 'Reunião')
  await expect(page.getByRole('button', { name: 'Entrar na Chamada' })).toBeVisible({ timeout: 20_000 })

  await ctx.close()
})
