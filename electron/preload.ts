import { contextBridge, ipcRenderer } from 'electron'

export interface ClipboardItem {
  id: string
  text: string
  timestamp: number
  favorite: boolean
  preview: string
}

export interface AppSettings {
  toggleShortcut: string
}

export const clipboardApi = {
  getHistory: (): Promise<ClipboardItem[]> => ipcRenderer.invoke('get-history'),
  copyItem: (text: string): Promise<boolean> => ipcRenderer.invoke('copy-item', text),
  deleteItem: (id: string): Promise<boolean> => ipcRenderer.invoke('delete-item', id),
  clearHistory: (): Promise<boolean> => ipcRenderer.invoke('clear-history'),
  toggleFavorite: (id: string): Promise<boolean> => ipcRenderer.invoke('toggle-favorite', id),
  hideWindow: (): Promise<boolean> => ipcRenderer.invoke('hide-window'),
  onHistoryUpdated: (callback: (items: ClipboardItem[]) => void) => {
    ipcRenderer.on('history-updated', (_event, items) => callback(items))
  },
  // Settings
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('get-settings'),
  setToggleShortcut: (shortcut: string): Promise<boolean> => ipcRenderer.invoke('set-toggle-shortcut', shortcut),
  setMaxHistory: (max: number): Promise<boolean> => ipcRenderer.invoke('set-max-history', max),
}

contextBridge.exposeInMainWorld('clipboardApi', clipboardApi)
