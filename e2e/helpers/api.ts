const API = process.env.E2E_API_URL || 'http://localhost:8080'

export const TEST_PASSWORD = 'SenhaForte123!'

export function uniqueSuffix(): string {
  return Date.now().toString(36).slice(-6) + Math.floor(Math.random() * 100)
}

/** Cria o usuário via API (idempotente: ignora se já existir). */
export async function ensureUser(username: string, password = TEST_PASSWORD): Promise<void> {
  const res = await fetch(`${API}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, displayName: username, password }),
  })
  if (!res.ok && res.status !== 400 && res.status !== 409) {
    throw new Error(`Falha ao registrar ${username}: HTTP ${res.status} — ${await res.text()}`)
  }
}

export interface LoginResult {
  accessToken: string
  userId: string
}

/** Login via API — útil para preparar estado sem passar pela UI. */
export async function apiLogin(username: string, password = TEST_PASSWORD): Promise<LoginResult> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new Error(`Login API falhou para ${username}: HTTP ${res.status}`)
  const data = await res.json()
  return { accessToken: data.accessToken, userId: data.user.id }
}
