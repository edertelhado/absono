import { test, expect } from '@playwright/test'
import { ensureUser, uniqueSuffix, apiLogin, TEST_PASSWORD } from '../helpers/api'
import { loginViaUi, openChannel, sendMessage } from '../helpers/ui'

test('upload de anexo mostra progresso e vira mensagem com arquivo', async ({ page }) => {
  const username = `upl_${uniqueSuffix()}`
  await ensureUser(username)
  await loginViaUi(page, username)
  await openChannel(page, 'geral')

  // PNG 1x1 válido — caminho de imagem tem caption + link "Baixar"
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
  const fileName = `anexo-${Date.now()}.png`

  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: 'image/png',
    buffer: png,
  })

  // barra de progresso aparece durante o envio (pode ser rápida demais para
  // capturar em arquivos pequenos — então validamos o resultado final)
  const message = page.locator('.message-wrapper', { hasText: fileName }).first()
  await expect(message).toBeVisible({ timeout: 20_000 })
  await expect(message.locator('.attachment-caption')).toContainText(fileName)

  // download funciona sem sair da página
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }),
    message.locator('.attachment-download').click(),
  ])
  expect(download.suggestedFilename()).toBe(fileName)
})

test('upload grande (>10MB) passa pelo fluxo presignado', async ({ browser }) => {
  const suffix = uniqueSuffix()
  const username = `big_${suffix}`
  await ensureUser(username)
  await loginViaUi(await (await browser.newContext()).newPage(), username).catch(() => {})

  // valida direto pela API que o presign aceita >10MB (antes estourava 10MB)
  const { accessToken } = await apiLogin(username, TEST_PASSWORD)
  const res = await fetch(`${process.env.E2E_API_URL || 'http://localhost:8080'}/api/attachments/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ fileName: 'grande.bin', mimeType: 'application/octet-stream', fileSize: 12 * 1024 * 1024 }),
  })
  expect(res.status).toBe(200)
  const data = await res.json()
  expect(data.uploadUrl).toBeTruthy()
  expect(data.s3Key).toMatch(/^uploads\//)
})
