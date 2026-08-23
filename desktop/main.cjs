const { app, BrowserWindow, Tray, Menu, shell, session, desktopCapturer } = require('electron')
const path = require('path')

const fs = require('fs')

// Aceita certificados inválidos ou auto-assinados (https sem CA confiável)
app.commandLine.appendSwitch('ignore-certificate-errors')

// Áudio/vídeo de chamadas podem iniciar sem clique prévio
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Captura de tela no Linux/Wayland via xdg-desktop-portal (PipeWire)
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer')
}
// Empacotado: extraResources copia build/icon.png para <resources>/icon.png
function resolveIconPath() {
  const candidates = []
  try { if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'icon.png')) } catch {}
  candidates.push(path.join(__dirname, 'build', 'icon.png'))
  candidates.push(path.join(__dirname, 'icon.png'))
  for (const candidate of candidates) {
    try { if (fs.existsSync(candidate)) return candidate } catch {}
  }
  return null
}
const ICON_PATH = resolveIconPath()

// URL do servidor – altere aqui ou use a env var ABSONO_SERVER_URL para sobrescrever
const BUNDLED_SERVER_URL = 'https://absono.duckdns.org:4432'

function bundledServerUrl() {
  if (!BUNDLED_SERVER_URL) return null
  return BUNDLED_SERVER_URL.trim().replace(/\/+$/, '') || null
}

function parseServerUrlFile(filePath) {
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    return trimmed.replace(/\/+$/, '')
  }
  return null
}

/**
 * Ordem de resolução do servidor:
 *   1. variável de ambiente ABSONO_SERVER_URL
 *   2. URL gravada dentro deste JS no build (AppImage/zip)
 *   3. arquivo server-url.txt ao lado do executável/AppImage ou nos resources
 * Sem nada disso: dev usa http://localhost:3000; empacotado mostra erro guiado.
 */
function resolveServerUrl() {
  if (process.env.ABSONO_SERVER_URL) return process.env.ABSONO_SERVER_URL.trim()
  const baked = bundledServerUrl()
  if (baked) return baked
  const candidates = []
  // AppImage: executa de um mount temporário; $APPIMAGE aponta para o arquivo real
  if (process.env.APPIMAGE) candidates.push(path.join(path.dirname(process.env.APPIMAGE), 'server-url.txt'))
  try { candidates.push(path.join(path.dirname(app.getPath('exe')), 'server-url.txt')) } catch {}
  candidates.push(path.join(process.resourcesPath || __dirname, 'server-url.txt'))
  candidates.push(path.join(__dirname, 'server-url.txt'))
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const value = parseServerUrlFile(candidate)
        if (value) return value
      }
    } catch {}
  }
  return null
}

let SERVER_URL = null

let mainWindow = null
let tray = null
let quitting = false

function configureMediaAndCertificates() {
  // Confia em qualquer certificado (auto-assinado, expirado, hostname inválido…)
  app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
    event.preventDefault()
    callback(true)
  })

  const ses = session.defaultSession
  const allowedPermissions = new Set([
    'media',            // microfone e câmera (getUserMedia)
    'audioCapture',
    'videoCapture',
    'display-capture',  // compartilhamento de tela
    'notifications',
    'fullscreen',
    'pointerLock',
  ])

  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.has(permission))
  })
  ses.setPermissionCheckHandler((_webContents, permission) => allowedPermissions.has(permission))

  // navigator.mediaDevices.getDisplayMedia() no renderer precisa deste handler
  ses.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((screens) => {
      if (screens.length > 0) {
        const streams = { video: screens[0] }
        if (process.platform === 'win32' || process.platform === 'darwin') {
          streams.audio = 'loopback'
        }
        callback(streams)
        return
      }
      desktopCapturer.getSources({ types: ['window'] }).then((windows) => {
        callback(windows.length > 0 ? { video: windows[0] } : {})
      }).catch(() => callback({}))
    }).catch(() => callback({}))
  }, { useSystemPicker: true })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Ábsono',
    icon: ICON_PATH,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // empacotado sem servidor definido: página explicativa em vez de tela branca
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, _url, isMain) => {
    if (!isMain || SERVER_URL || !app.isPackaged) return
    const html = encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8">
      <style>body{font-family:system-ui;background:#16171b;color:#e6e6e8;display:flex;
      align-items:center;justify-content:center;height:100vh;margin:0}
      div{max-width:520px;text-align:center}code{background:#26272c;padding:2px 6px;border-radius:4px}</style></head>
      <body><div><h2>Não foi possível carregar o Ábsono</h2>
      <p>O app empacotado precisa apontar para um servidor. Defina a variável
      <code>ABSONO_SERVER_URL</code> (ex.: <code>https://absono.duckdns.org:4432</code>)
      ou coloque um <code>server-url.txt</code> ao lado do executável e reabra.</p>
      <p style="opacity:.6;font-size:12px">${code} ${desc}</p></div></body></html>`)
    mainWindow.loadURL('data:text/html;charset=utf-8,' + html)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  SERVER_URL = SERVER_URL || resolveServerUrl()
  console.log('[app] SERVER_URL:', SERVER_URL || '(nenhum – dev mode)')

  if (SERVER_URL) {
    mainWindow.loadURL(SERVER_URL)
  } else if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:3000')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'))
  }

  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function toggleWindow() {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
    mainWindow.hide()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
}

function createTray() {
  if (!ICON_PATH) {
    console.warn('[tray] icon.png não encontrado; tray desabilitado')
    return
  }
  try {
    tray = new Tray(ICON_PATH)
  } catch (err) {
    console.warn('[tray] falha ao criar tray:', err.message)
    return
  }
  tray.setToolTip('Ábsono')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Ábsono', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus() } } },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        quitting = true
        app.quit()
      },
    },
  ]))
  tray.on('click', toggleWindow)
}

app.on('before-quit', () => {
  quitting = true
})

app.whenReady().then(() => {
  configureMediaAndCertificates()
  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else if (mainWindow) mainWindow.show()
  })
})

app.on('window-all-closed', () => {
  if (quitting) app.quit()
})
