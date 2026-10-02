import { contextBridge, ipcRenderer } from 'electron'

export type ClipboardItemType = 'text' | 'file'

export interface ClipboardItem {
  id: string
  type: ClipboardItemType
  text: string
  timestamp: number
  favorite: boolean
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

export const clipboardApi = {
  getHistory: (): Promise<ClipboardItem[]> => ipcRenderer.invoke('get-history'),
  copyItem: (id: string): Promise<boolean> => ipcRenderer.invoke('copy-item', id),
  deleteItem: (id: string): Promise<boolean> => ipcRenderer.invoke('delete-item', id),
  deleteFromFavorites: (id: string): Promise<boolean> => ipcRenderer.invoke('delete-from-favorites', id),
  clearHistory: (): Promise<boolean> => ipcRenderer.invoke('clear-history'),
  clearFavorites: (): Promise<boolean> => ipcRenderer.invoke('clear-favorites'),
  toggleFavorite: (id: string): Promise<boolean> => ipcRenderer.invoke('toggle-favorite', id),
  hideWindow: (): Promise<boolean> => ipcRenderer.invoke('hide-window'),
  openFile: (id: string): Promise<boolean> => ipcRenderer.invoke('open-file', id),
  openFileLocation: (id: string): Promise<boolean> => ipcRenderer.invoke('open-file-location', id),
  onHistoryUpdated: (callback: (items: ClipboardItem[]) => void) => {
    ipcRenderer.on('history-updated', (_event, items) => callback(items))
  },
  // Settings
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('get-settings'),
  setToggleShortcut: (shortcut: string): Promise<boolean> => ipcRenderer.invoke('set-toggle-shortcut', shortcut),
  setMaxHistory: (max: number): Promise<boolean> => ipcRenderer.invoke('set-max-history', max),
  setMaxFiles: (max: number): Promise<boolean> => ipcRenderer.invoke('set-max-files', max),
  selectFilesDirectory: (): Promise<string | null> => ipcRenderer.invoke('select-files-directory'),
  setFilesDirectory: (dir: string): Promise<boolean> => ipcRenderer.invoke('set-files-directory', dir),
  getFilesDirectory: (): Promise<string> => ipcRenderer.invoke('get-files-directory'),
  resetFilesDirectory: (): Promise<boolean> => ipcRenderer.invoke('reset-files-directory'),
}

contextBridge.exposeInMainWorld('clipboardApi', clipboardApi)
