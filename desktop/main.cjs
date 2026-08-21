const { app, BrowserWindow, Tray, Menu, shell } = require('electron')
const path = require('path')

const ICON_PATH = path.join(__dirname, 'build', 'icon.png')
const SERVER_URL = process.env.ABSONO_SERVER_URL || 'http://localhost:3000'

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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ABSONO_SERVER_URL) {
    mainWindow.loadURL(SERVER_URL)
  } else if (!app.isPackaged) {
    mainWindow.loadURL(SERVER_URL)
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
