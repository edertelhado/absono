const { app, BrowserWindow, Tray, Menu, shell, session, desktopCapturer, ipcMain } = require('electron')
const path = require('path')

const fs = require('fs')

// Aceita certificados inválidos ou auto-assinados (https sem CA confiável)
app.commandLine.appendSwitch('ignore-certificate-errors')

// Áudio/vídeo de chamadas podem iniciar sem clique prévio
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// Captura de tela no Linux/Wayland via xdg-desktop-portal (PipeWire)
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer')
  // Artefatos de composição no X11 (cantos piscando, janela "furada"
  // mostrando o wallpaper) — comum em NVIDIA + Cinnamon/Muffin porque o
  // Chromium usa client-side decorations e o damage tracking falha.
  // Compositing por software + raster completo: custo baixo, ataca
  // exatamente esse tipo de glitch. Reverte com ABSONO_GPU_COMPOSITING=1.
  if (process.env.ABSONO_GPU_COMPOSITING !== '1') {
    app.commandLine.appendSwitch('disable-gpu-compositing')
    app.commandLine.appendSwitch('disable-partial-raster')
  }
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

// ==================== Seletor de compartilhamento de tela ====================
// No Linux/X11 não existe seletor nativo do sistema (useSystemPicker falha
// com "Video was requested, but no video stream was provided"). Este picker
// próprio lista telas e janelas com miniaturas.

let pickerWindow = null

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
}

function buildPickerHtml(sources) {
  const items = sources.map((s) => {
    const thumb = s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : ''
    const icon = s.appIcon ? s.appIcon.toDataURL() : ''
    const name = escapeHtml(s.name || s.id)
    return `<button class="item" data-id="${escapeHtml(s.id)}" title="${name}">
      <img class="thumb" src="${thumb}" alt="" />
      <span class="label">${icon ? `<img class="icon" src="${icon}" alt="" />` : ''}<span class="name">${name}</span></span>
    </button>`
  }).join('')

  return encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:system-ui,sans-serif;background:#0f1115;color:#e6e8ee;margin:0;display:flex;flex-direction:column;height:100vh;user-select:none}
    h2{margin:14px 16px;font-size:15px;font-weight:600}
    .grid{flex:1;overflow:auto;padding:0 16px 8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;align-content:start}
    .item{background:#1a1d24;border:1px solid #2a2e38;border-radius:10px;padding:8px;cursor:pointer;text-align:left;color:inherit;display:flex;flex-direction:column;min-width:0;overflow:hidden}
    .item:hover{border-color:#3b82f6;background:#20242d}
    .thumb{width:100%;height:96px;object-fit:contain;background:#000;border-radius:6px}
    .label{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:12px;min-width:0}
    .name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .icon{width:14px;height:14px;flex-shrink:0}
    footer{padding:10px 16px;border-top:1px solid #2a2e38;display:flex;justify-content:flex-end}
    button.cancel{background:#26272c;color:#e6e8ee;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:13px}
    button.cancel:hover{background:#31333a}
  </style></head><body>
    <h2>Escolha o que compartilhar</h2>
    <div class="grid">${items}</div>
    <footer><button class="cancel" id="cancel">Cancelar</button></footer>
    <script>
      document.querySelectorAll('.item').forEach(function (b) {
        b.addEventListener('click', function () { window.pickerApi.select(b.dataset.id) })
      })
      document.getElementById('cancel').addEventListener('click', function () { window.pickerApi.cancel() })
    </script>
  </body></html>`)
}

function openSharePicker(sources, callback) {
  let settled = false
  const done = (result) => {
    if (settled) return
    settled = true
    try { ipcMain.removeAllListeners('screen-share-select') } catch {}
    try { ipcMain.removeAllListeners('screen-share-cancel') } catch {}
    if (pickerWindow && !pickerWindow.isDestroyed()) pickerWindow.destroy()
    pickerWindow = null
    try { callback(result) } catch {}
  }

  ipcMain.once('screen-share-select', (_event, id) => {
    const source = sources.find((s) => s.id === id)
    if (!source) return done({})
    // Loopback audio disponível em Windows e macOS
    if (process.platform === 'win32' || process.platform === 'darwin') {
      done({ video: source, audio: 'loopback' })
    } else {
      done({ video: source })
    }
  })
  ipcMain.once('screen-share-cancel', () => done({}))

  pickerWindow = new BrowserWindow({
    width: 660,
    height: 540,
    title: 'Compartilhar tela ou janela',
    parent: mainWindow || undefined,
    modal: !!mainWindow,
    resizable: false,
    minimizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    icon: ICON_PATH,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'picker-preload.cjs'),
    },
  })
  pickerWindow.on('closed', () => done({}))
  pickerWindow.loadURL('data:text/html;charset=utf-8,' + buildPickerHtml(sources))
}

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

  // navigator.mediaDevices.getDisplayMedia() no renderer precisa deste handler.
  // Abre o picker próprio (telas + janelas com miniaturas) — o seletor nativo
  // do sistema não existe em Linux/X11 e deixava a captura abortar.
  ses.setDisplayMediaRequestHandler(async (_request, callback) => {
    if (pickerWindow && !pickerWindow.isDestroyed()) {
      // Já existe um picker aberto — rejeita silenciosamente
      try { callback({}) } catch {}
      return
    }
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      })
      if (!sources.length) {
        try { callback({}) } catch {}
        return
      }
      openSharePicker(sources, callback)
    } catch {
      try { callback({}) } catch {}
    }
  })
}

function serverConfigPage(code, desc) {
  const html = encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8">
      <style>body{font-family:system-ui;background:#16171b;color:#e6e6e8;display:flex;
      align-items:center;justify-content:center;height:100vh;margin:0}
      div{max-width:520px;text-align:center}code{background:#26272c;padding:2px 6px;border-radius:4px}</style></head>
      <body><div><h2>Não foi possível carregar o Ábsono</h2>
      <p>O app empacotado precisa apontar para um servidor. Defina a variável
      <code>ABSONO_SERVER_URL</code> (ex.: <code>https://absono.duckdns.org:4432</code>)
      ou coloque um <code>server-url.txt</code> ao lado do executável e reabra.</p>
      <p style="opacity:.6;font-size:12px">${code || ''} ${desc || ''}</p></div></body></html>`)
  return 'data:text/html;charset=utf-8,' + html
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Ábsono',
    icon: ICON_PATH,
    backgroundColor: '#0a0e14',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // empacotado sem servidor definido: página explicativa em vez de tela branca
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, _url, isMain) => {
    if (!isMain || SERVER_URL || !app.isPackaged) return
    mainWindow.loadURL(serverConfigPage(code, desc))
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
    // Empacotado sem servidor configurado: página guiando a configuração.
    // O frontend é sempre servido pelo servidor (como num navegador) —
    // nada de UI embutida no pacote.
    mainWindow.loadURL(serverConfigPage())
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
  // Sem barra de menu padrão do Electron (File/Edit/View…)
  Menu.setApplicationMenu(null)

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
