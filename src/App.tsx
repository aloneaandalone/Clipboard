import { useState, useEffect, useCallback, useRef } from 'react'
import type { ClipboardItem, AppSettings } from './vite-env.d'

type TabType = 'all' | 'files' | 'favorites' | 'settings'

const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+V'
const DEFAULT_MAX_HISTORY = 200
const DEFAULT_MAX_FILES = 100

// Convert Electron accelerator to display text
function shortcutToDisplay(shortcut: string): string {
  return shortcut
    .replace(/CommandOrControl/g, 'Ctrl')
    .replace(/Command/g, 'Cmd')
    .replace(/Control/g, 'Ctrl')
    .replace(/Alt/g, 'Alt')
    .replace(/Shift/g, 'Shift')
    .replace(/\+/g, ' + ')
}

// Convert keyboard event to Electron accelerator string
function eventToAccelerator(e: KeyboardEvent): string | null {
  const keys: string[] = []

  if (e.ctrlKey) keys.push('Control')
  if (e.altKey) keys.push('Alt')
  if (e.shiftKey) keys.push('Shift')
  if (e.metaKey) keys.push('Command')

  // Need at least one modifier
  if (keys.length === 0) return null

  const key = e.key
  if (!key) return null

  // Ignore modifier keys themselves
  if (['Control', 'Alt', 'Shift', 'Meta', 'OS'].includes(key)) return null

  // Map common keys
  let keyName = key
  if (key === ' ') {
    keyName = 'Space'
  } else if (key.length === 1) {
    keyName = key.toUpperCase()
  } else if (key.startsWith('Arrow')) {
    keyName = key.replace('Arrow', '')
  }

  keys.push(keyName)
  return keys.join('+')
}

// Format file size to human readable
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

// Get file icon based on extension
function getFileIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const iconMap: Record<string, string> = {
    // Images
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', bmp: '🖼️', svg: '🖼️', webp: '🖼️', ico: '🖼️',
    // Documents
    pdf: '📄', doc: '📝', docx: '📝', txt: '📃', md: '📝', rtf: '📝',
    xls: '📊', xlsx: '📊', csv: '📊',
    ppt: '📽️', pptx: '📽️',
    // Archives
    zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
    // Audio
    mp3: '🎵', wav: '🎵', flac: '🎵', aac: '🎵', ogg: '🎵', m4a: '🎵',
    // Video
    mp4: '🎬', avi: '🎬', mkv: '🎬', mov: '🎬', wmv: '🎬', flv: '🎬', webm: '🎬',
    // Code
    js: '💻', ts: '💻', jsx: '💻', tsx: '💻', html: '💻', css: '💻', scss: '💻',
    py: '💻', java: '💻', cpp: '💻', c: '💻', h: '💻', json: '💻', xml: '💻',
    // Executables
    exe: '⚙️', msi: '⚙️', bat: '⚙️', cmd: '⚙️', ps1: '⚙️', sh: '⚙️',
  }
  return iconMap[ext] || '📄'
}

