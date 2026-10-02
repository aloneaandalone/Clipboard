/// <reference types="vite/client" />

export interface ClipboardItem {
  id: string
  text: string
  timestamp: number
  favorite: boolean
  preview: string
}

export interface AppSettings {
  toggleShortcut: string
  maxHistory: number
}

declare global {
  interface Window {
    clipboardApi: {
      getHistory: () => Promise<ClipboardItem[]>
      copyItem: (text: string) => Promise<boolean>
      deleteItem: (id: string) => Promise<boolean>
      clearHistory: () => Promise<boolean>
      toggleFavorite: (id: string) => Promise<boolean>
      hideWindow: () => Promise<boolean>
      onHistoryUpdated: (callback: (items: ClipboardItem[]) => void) => void
      getSettings: () => Promise<AppSettings>
      setToggleShortcut: (shortcut: string) => Promise<boolean>
      setMaxHistory: (max: number) => Promise<boolean>
    }
  }
}

export {}
