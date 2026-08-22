import { test, expect } from '@playwright/test'
import { ensureUser, uniqueSuffix } from '../helpers/api'
import { loginViaUi, openChannel } from '../helpers/ui'

/**
 * Jornada de usuário real: entra e sai de canais, liga/desliga câmera,
 * compartilha / para / recompartilha a tela — verificando cada transição.
 */
test('jornada completa de um usuário nos canais', async ({ page }) => {
  const username = `real_${uniqueSuffix()}`
  await ensureUser(username)
  await loginViaUi(page, username)

  // ===== navega entre canais de texto =====
  await openChannel(page, 'geral')
  await expect(page.locator('.chat-input-area')).toBeVisible()
  await openChannel(page, 'avisos')
  await expect(page.locator('.chat-input-area')).toBeVisible()

  // ===== entra na chamada =====
  await openChannel(page, 'Reunião')
  await page.getByRole('button', { name: 'Entrar na Chamada' }).click()
  await expect(page.locator('.call-active')).toBeVisible({ timeout: 20_000 })

  const localCard = page.locator('.participant-card.local')

  // ===== câmera: liga → desliga → liga novamente =====
  await page.getByTitle('Câmera').click()
  await expect(localCard.locator('video.tile-video')).toBeVisible({ timeout: 15_000 })

  await page.getByTitle('Câmera').click()
  await expect(localCard.locator('.avatar-wrap')).toBeVisible({ timeout: 15_000 })
  await expect(localCard.locator('video.tile-video')).toHaveCount(0)

  await page.getByTitle('Câmera').click()
  await expect(localCard.locator('video.tile-video')).toBeVisible({ timeout: 15_000 })

  // ===== microfone: muda para mudo e volta =====
  await page.getByTitle('Microfone').click()
  await expect(localCard.locator('.mic-indicator')).toBeVisible({ timeout: 10_000 })
  await page.getByTitle('Microfone').click()
  await expect(localCard.locator('.mic-indicator')).toHaveCount(0, { timeout: 10_000 })

  // ===== compartilhar → parar → recompartilhar =====
  await page.getByTitle('Compartilhar tela').click()
  const badge = page.locator('.share-badge')
  await expect(badge).toContainText('Você está compartilhando sua tela', { timeout: 20_000 })
  await expect(page.locator('.spotlight-video')).toBeVisible()

  await page.getByTitle('Compartilhar tela').click()
  await expect(page.locator('.spotlight-area')).toHaveCount(0, { timeout: 15_000 })

  await page.getByTitle('Compartilhar tela').click()
  await expect(badge).toContainText('Você está compartilhando sua tela', { timeout: 20_000 })

  // ===== navega para texto transmitindo: barra mantém tudo vivo =====
  await openChannel(page, 'geral')
  const bar = page.locator('.voice-status-bar')
  await expect(bar).toBeVisible()
  await expect(bar.locator('.vsb-sharing')).toContainText('transmitindo', { timeout: 15_000 })

  await openChannel(page, 'avisos')
  await expect(bar.locator('.vsb-name')).toHaveText('Reunião')

  // volta para a chamada: ainda transmitindo
  await openChannel(page, 'Reunião')
  await expect(page.locator('.call-active')).toBeVisible({ timeout: 20_000 })
  await expect(badge).toContainText('Você está compartilhando sua tela', { timeout: 20_000 })

  // ===== para o share e sai da chamada =====
  await page.getByTitle('Compartilhar tela').click()
  await expect(page.locator('.spotlight-area')).toHaveCount(0, { timeout: 15_000 })

  await page.getByTitle('Desconectar').click()
  await expect(page.getByRole('button', { name: 'Entrar na Chamada' })).toBeVisible({ timeout: 15_000 })
})

test('ciclo de compartilhamento visto pelo outro participante', async ({ browser }) => {
  const suffix = uniqueSuffix()
  const alice = `shr_${suffix}`
  const bob = `vw_${suffix}`
  await Promise.all([ensureUser(alice), ensureUser(bob)])

  const aliceCtx = await browser.newContext()
  const bobCtx = await browser.newContext()
  const alicePage = await aliceCtx.newPage()
  const bobPage = await bobCtx.newPage()

  await loginViaUi(alicePage, alice)
  await loginViaUi(bobPage, bob)
  for (const page of [alicePage, bobPage]) {
    await openChannel(page, 'Reunião')
    await page.getByRole('button', { name: 'Entrar na Chamada' }).click()
    await expect(page.locator('.call-active')).toBeVisible({ timeout: 20_000 })
  }

  // os dois se veem no grid
  await expect(alicePage.locator('.participant-name', { hasText: bob })).toBeVisible({ timeout: 20_000 })
  await expect(bobPage.locator('.participant-name', { hasText: alice })).toBeVisible({ timeout: 20_000 })

  // 1ª transmissão: bob vê a tela da alice
  await alicePage.getByTitle('Compartilhar tela').click()
  await expect(
    bobPage.locator('.share-badge', { hasText: `Tela de ${alice}` })
  ).toBeVisible({ timeout: 25_000 })

  // parar: some para o bob
  await alicePage.getByTitle('Compartilhar tela').click()
  await expect(bobPage.locator('.spotlight-area')).toHaveCount(0, { timeout: 20_000 })

  // recompartilhar: bob volta a ver
  await alicePage.getByTitle('Compartilhar tela').click()
  await expect(
    bobPage.locator('.share-badge', { hasText: `Tela de ${alice}` })
  ).toBeVisible({ timeout: 25_000 })

  // bob também abre a própria câmera enquanto assiste
  await bobPage.getByTitle('Câmera').click()
  await expect(
    bobPage.locator('.participant-card.local video.tile-video')
  ).toBeVisible({ timeout: 15_000 })
  await expect(
    alicePage.locator('.participant-card:not(.local) video.tile-video')
  ).toBeVisible({ timeout: 20_000 })

  // alice desconecta; bob volta ao lobby com ele mesmo apenas
  await alicePage.getByTitle('Desconectar').click()
  await expect(bobPage.locator('.participant-name', { hasText: alice })).toHaveCount(0, { timeout: 20_000 })

  await aliceCtx.close()
  await bobCtx.close()
})