function App() {
  const [items, setItems] = useState<ClipboardItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Settings state
  const [settings, setSettings] = useState<AppSettings>({
    toggleShortcut: DEFAULT_SHORTCUT,
    maxHistory: DEFAULT_MAX_HISTORY,
    maxFiles: DEFAULT_MAX_FILES,
  })
  const [isRecording, setIsRecording] = useState(false)
  const [recordedKeys, setRecordedKeys] = useState<string>('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const recordBtnRef = useRef<HTMLButtonElement>(null)

  // Filter items based on search and tab
  const filteredItems = items.filter(item => {
    const matchesSearch = searchQuery === '' ||
      item.preview.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.fileName && item.fileName.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesTab = activeTab === 'all' ||
      (activeTab === 'files' && item.type === 'file') ||
      (activeTab === 'favorites' && item.favorite)
    return matchesSearch && matchesTab
  })

  // Load initial history
  useEffect(() => {
    if (window.clipboardApi) {
      window.clipboardApi.getHistory().then(setItems)
    }
  }, [])

  // Load settings
  useEffect(() => {
    if (window.clipboardApi) {
      window.clipboardApi.getSettings().then(s => setSettings(s))
    }
  }, [])

  // Listen for history updates
  useEffect(() => {
    if (window.clipboardApi) {
      window.clipboardApi.onHistoryUpdated((newItems) => {
        setItems(newItems)
        setSelectedIndex(0)
      })
    }
  }, [])

  // Focus search on mount / tab change
  useEffect(() => {
    if (activeTab !== 'settings') {
      searchRef.current?.focus()
    }
  }, [activeTab])

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchQuery, activeTab])

  // Keyboard navigation (only when not in settings tab and not recording)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isRecording || activeTab === 'settings') return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev =>
          prev < filteredItems.length - 1 ? prev + 1 : prev
        )
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredItems[selectedIndex]) {
          handleCopy(filteredItems[selectedIndex].id)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        window.clipboardApi?.hideWindow()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (filteredItems[selectedIndex] && !searchRef.current?.matches(':focus')) {
          e.preventDefault()
          handleDelete(filteredItems[selectedIndex].id)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredItems, selectedIndex, isRecording, activeTab])

  // Shortcut recording handler
  useEffect(() => {
    if (!isRecording) return

    const handleRecordKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const accelerator = eventToAccelerator(e)
      if (accelerator) {
        setRecordedKeys(accelerator)
      } else {
        const mods: string[] = []
        if (e.ctrlKey) mods.push('Ctrl')
        if (e.altKey) mods.push('Alt')
        if (e.shiftKey) mods.push('Shift')
        if (e.metaKey) mods.push('Cmd')
        if (mods.length > 0) {
          setRecordedKeys(mods.join(' + ') + ' + ...')
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const accelerator = eventToAccelerator(e)
      if (accelerator) {
        confirmShortcut(accelerator)
      }
    }

    window.addEventListener('keydown', handleRecordKey, true)
    window.addEventListener('keyup', handleKeyUp, true)

    return () => {
      window.removeEventListener('keydown', handleRecordKey, true)
      window.removeEventListener('keyup', handleKeyUp, true)
    }
  }, [isRecording])

  // Scroll selected item into view
  useEffect(() => {
    const selectedEl = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`)
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const handleCopy = useCallback((id: string) => {
    window.clipboardApi?.copyItem(id)
    window.clipboardApi?.hideWindow()
  }, [])

  const handleDelete = useCallback((id: string) => {
    window.clipboardApi?.deleteItem(id)
  }, [])

  const handleToggleFavorite = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    window.clipboardApi?.toggleFavorite(id)
  }, [])

  const handleOpenFile = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    window.clipboardApi?.openFile(id)
  }, [])

  const handleOpenFileLocation = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    window.clipboardApi?.openFileLocation(id)
  }, [])

  const handleClearAll = useCallback(() => {
    if (confirm('确定要清空所有剪贴板历史吗？收藏的内容会保留。')) {
      window.clipboardApi?.clearHistory()
    }
  }, [])

  const handleClose = useCallback(() => {
    window.clipboardApi?.hideWindow()
  }, [])

  const startRecording = useCallback(() => {
    setIsRecording(true)
    setRecordedKeys('按下快捷键组合...')
    setSaveStatus('idle')
  }, [])

  const confirmShortcut = useCallback(async (accelerator: string) => {
    setIsRecording(false)
    const success = await window.clipboardApi?.setToggleShortcut(accelerator)
    if (success) {
      setSettings(prev => ({ ...prev, toggleShortcut: accelerator }))
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } else {
      setSaveStatus('error')
      setRecordedKeys('')
    }
  }, [])

  const cancelRecording = useCallback(() => {
    setIsRecording(false)
    setRecordedKeys('')
  }, [])

  const resetShortcut = useCallback(async () => {
    const success = await window.clipboardApi?.setToggleShortcut(DEFAULT_SHORTCUT)
    if (success) {
      setSettings(prev => ({ ...prev, toggleShortcut: DEFAULT_SHORTCUT }))
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }, [])

  const handleMaxHistoryChange = useCallback(async (value: number) => {
    const clamped = Math.max(10, Math.min(1000, Math.floor(value)))
    setSettings(prev => ({ ...prev, maxHistory: clamped }))
    await window.clipboardApi?.setMaxHistory(clamped)
  }, [])

  const handleMaxFilesChange = useCallback(async (value: number) => {
    const clamped = Math.max(1, Math.min(500, Math.floor(value)))
    setSettings(prev => ({ ...prev, maxFiles: clamped }))
    await window.clipboardApi?.setMaxFiles(clamped)
  }, [])

  const resetAllSettings = useCallback(async () => {
    if (window.clipboardApi) {
      await window.clipboardApi.setToggleShortcut(DEFAULT_SHORTCUT)
      await window.clipboardApi.setMaxHistory(DEFAULT_MAX_HISTORY)
      await window.clipboardApi.setMaxFiles(DEFAULT_MAX_FILES)
      setSettings({
        toggleShortcut: DEFAULT_SHORTCUT,
        maxHistory: DEFAULT_MAX_HISTORY,
        maxFiles: DEFAULT_MAX_FILES,
      })
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }, [])

  const formatTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp

    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`

    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === yesterday.toDateString()) {
      return '昨天'
    }

    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  const isSettingsTab = activeTab === 'settings'
  const fileCount = items.filter(i => i.type === 'file').length
  const textCount = items.filter(i => i.type === 'text').length

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <div className="header-top">
          <div className="logo">
            <div className="logo-icon">📋</div>
            <span>Clipboard Vibe</span>
          </div>
          <div className="header-actions">
            {!isSettingsTab && (
              <button
                className="icon-btn danger"
                onClick={handleClearAll}
                title="清空历史"
              >
                🗑️
              </button>
            )}
            <button
              className="icon-btn"
              onClick={handleClose}
              title="关闭"
            >
              ✕
            </button>
          </div>
        </div>
        {!isSettingsTab && (
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              ref={searchRef}
              type="text"
              placeholder="搜索剪贴板历史..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          全部 ({items.length})
        </button>
        <button
          className={`tab ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          📁 文件 ({fileCount})
        </button>
        <button
          className={`tab ${activeTab === 'favorites' ? 'active' : ''}`}
          onClick={() => setActiveTab('favorites')}
        >
          收藏 ({items.filter(i => i.favorite).length})
        </button>
        <button
          className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          ⚙️ 设置
        </button>
      </div>

      {/* List / Settings */}
      {isSettingsTab ? (
        <div className="settings-panel">
          <div className="setting-section">
            <div className="setting-title">快捷键设置</div>
            <div className="setting-desc">自定义唤出剪贴板窗口的全局快捷键</div>

            <div className="setting-row">
              <div className="setting-label">显示/隐藏窗口</div>
              <div className="setting-control">
                {isRecording ? (
                  <div className="shortcut-record">
                    <span className="recording-dot"></span>
                    <span className="recording-text">{recordedKeys}</span>
                    <button
                      className="btn btn-secondary"
                      onClick={cancelRecording}
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    ref={recordBtnRef}
                    className="shortcut-display"
                    onClick={startRecording}
                    title="点击录制新快捷键"
                  >
                    {shortcutToDisplay(settings.toggleShortcut)}
                    <span className="edit-hint">点击修改</span>
                  </button>
                )}
              </div>
            </div>

            {saveStatus === 'success' && (
              <div className="status-message success">✓ 快捷键已保存并生效</div>
            )}
            {saveStatus === 'error' && (
              <div className="status-message error">✗ 快捷键设置失败，请尝试其他组合</div>
            )}

            <div className="setting-hints">
              <div className="hint-title">💡 提示</div>
              <ul>
                <li>点击上方按钮后，按下你想要的快捷键组合</li>
                <li>建议使用 Ctrl / Alt / Shift + 字母键 的组合</li>
                <li>快捷键会立即生效并自动保存</li>
              </ul>
            </div>

            <button
              className="btn btn-ghost"
              onClick={resetShortcut}
            >
              恢复默认快捷键
            </button>
          </div>

          <div className="setting-section">
            <div className="setting-title">文字存储设置</div>
            <div className="setting-desc">调整文字剪贴板历史最多保存的条数</div>

            <div className="setting-row">
              <div className="setting-label">最大存储条数</div>
              <div className="setting-control">
                <input
                  type="number"
                  className="number-input"
                  min={10}
                  max={1000}
                  value={settings.maxHistory}
                  onChange={e => handleMaxHistoryChange(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="slider-row">
              <input
                type="range"
                className="slider"
                min={10}
                max={1000}
                step={10}
                value={settings.maxHistory}
                onChange={e => handleMaxHistoryChange(Number(e.target.value))}
              />
              <div className="slider-labels">
                <span>10</span>
                <span>1000</span>
              </div>
            </div>

            <div className="setting-hints">
              <div className="hint-title">💡 提示</div>
              <ul>
                <li>范围：10 ~ 1000 条</li>
                <li>收藏的内容不会被自动清理</li>
                <li>当前已保存 {textCount} 条文字</li>
              </ul>
            </div>
          </div>

          <div className="setting-section">
            <div className="setting-title">文件存储设置</div>
            <div className="setting-desc">调整文件剪贴板最多保存的文件数量</div>

            <div className="setting-row">
              <div className="setting-label">最大文件数</div>
              <div className="setting-control">
                <input
                  type="number"
                  className="number-input"
                  min={1}
                  max={500}
                  value={settings.maxFiles}
                  onChange={e => handleMaxFilesChange(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="slider-row">
              <input
                type="range"
                className="slider"
                min={1}
                max={500}
                step={1}
                value={settings.maxFiles}
                onChange={e => handleMaxFilesChange(Number(e.target.value))}
              />
              <div className="slider-labels">
                <span>1</span>
                <span>500</span>
              </div>
            </div>

            <div className="setting-hints">
              <div className="hint-title">💡 提示</div>
              <ul>
                <li>范围：1 ~ 500 个文件</li>
                <li>文件会保存在本地存储目录中</li>
                <li>收藏的文件不会被自动清理</li>
                <li>当前已保存 {fileCount} 个文件</li>
              </ul>
            </div>
          </div>

          <div className="setting-section">
            <div className="setting-title">关于</div>
            <div className="setting-desc">
              Clipboard Vibe v1.1.0<br />
              一个现代化的剪贴板历史管理器
            </div>
            <button
              className="btn btn-ghost"
              onClick={resetAllSettings}
            >
              恢复所有默认设置
            </button>
          </div>
        </div>
      ) : (
        <div className="list" ref={listRef}>
          {filteredItems.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📭</div>
              <div className="empty-text">
                {searchQuery
                  ? '没有找到匹配的内容'
                  : activeTab === 'favorites'
                    ? '还没有收藏的内容'
                    : activeTab === 'files'
                      ? '还没有复制过文件'
                      : '剪贴板历史为空'}
              </div>
              <div className="empty-hint">
                {searchQuery
                  ? '试试其他关键词'
                  : activeTab === 'files'
                    ? '复制一些文件，它们会出现在这里'
                    : '复制一些文字或文件，它们会出现在这里'}
              </div>
            </div>
          ) : (
            filteredItems.map((item, index) => (
              <div
                key={item.id}
                data-index={index}
                className={`item ${index === selectedIndex ? 'selected' : ''} ${item.type === 'file' ? 'item-file' : ''}`}
                onClick={() => handleCopy(item.id)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {item.type === 'file' ? (
                  <>
                    <div className="file-icon">{getFileIcon(item.fileName || item.preview)}</div>
                    <div className="item-content">
                      <div className="file-name">{item.fileName || item.preview}</div>
                      <div className="item-meta">
                        <span className="item-time">
                          {item.favorite && '⭐ '}
                          {item.fileSize ? formatFileSize(item.fileSize) : ''} · {formatTime(item.timestamp)}
                        </span>
                        <div className="item-actions">
                          <button
                            className="mini-btn"
                            onClick={e => handleOpenFile(item.id, e)}
                            title="打开文件"
                          >
                            📂
                          </button>
                          <button
                            className="mini-btn"
                            onClick={e => handleOpenFileLocation(item.id, e)}
                            title="打开所在位置"
                          >
                            📁
                          </button>
                          <button
                            className={`mini-btn favorite ${item.favorite ? 'active' : ''}`}
                            onClick={e => handleToggleFavorite(item.id, e)}
                            title={item.favorite ? '取消收藏' : '收藏'}
                          >
                            {item.favorite ? '⭐' : '☆'}
                          </button>
                          <button
                            className="mini-btn delete"
                            onClick={e => {
                              e.stopPropagation()
                              handleDelete(item.id)
                            }}
                            title="删除"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="item-preview">{item.preview}</div>
                    <div className="item-meta">
                      <span className="item-time">
                        {item.favorite && '⭐ '}
                        {formatTime(item.timestamp)}
                      </span>
                      <div className="item-actions">
                        <button
                          className={`mini-btn favorite ${item.favorite ? 'active' : ''}`}
                          onClick={e => handleToggleFavorite(item.id, e)}
                          title={item.favorite ? '取消收藏' : '收藏'}
                        >
                          {item.favorite ? '⭐' : '☆'}
                        </button>
                        <button
                          className="mini-btn delete"
                          onClick={e => {
                            e.stopPropagation()
                            handleDelete(item.id)
                          }}
                          title="删除"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Footer */}
      <div className="footer">
        <span>
          {isSettingsTab
            ? '设置'
            : `共 ${filteredItems.length} 条`
          }
        </span>
        <div className="shortcut-hint">
          <span className="kbd">↑</span>
          <span className="kbd">↓</span>
          <span>选择</span>
          <span className="kbd">Enter</span>
          <span>复制</span>
          <span className="kbd">Esc</span>
          <span>关闭</span>
        </div>
      </div>
    </div>
  )
}

export default App
