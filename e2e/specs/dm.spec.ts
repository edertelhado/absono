import { test, expect } from '@playwright/test'
import { ensureUser, uniqueSuffix, apiLogin, TEST_PASSWORD } from '../helpers/api'
import { loginViaUi, openChannel, sendMessage, expectSidebar } from '../helpers/ui'

const API = process.env.E2E_API_URL || 'http://localhost:8080'

test('DM: abrir via usuário, conversar em tempo real, aparecer na sidebar', async ({ browser }) => {
  const suffix = uniqueSuffix()
  const alice = `dma_${suffix}`
  const bob = `dmb_${suffix}`
  await Promise.all([ensureUser(alice), ensureUser(bob)])

  const aliceCtx = await browser.newContext()
  const bobCtx = await browser.newContext()
  const alicePage = await aliceCtx.newPage()
  const bobPage = await bobCtx.newPage()

  await loginViaUi(alicePage, alice)
  await loginViaUi(bobPage, bob)

  // Alice abre a DM pela sidebar de usuários (botão de mensagem no hover)
  const aliceUserItem = alicePage.locator('.user-item', { hasText: bob }).first()
  await aliceUserItem.hover()
  await aliceUserItem.locator('.dm-btn').click()

  // header mostra o nome do par e o chat carrega
  await expect(alicePage.locator('.chat-header .header-name')).toHaveText(bob, { timeout: 15_000 })
  await expect(alicePage.locator('.chat-header .header-avatar')).toBeVisible()

  // seção "Mensagens diretas" aparece na sidebar da alice com o peer
  const dmSectionAlice = alicePage.locator('.channel-section', { hasText: 'Mensagens diretas' })
  await expect(dmSectionAlice.locator('.channel-name', { hasText: bob })).toBeVisible({ timeout: 15_000 })

  // conversa em tempo real
  const text1 = `dm privada ${suffix}`
  await sendMessage(alicePage, text1)
  await expect(
    alicePage.locator('.message-wrapper', { hasText: text1 })
  ).toBeVisible({ timeout: 15_000 })

  // bob abre a MESMA DM pelo próprio hover — histórico já está lá
  const bobItem = bobPage.locator('.user-item', { hasText: alice }).first()
  await bobItem.hover()
  await bobItem.locator('.dm-btn').click()
  await expect(bobPage.locator('.chat-header .header-name')).toHaveText(alice, { timeout: 15_000 })
  await expect(bobPage.locator('.message-wrapper', { hasText: text1 })).toBeVisible({ timeout: 15_000 })

  // bob responde em tempo real
  const text2 = `resposta na dm ${suffix}`
  await sendMessage(bobPage, text2)
  await expect(alicePage.locator('.message-wrapper', { hasText: text2 })).toBeVisible({ timeout: 15_000 })

  // badge de não lida para quem está fora da DM
  const dmItemBob = bobPage.locator('.channel-section', { hasText: 'Mensagens diretas' })
    .locator('.channel-item', { hasText: alice }).first()
  await openChannel(alicePage, 'geral') // alice sai da DM
  await sendMessage(bobPage, `fora do ar? ${suffix}`)
  await expect(
    dmSectionAlice.locator('.unread-badge')
  ).toBeVisible({ timeout: 15_000 })

  await aliceCtx.close()
  await bobCtx.close()
})

test('API: DM é idempotente (mesmo par devolve o mesmo canal) e não-membros não leem', async ({ request }) => {
  const suffix = uniqueSuffix()
  const u1 = `api1_${suffix}`
  const u2 = `api2_${suffix}`
  const u3 = `api3_${suffix}`
  await Promise.all([ensureUser(u1), ensureUser(u2), ensureUser(u3)])

  const t1 = (await (await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u1, password: TEST_PASSWORD }),
  })).json()).accessToken
  const t2 = (await (await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u2, password: TEST_PASSWORD }),
  })).json()).accessToken
  const t3 = (await (await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u3, password: TEST_PASSWORD }),
  })).json()).accessToken

  const id2 = (await (await fetch(`${API}/api/users`, { headers: { Authorization: `Bearer ${t1}` } })).json())
    .find((u: any) => u.username === u2).id

  const open1 = await (await fetch(`${API}/api/dm/with/${id2}`, {
    method: 'POST', headers: { Authorization: `Bearer ${t1}` },
  })).json()
  const open2 = await (await fetch(`${API}/api/dm/with/${id2}`, {
    method: 'POST', headers: { Authorization: `Bearer ${t1}` },
  })).json()
  expect(open1.channelId).toBeTruthy()
  expect(open2.channelId).toBe(open1.channelId)

  // membro lê; terceiro recebe erro de permissão
  const readMember = await fetch(`${API}/api/channels/${open1.channelId}/messages`, {
    headers: { Authorization: `Bearer ${t1}` },
  })
  expect(readMember.status).toBe(200)

  const readOutsider = await fetch(`${API}/api/channels/${open1.channelId}/messages`, {
    headers: { Authorization: `Bearer ${t3}` },
  })
  expect(readOutsider.status).toBe(400)
})
