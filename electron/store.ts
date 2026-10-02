import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export type ClipboardItemType = 'text' | 'file'

export interface ClipboardItem {
  id: string
  type: ClipboardItemType
  text: string // for text items: the text content; for file items: original file path
  preview: string
  timestamp: number
  favorite: boolean
  // file-specific fields
  fileName?: string
  fileSize?: number
  storedPath?: string // path where we saved the file copy
}

export class ClipboardStore {
  private items: ClipboardItem[] = []
  private filePath: string
  private filesDir: string
  private maxTextItems: number
  private maxFileItems: number

  constructor(maxTextItems: number = 200, maxFileItems: number = 100) {
    this.maxTextItems = maxTextItems
    this.maxFileItems = maxFileItems
    const userDataPath = app.getPath('userData')
    this.filePath = path.join(userDataPath, 'clipboard-history.json')
    this.filesDir = path.join(userDataPath, 'clipboard-files')
    this.ensureFilesDir()
    this.load()
  }

  private ensureFilesDir() {
    try {
      if (!fs.existsSync(this.filesDir)) {
        fs.mkdirSync(this.filesDir, { recursive: true })
      }
    } catch (e) {
      console.error('Failed to create files directory:', e)
    }
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8')
        this.items = JSON.parse(data)
        // Add type field to legacy items
        this.items = this.items.map(item => {
          if (!item.type) {
            return { ...item, type: 'text' as ClipboardItemType }
          }
          return item as ClipboardItem
        })
      }
    } catch (e) {
      console.error('Failed to load clipboard history:', e)
      this.items = []
    }
  }

  private save() {
    try {
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.items, null, 2), 'utf-8')
    } catch (e) {
      console.error('Failed to save clipboard history:', e)
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
  }

  private copyFileToStorage(originalPath: string, id: string): string | null {
    try {
      const fileName = path.basename(originalPath)
      const ext = path.extname(originalPath)
      const baseName = path.basename(originalPath, ext)

      // Try original name first, if exists add a number suffix
      let storedName = fileName
      let storedPath = path.join(this.filesDir, storedName)
      let counter = 1

      while (fs.existsSync(storedPath)) {
        storedName = `${baseName} (${counter})${ext}`
        storedPath = path.join(this.filesDir, storedName)
        counter++
      }

      // Copy file
      fs.copyFileSync(originalPath, storedPath)
      return storedPath
    } catch (e) {
      console.error('Failed to copy file to storage:', e)
      return null
    }
  }

  private deleteStoredFile(storedPath?: string) {
    if (storedPath && fs.existsSync(storedPath)) {
      try {
        fs.unlinkSync(storedPath)
      } catch (e) {
        console.error('Failed to delete stored file:', e)
      }
    }
  }

  private trimItems() {
    const textItems = this.items.filter(i => i.type === 'text')
    const fileItems = this.items.filter(i => i.type === 'file')

    // Trim text items
    if (textItems.length > this.maxTextItems) {
      const favText = textItems.filter(i => i.favorite)
      const nonFavText = textItems.filter(i => !i.favorite)
      const keepText = this.maxTextItems - favText.length
      const newTextItems = [...favText, ...nonFavText.slice(0, Math.max(0, keepText))]

      // Delete stored files for removed file items? No, file items are separate.
      // Actually we need to update this.items
      const remainingIds = new Set(newTextItems.map(i => i.id))
      this.items = this.items.filter(i => i.type === 'file' || remainingIds.has(i.id))
    }

    // Trim file items
    if (fileItems.length > this.maxFileItems) {
      const favFiles = fileItems.filter(i => i.favorite)
      const nonFavFiles = fileItems.filter(i => !i.favorite)
      const keepFiles = this.maxFileItems - favFiles.length
      const newFileItems = [...favFiles, ...nonFavFiles.slice(0, Math.max(0, keepFiles))]
      const removedFiles = nonFavFiles.slice(Math.max(0, keepFiles))

      // Delete actual files
      removedFiles.forEach(item => {
        this.deleteStoredFile(item.storedPath)
      })

      const remainingIds = new Set(newFileItems.map(i => i.id))
      this.items = this.items.filter(i => i.type === 'text' || remainingIds.has(i.id))
    }
  }

  addText(text: string): ClipboardItem {
    // Remove duplicates (same text)
    this.items = this.items.filter(item => !(item.type === 'text' && item.text === text))

    const item: ClipboardItem = {
      id: this.generateId(),
      type: 'text',
      text,
      timestamp: Date.now(),
      favorite: false,
      preview: text.length > 200 ? text.substring(0, 200) + '...' : text,
    }

    this.items.unshift(item)
    this.trimItems()
    this.save()
    return item
  }

  addFile(originalPath: string): ClipboardItem | null {
    try {
      if (!fs.existsSync(originalPath)) return null

      const stat = fs.statSync(originalPath)
      if (!stat.isFile()) return null

      const fileName = path.basename(originalPath)
      const fileSize = stat.size

      // Check for duplicates (same file path)
      const existing = this.items.find(
        item => item.type === 'file' && item.text === originalPath
      )
      if (existing) {
        // Move to top
        this.items = this.items.filter(item => item.id !== existing.id)
        existing.timestamp = Date.now()
        this.items.unshift(existing)
        this.save()
        return existing
      }

      const id = this.generateId()
      const storedPath = this.copyFileToStorage(originalPath, id)
      if (!storedPath) return null

      const storedFileName = path.basename(storedPath)

      const item: ClipboardItem = {
        id,
        type: 'file',
        text: originalPath, // original path
        fileName: storedFileName,
        fileSize,
        storedPath,
        timestamp: Date.now(),
        favorite: false,
        preview: storedFileName,
      }

      this.items.unshift(item)
      this.trimItems()
      this.save()
      return item
    } catch (e) {
      console.error('Failed to add file:', e)
      return null
    }
  }

  getAll(): ClipboardItem[] {
    return this.items
  }

  getFileItems(): ClipboardItem[] {
    return this.items.filter(i => i.type === 'file')
  }

  getTextItems(): ClipboardItem[] {
    return this.items.filter(i => i.type === 'text')
  }

  delete(id: string) {
    const item = this.items.find(i => i.id === id)
    if (item && item.type === 'file') {
      this.deleteStoredFile(item.storedPath)
    }
    this.items = this.items.filter(item => item.id !== id)
    this.save()
  }

  clear() {
    // Keep favorites, but also keep file favorites
    const removedItems = this.items.filter(i => !i.favorite)
    removedItems.forEach(item => {
      if (item.type === 'file') {
        this.deleteStoredFile(item.storedPath)
      }
    })
    this.items = this.items.filter(i => i.favorite)
    this.save()
  }

  toggleFavorite(id: string) {
    const item = this.items.find(i => i.id === id)
    if (item) {
      item.favorite = !item.favorite
      this.save()
    }
  }

  setMaxTextItems(max: number) {
    this.maxTextItems = Math.max(10, Math.min(1000, Math.floor(max)))
    this.trimItems()
    this.save()
  }

  setMaxFileItems(max: number) {
    this.maxFileItems = Math.max(1, Math.min(500, Math.floor(max)))
    this.trimItems()
    this.save()
  }

  getMaxTextItems(): number {
    return this.maxTextItems
  }

  getMaxFileItems(): number {
    return this.maxFileItems
  }
}

