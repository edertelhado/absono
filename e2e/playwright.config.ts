import { defineConfig } from '@playwright/test'

// Pré-requisitos: stack de dev no ar (compose + backend :8080 + frontend :3000).
//   cd e2e && npm install && npx playwright install chromium
//   npm test

export default defineConfig({
  testDir: './specs',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  retries: Number(process.env.E2E_RETRIES ?? 1),
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',   // concede permissões automaticamente
        '--use-fake-device-for-media-stream', // mic/cam falsos (áudio silencioso)
        '--auto-select-desktop-capture-source=Entire screen',
        '--disable-features=DialMediaRouteProvider',
      ],
    },
  },
  reporter: [['list'], ['html', { open: 'never' }]],
})
