import { test, expect } from '@playwright/test'
import { ensureUser, uniqueSuffix, TEST_PASSWORD } from '../helpers/api'
import { loginViaUi, openChannel, sendMessage } from '../helpers/ui'

test('mensagens aparecem em tempo real para outro usuário', async ({ browser }) => {
  const suffix = uniqueSuffix()
  const alice = `alice_${suffix}`
  const bob = `bob_${suffix}`
  await Promise.all([ensureUser(alice), ensureUser(bob)])

  const aliceCtx = await browser.newContext()
  const bobCtx = await browser.newContext()
  const alicePage = await aliceCtx.newPage()
  const bobPage = await bobCtx.newPage()

  await loginViaUi(alicePage, alice)
  await loginViaUi(bobPage, bob)
  await openChannel(bobPage, 'geral')

  // Alice envia; Bob vê sem recarregar
  await openChannel(alicePage, 'geral')
  const msgAlice = `olá do alice ${suffix}`
  await sendMessage(alicePage, msgAlice)
  await expect(
    bobPage.locator('.message-wrapper', { hasText: msgAlice })
  ).toBeVisible({ timeout: 15_000 })

  // Bob responde; Alice também vê
  const msgBob = `resposta do bob ${suffix}`
  await sendMessage(bobPage, msgBob)
  await expect(
    alicePage.locator('.message-wrapper', { hasText: msgBob })
  ).toBeVisible({ timeout: 15_000 })

  await aliceCtx.close()
  await bobCtx.close()
})

test('editar e excluir mensagem refletem nos dois usuários', async ({ browser }) => {
  const suffix = uniqueSuffix()
  const alice = `edt_${suffix}`
  const bob = `obs_${suffix}`
  await Promise.all([ensureUser(alice), ensureUser(bob)])

  const aliceCtx = await browser.newContext()
  const bobCtx = await browser.newContext()
  const alicePage = await aliceCtx.newPage()
  const bobPage = await bobCtx.newPage()

  await loginViaUi(alicePage, alice)
  await loginViaUi(bobPage, bob)
  await openChannel(bobPage, 'geral')
  await openChannel(alicePage, 'geral')

  const original = `mensagem original ${suffix}`
  await sendMessage(alicePage, original)
  await expect(bobPage.locator('.message-wrapper', { hasText: original })).toBeVisible()

  // editar (hover revela as ações)
  const ownMessage = alicePage.locator('.message-wrapper', { hasText: original }).first()
  await ownMessage.hover()
  await ownMessage.getByTitle('Editar mensagem').click()
  const edited = `mensagem editada ${suffix}`
  await alicePage.locator('.message-edit input').fill(edited)
  await alicePage.getByRole('button', { name: 'Salvar' }).click()

  await expect(bobPage.locator('.message-wrapper', { hasText: edited })).toBeVisible({ timeout: 15_000 })
  await expect(bobPage.locator('.message-wrapper', { hasText: '(editado)' }).first()).toBeVisible()

  // excluir (só a Alice tem o diálogo de confirmação; Bob só observa)
  const editedMsg = alicePage.locator('.message-wrapper', { hasText: edited }).first()
  await editedMsg.hover()
  await editedMsg.getByTitle('Excluir mensagem').click()
  await alicePage.getByRole('button', { name: 'Excluir', exact: true }).click()

  await expect(bobPage.locator('.message-wrapper', { hasText: edited })).toHaveCount(0, { timeout: 15_000 })

  await aliceCtx.close()
  await bobCtx.close()
})

test('badge de não lidas aparece no canal não aberto', async ({ browser }) => {
  const suffix = uniqueSuffix()
  const alice = `unr_${suffix}`
  const bob = `watch_${suffix}`
  await Promise.all([ensureUser(alice), ensureUser(bob)])

  const aliceCtx = await browser.newContext()
  const bobCtx = await browser.newContext()
  const alicePage = await aliceCtx.newPage()
  const bobPage = await bobCtx.newPage()

  // Bob fica em "avisos"; Alice manda mensagem em "geral"
  await loginViaUi(alicePage, alice)
  await loginViaUi(bobPage, bob)
  await openChannel(bobPage, 'avisos')
  await openChannel(alicePage, 'geral')

  const text = `você tem notificação ${suffix}`
  await sendMessage(alicePage, text)

  const geralItem = bobPage.locator('.channel-item', { hasText: 'geral' }).first()
  await expect(geralItem.locator('.unread-badge')).toHaveText('1', { timeout: 15_000 })

  // abrir o canal limpa o badge
  await openChannel(bobPage, 'geral')
  await expect(geralItem.locator('.unread-badge')).toHaveCount(0)

  await aliceCtx.close()
  await bobCtx.close()
})