// ─── Settings Store ───────────────────────────────────────────

export interface AppSettings {
  toggleShortcut: string
  maxHistory: number
  maxFiles: number
}

const DEFAULT_SETTINGS: AppSettings = {
  toggleShortcut: 'CommandOrControl+Shift+V',
  maxHistory: 200,
  maxFiles: 100,
}

export class SettingsStore {
  private settings: AppSettings
  private filePath: string

  constructor() {
    const userDataPath = app.getPath('userData')
    this.filePath = path.join(userDataPath, 'settings.json')
    this.settings = { ...DEFAULT_SETTINGS }
    this.load()
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8')
        const parsed = JSON.parse(data)
        this.settings = { ...DEFAULT_SETTINGS, ...parsed }
      }
    } catch (e) {
      console.error('Failed to load settings:', e)
      this.settings = { ...DEFAULT_SETTINGS }
    }
  }

  private save() {
    try {
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8')
    } catch (e) {
      console.error('Failed to save settings:', e)
    }
  }

  get(): AppSettings {
    return { ...this.settings }
  }

  getToggleShortcut(): string {
    return this.settings.toggleShortcut
  }

  setToggleShortcut(shortcut: string): boolean {
    this.settings.toggleShortcut = shortcut
    this.save()
    return true
  }

  getMaxHistory(): number {
    return this.settings.maxHistory
  }

  setMaxHistory(max: number): boolean {
    const clamped = Math.max(10, Math.min(1000, Math.floor(max)))
    this.settings.maxHistory = clamped
    this.save()
    return true
  }

  getMaxFiles(): number {
    return this.settings.maxFiles
  }

  setMaxFiles(max: number): boolean {
    const clamped = Math.max(1, Math.min(500, Math.floor(max)))
    this.settings.maxFiles = clamped
    this.save()
    return true
  }

  resetToDefaults() {
    this.settings = { ...DEFAULT_SETTINGS }
    this.save()
  }
}
