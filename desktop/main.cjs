const { app, BrowserWindow, Tray, Menu, shell } = require('electron')
const path = require('path')

const fs = require('fs')
let ICON_PATH = path.join(__dirname, 'build', 'icon.png')
if (!fs.existsSync(ICON_PATH)) ICON_PATH = path.join(__dirname, 'icon.png')

/**
 * Ordem de resolução do servidor:
 *   1. variável de ambiente ABSONO_SERVER_URL
 *   2. arquivo server-url.txt ao lado do executável (zip portátil)
 *   3. arquivo server-url.txt junto do app
 * Sem nada disso: dev usa http://localhost:3000; empacotado mostra erro guiado.
 */
function resolveServerUrl() {
  if (process.env.ABSONO_SERVER_URL) return process.env.ABSONO_SERVER_URL.trim()
  const candidates = []
  // AppImage: executa de um mount temporário; $APPIMAGE aponta para o arquivo real
  if (process.env.APPIMAGE) candidates.push(path.join(path.dirname(process.env.APPIMAGE), 'server-url.txt'))
  try { candidates.push(path.join(path.dirname(app.getPath('exe')), 'server-url.txt')) } catch {}
  candidates.push(path.join(__dirname, 'server-url.txt'))
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const value = fs.readFileSync(candidate, 'utf8').trim()
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
    if (!isMain || process.env.ABSONO_SERVER_URL || !app.isPackaged) return
    const html = encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8">
      <style>body{font-family:system-ui;background:#16171b;color:#e6e6e8;display:flex;
      align-items:center;justify-content:center;height:100vh;margin:0}
      div{max-width:520px;text-align:center}code{background:#26272c;padding:2px 6px;border-radius:4px}</style></head>
      <body><div><h2>Não foi possível carregar o Ábsono</h2>
      <p>O app empacotado precisa apontar para um servidor. Crie o arquivo
      <code>server-url.txt</code> ao lado do executável contendo a URL
      (ex.: <code>https://absono.duckdns.org:4432</code>) e reabra.</p>
      <p style="opacity:.6;font-size:12px">${code} ${desc}</p></div></body></html>`)
    mainWindow.loadURL('data:text/html;charset=utf-8,' + html)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  SERVER_URL = SERVER_URL || resolveServerUrl()

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
  tray = new Tray(ICON_PATH)
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
