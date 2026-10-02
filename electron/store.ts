import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export interface ClipboardItem {
  id: string
  text: string
  timestamp: number
  favorite: boolean
  preview: string
}

export class ClipboardStore {
  private items: ClipboardItem[] = []
  private filePath: string
  private maxItems: number

  constructor(maxItems: number = 200) {
    this.maxItems = maxItems
    const userDataPath = app.getPath('userData')
    this.filePath = path.join(userDataPath, 'clipboard-history.json')
    this.load()
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8')
        this.items = JSON.parse(data)
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

  add(text: string): ClipboardItem {
    // Remove duplicates (same text)
    this.items = this.items.filter(item => item.text !== text)

    const item: ClipboardItem = {
      id: this.generateId(),
      text,
      timestamp: Date.now(),
      favorite: false,
      preview: text.length > 200 ? text.substring(0, 200) + '...' : text,
    }

    this.items.unshift(item)

    // Trim to max items (but keep favorites)
    if (this.items.length > this.maxItems) {
      const favorites = this.items.filter(i => i.favorite)
      const nonFavorites = this.items.filter(i => !i.favorite)
      const keepCount = this.maxItems - favorites.length
      this.items = [...favorites, ...nonFavorites.slice(0, Math.max(0, keepCount))]
    }

    this.save()
    return item
  }

  getAll(): ClipboardItem[] {
    return this.items
  }

  delete(id: string) {
    this.items = this.items.filter(item => item.id !== id)
    this.save()
  }

  clear() {
    // Keep favorites
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

  setMaxItems(max: number) {
    this.maxItems = Math.max(10, Math.min(1000, Math.floor(max)))
    // Trim existing items if needed
    if (this.items.length > this.maxItems) {
      const favorites = this.items.filter(i => i.favorite)
      const nonFavorites = this.items.filter(i => !i.favorite)
      const keepCount = this.maxItems - favorites.length
      this.items = [...favorites, ...nonFavorites.slice(0, Math.max(0, keepCount))]
      this.save()
    }
  }
}

// ─── Settings Store ───────────────────────────────────────────

export interface AppSettings {
  toggleShortcut: string
  maxHistory: number
}

const DEFAULT_SETTINGS: AppSettings = {
  toggleShortcut: 'CommandOrControl+Shift+V',
  maxHistory: 200,
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
    // Clamp between 10 and 1000
    const clamped = Math.max(10, Math.min(1000, Math.floor(max)))
    this.settings.maxHistory = clamped
    this.save()
    return true
  }

  resetToDefaults() {
    this.settings = { ...DEFAULT_SETTINGS }
    this.save()
  }
}
