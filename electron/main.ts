import { app, BrowserWindow, clipboard, ipcMain, globalShortcut, Tray, Menu, nativeImage, screen } from 'electron'
import * as path from 'path'
import { ClipboardStore, SettingsStore } from './store'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let store: ClipboardStore | null = null
let settingsStore: SettingsStore | null = null
let isWatching = false
let lastText = ''
let currentShortcut: string = ''

const POLL_INTERVAL = 500 // ms
const MAX_HISTORY = 200

// Simple clipboard SVG icon for tray
const TRAY_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
  <line x1="9" y1="12" x2="15" y2="12"/>
  <line x1="9" y1="16" x2="15" y2="16"/>
</svg>
`

function createTrayIcon() {
  try {
    const img = nativeImage.createFromDataURL(
      'data:image/svg+xml;base64,' + Buffer.from(TRAY_ICON_SVG).toString('base64')
    )
    return img.resize({ width: 16, height: 16 })
  } catch {
    return nativeImage.createEmpty()
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 640,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Load the built React app
  const indexPath = path.join(__dirname, '../dist/index.html')
  mainWindow.loadFile(indexPath)

  mainWindow.on('blur', () => {
    mainWindow?.hide()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray() {
  const icon = createTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('Clipboard Vibe')

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示剪贴板', click: () => toggleWindow() },
    { type: 'separator' },
    { label: '清空历史', click: () => {
      store?.clear()
      mainWindow?.webContents.send('history-updated', store?.getAll() || [])
    }},
    { type: 'separator' },
    { label: '退出', click: () => {
      app.quit()
    }},
  ])

  tray.setContextMenu(contextMenu)
  tray.on('click', () => toggleWindow())
}

function toggleWindow() {
  if (!mainWindow) return

  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    // Position near cursor
    const cursor = screen.getCursorScreenPoint()
    const [width, height] = mainWindow.getSize()

    let x = cursor.x - Math.floor(width / 2)
    let y = cursor.y - height - 10

    // Clamp to screen bounds
    const display = screen.getDisplayNearestPoint(cursor)
    const bounds = display.workArea
    x = Math.max(bounds.x, Math.min(x, bounds.x + bounds.width - width))
    y = Math.max(bounds.y, Math.min(y, bounds.y + bounds.height - height))

    mainWindow.setPosition(x, y)
    mainWindow.show()
    mainWindow.focus()
  }
}

function startClipboardWatcher() {
  if (isWatching) return
  isWatching = true

  setInterval(() => {
    try {
      const text = clipboard.readText()
      if (text && text !== lastText && text.trim().length > 0) {
        lastText = text
        store?.add(text)
        mainWindow?.webContents.send('history-updated', store?.getAll() || [])
      }
    } catch (e) {
      // ignore clipboard errors
    }
  }, POLL_INTERVAL)
}

function registerIpcHandlers() {
  ipcMain.handle('get-history', () => {
    return store?.getAll() || []
  })

  ipcMain.handle('copy-item', (_event, text: string) => {
    clipboard.writeText(text)
    lastText = text // prevent re-capturing
    return true
  })

  ipcMain.handle('delete-item', (_event, id: string) => {
    store?.delete(id)
    mainWindow?.webContents.send('history-updated', store?.getAll() || [])
    return true
  })

  ipcMain.handle('clear-history', () => {
    store?.clear()
    mainWindow?.webContents.send('history-updated', [])
    return true
  })

  ipcMain.handle('toggle-favorite', (_event, id: string) => {
    store?.toggleFavorite(id)
    mainWindow?.webContents.send('history-updated', store?.getAll() || [])
    return true
  })

  ipcMain.handle('hide-window', () => {
    mainWindow?.hide()
    return true
  })

  // Settings handlers
  ipcMain.handle('get-settings', () => {
    return settingsStore?.get() || { toggleShortcut: 'CommandOrControl+Shift+V' }
  })

  ipcMain.handle('set-toggle-shortcut', (_event, shortcut: string) => {
    return updateToggleShortcut(shortcut)
  })

  ipcMain.handle('set-max-history', (_event, max: number) => {
    const clamped = Math.max(10, Math.min(1000, Math.floor(max)))
    settingsStore?.setMaxHistory(clamped)
    store?.setMaxItems(clamped)
    mainWindow?.webContents.send('history-updated', store?.getAll() || [])
    return true
  })
}

function registerShortcuts() {
  const shortcut = settingsStore?.getToggleShortcut() || 'CommandOrControl+Shift+V'
  updateToggleShortcut(shortcut)
}

function updateToggleShortcut(newShortcut: string): boolean {
  // Unregister old shortcut if exists
  if (currentShortcut) {
    globalShortcut.unregister(currentShortcut)
  }

  // Register new shortcut
  const ret = globalShortcut.register(newShortcut, () => {
    toggleWindow()
  })

  if (ret) {
    currentShortcut = newShortcut
    settingsStore?.setToggleShortcut(newShortcut)
    return true
  } else {
    console.error('Shortcut registration failed:', newShortcut)
    // Try to re-register old one if new one fails
    if (currentShortcut) {
      globalShortcut.register(currentShortcut, () => toggleWindow())
    }
    return false
  }
}

app.whenReady().then(() => {
  settingsStore = new SettingsStore()
  const maxHistory = settingsStore.getMaxHistory()
  store = new ClipboardStore(maxHistory)
  createWindow()
  createTray()
  registerIpcHandlers()
  registerShortcuts()
  startClipboardWatcher()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
