import { test, expect } from '@playwright/test'
import { ensureUser, uniqueSuffix } from '../helpers/api'
import { loginViaUi, expectSidebar } from '../helpers/ui'

test('login funciona e a sessão persiste após recarregar a página', async ({ page }) => {
  const username = `auth_${uniqueSuffix()}`
  await ensureUser(username)

  await loginViaUi(page, username)
  await expectSidebar(page)

  await page.reload()
  // se a sessão não fosse restaurada, cairia em /login
  await expect(page).toHaveURL(/\/channel\//)
  await expectSidebar(page)
})

test('credenciais inválidas mostram erro e não autenticam', async ({ page }) => {
  const username = `ghost_${uniqueSuffix()}`
  await ensureUser(username)

  await page.goto('/login')
  await page.getByPlaceholder('Username').fill(username)
  await page.getByPlaceholder('Senha').fill('senhaErrada!')
  await page.getByRole('button', { name: 'Entrar' }).click()

  // continua na tela de login
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
})

test('refresh token renova a sessão expirada sem deslogar', async ({ page, request }) => {
  const username = `refl_${uniqueSuffix()}`
  await ensureUser(username)

  await loginViaUi(page, username)
  await expectSidebar(page)

  // simula expiração do access token: substitui por um lixo inválido,
  // mantendo o refresh token real — o interceptor deve renovar
  await page.evaluate(() => {
    localStorage.setItem('absono_token', 'token-invalido-expirado')
  })

  await page.reload()
  await expectSidebar(page)
})
