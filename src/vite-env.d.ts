/// <reference types="vite/client" />

export type ClipboardItemType = 'text' | 'file'

export interface ClipboardItem {
  id: string
  type: ClipboardItemType
  text: string
  timestamp: number
  favorite: boolean
  inHistory: boolean
  preview: string
  fileName?: string
  fileSize?: number
  storedPath?: string
}

export interface AppSettings {
  toggleShortcut: string
  maxHistory: number
  maxFiles: number
  filesDir: string
}

declare global {
  interface Window {
    clipboardApi: {
      getHistory: () => Promise<ClipboardItem[]>
      copyItem: (id: string) => Promise<boolean>
      deleteItem: (id: string) => Promise<boolean>
      deleteFromFavorites: (id: string) => Promise<boolean>
      clearHistory: () => Promise<boolean>
      clearFavorites: () => Promise<boolean>
      toggleFavorite: (id: string) => Promise<boolean>
      hideWindow: () => Promise<boolean>
      openFile: (id: string) => Promise<boolean>
      openFileLocation: (id: string) => Promise<boolean>
      onHistoryUpdated: (callback: (items: ClipboardItem[]) => void) => void
      getSettings: () => Promise<AppSettings>
      setToggleShortcut: (shortcut: string) => Promise<boolean>
      setMaxHistory: (max: number) => Promise<boolean>
      setMaxFiles: (max: number) => Promise<boolean>
      selectFilesDirectory: () => Promise<string | null>
      setFilesDirectory: (dir: string) => Promise<boolean>
      getFilesDirectory: () => Promise<string>
      resetFilesDirectory: () => Promise<boolean>
    }
  }
}

export {}
