import { Page } from '@playwright/test'
import { TEST_PASSWORD } from './api'

/** Faz login pela UI e espera o layout principal carregar. */
export async function loginViaUi(page: Page, username: string, password = TEST_PASSWORD): Promise<void> {
  await page.goto('/login')
  await page.getByPlaceholder('Username').fill(username)
  await page.getByPlaceholder('Senha').fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL(/\/channel\//, { timeout: 20_000 })
  await expectSidebar(page)
}

/** Espera a sidebar de usuários estar visível (layout carregado + sessão restaurada). */
export async function expectSidebar(page: Page): Promise<void> {
  await page.locator('.user-sidebar').waitFor({ state: 'visible', timeout: 20_000 })
}

/** Abre um canal pelo nome na sidebar. */
export async function openChannel(page: Page, name: string): Promise<void> {
  await page.locator('.channel-item', { hasText: name }).first().click()
}

/** Envia uma mensagem no canal aberto. */
export async function sendMessage(page: Page, text: string): Promise<void> {
  const input = page.getByPlaceholder('Enviar mensagem...')
  await input.fill(text)
  await input.press('Enter')
}
