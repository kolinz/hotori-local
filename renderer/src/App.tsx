import { useState, useEffect, useCallback, useRef } from 'react'
import { Chat } from './components/Chat'
import { AvatarLayer } from './components/AvatarLayer'
import { CollectionPanel } from './components/CollectionPanel'
import { SettingsModal } from './components/SettingsModal'
import { SessionsModal } from './components/SessionsModal'
import { OllamaGuide } from './components/OllamaGuide'
import { MotionDebugPanel } from './components/MotionDebugPanel'
import { api, AppSettings } from './utils/electronAPI'
import type { MotionName } from './utils/parseTone'
import styles from './App.module.css'

const MAX_TABS = 5
const RIGHT_PANE_MIN = 180
const RIGHT_PANE_MAX = 400
const RIGHT_PANE_DEFAULT = 220

interface TabInfo {
  id: string
  title: string
  sessionId?: string
}

function newTab(): TabInfo {
  return { id: `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`, title: '新しいセッション' }
}

export default function App() {
  const [motion, setMotion]             = useState<MotionName>('neutral')
  const [settings, setSettings]         = useState<AppSettings | null>(null)
  const [bgDataUrl, setBgDataUrl]       = useState<string>('')
  const [models, setModels]             = useState<string[]>([])
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showSessions, setShowSessions] = useState(false)
  const [showDebug, setShowDebug]       = useState(false)

  // v0.2.2: 右ペイン縦タブ ('avatar' | 'collection')
  const [rightTab, setRightTab] = useState<'avatar' | 'collection'>(() => {
    try { return (localStorage.getItem('hotori.rightTab') as 'avatar' | 'collection') || 'collection' }
    catch { return 'collection' }
  })

  // 右ペイン幅（リサイズ）
  const [rightWidth, setRightWidth] = useState<number>(() => {
    try { return Number(localStorage.getItem('hotori.rightWidth')) || RIGHT_PANE_DEFAULT }
    catch { return RIGHT_PANE_DEFAULT }
  })
  const resizerDragging = useRef(false)
  const resizerStartX   = useRef(0)
  const resizerStartW   = useRef(0)

  // ── アバターからの話しかけメッセージ ──
  const [avatarMessage, setAvatarMessage] = useState<string | null>('私に何を聞きたいの？')
  const avatarMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstResponse   = useRef(true)
  const isPraiseRoute     = useRef(false)

  const handleMotionChange = useCallback((m: MotionName) => {
    setMotion(m)
    if (m === 'think') {
      setAvatarMessage(null)
      isPraiseRoute.current = false
      if (avatarMsgTimerRef.current) clearTimeout(avatarMsgTimerRef.current)
    } else if (m === 'neutral') {
      if (isPraiseRoute.current) { isPraiseRoute.current = false; return }
      if (isFirstResponse.current) { isFirstResponse.current = false }
      else {
        if (avatarMsgTimerRef.current) clearTimeout(avatarMsgTimerRef.current)
        avatarMsgTimerRef.current = setTimeout(() => {
          setAvatarMessage('まだ聞きたいことはあるかしら？')
          setMotion('ask')
        }, 10_000)
      }
    }
  }, [])

  const resetAvatarMessage = useCallback(() => {
    if (avatarMsgTimerRef.current) clearTimeout(avatarMsgTimerRef.current)
    isFirstResponse.current = true
    isPraiseRoute.current = false
    setMotion('neutral')
    setAvatarMessage('私に何を聞きたいの？')
  }, [])

  const handlePraiseReaction = useCallback(() => {
    if (avatarMsgTimerRef.current) clearTimeout(avatarMsgTimerRef.current)
    isPraiseRoute.current = true
    setAvatarMessage('まだ聞きたいことはあるかしら？')
    setMotion('ask')
  }, [])

  useEffect(() => () => { if (avatarMsgTimerRef.current) clearTimeout(avatarMsgTimerRef.current) }, [])

  // ── タブ管理 ──
  const [tabs, setTabs]               = useState<TabInfo[]>(() => [newTab()])
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id)

  // ── 設定読み込み ──
  useEffect(() => {
    api.getSettings().then(async s => {
      const defaultPath = await api.getAvatarDefaultPath()
      const resolvedPath = defaultPath ?? s.avatarPath
      const next = { ...s, avatarPath: resolvedPath }
      if (resolvedPath !== s.avatarPath) await api.setSettings(next)
      setSettings(next)
    })
  }, [])

  // ── モデル一覧取得 ──
  useEffect(() => {
    if (!settings) return
    if (settings.connectionMode === 'openai') {
      const openaiModels = settings.openaiModels ?? []
      setModels(openaiModels)
      setOllamaOnline(openaiModels.length > 0 ? true : null)
    } else if (settings.connectionMode === 'gemini') {  // v0.2.3追加
      const geminiModels = settings.geminiModels ?? []
      setModels(geminiModels)
      setOllamaOnline(geminiModels.length > 0 && !!settings.geminiApiKey ? true : null)
    } else if (settings.connectionMode === 'dify') {
      setModels([])
      setOllamaOnline(!!settings.difyApiKey ? true : null)
    } else {
      api.listModels().then(m => { setModels(m); setOllamaOnline(m.length > 0) })
    }
  }, [settings?.connectionMode, settings?.openaiModels, settings?.ollamaUrl, settings?.difyApiKey, settings?.geminiApiKey, settings?.geminiModels])

  // ── 背景画像 ──
  useEffect(() => {
    if (!settings?.backgroundImagePath) { setBgDataUrl(''); return }
    api.readAvatarFile(settings.backgroundImagePath).then(d => setBgDataUrl(d ?? ''))
  }, [settings?.backgroundImagePath])

  const handleSettingsSave = async (next: AppSettings) => {
    await api.setSettings(next)
    setSettings(next)
    setShowSettings(false)
    if (next.connectionMode === 'openai') {
      setModels(next.openaiModels ?? [])
      setOllamaOnline((next.openaiModels ?? []).length > 0 ? true : null)
    } else if (next.connectionMode === 'gemini') {  // v0.2.3追加
      const geminiModels = next.geminiModels ?? []
      setModels(geminiModels)
      setOllamaOnline(geminiModels.length > 0 && !!next.geminiApiKey ? true : null)
    } else if (next.connectionMode === 'dify') {
      setModels([])
      setOllamaOnline(!!next.difyApiKey ? true : null)
    } else {
      api.listModels().then(m => { setModels(m); setOllamaOnline(m.length > 0) })
    }
  }

  const handleTabTitleUpdate = useCallback((tabId: string, title: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, title } : t))
  }, [])

  const handleSessionStart = useCallback((tabId: string, sessionId: string, title: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, sessionId, title } : t))
  }, [])

  const closeTabBySessionId = useCallback((sessionId: string) => {
    setTabs(prev => {
      const target = prev.find(t => t.sessionId === sessionId)
      if (!target) return prev
      if (prev.length === 1) {
        const fresh = newTab(); setActiveTabId(fresh.id); resetAvatarMessage(); return [fresh]
      }
      const next = prev.filter(t => t.sessionId !== sessionId)
      setActiveTabId(cur => {
        if (cur !== target.id) return cur
        const idx = prev.findIndex(t => t.id === target.id)
        return (next[idx] ?? next[idx - 1]).id
      })
      return next
    })
  }, [resetAvatarMessage])

  const addTab = useCallback(() => {
    const tab = newTab()
    setTabs(prev => {
      const next = [tab, ...prev]
      return next.length > MAX_TABS ? next.slice(0, MAX_TABS) : next
    })
    setActiveTabId(tab.id)
    resetAvatarMessage()
  }, [resetAvatarMessage])

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      if (prev.length === 1) {
        const fresh = newTab(); setActiveTabId(fresh.id); resetAvatarMessage(); return [fresh]
      }
      const next = prev.filter(t => t.id !== id)
      setActiveTabId(cur => {
        if (cur !== id) return cur
        const idx = prev.findIndex(t => t.id === id)
        return (next[idx] ?? next[idx - 1]).id
      })
      return next
    })
    resetAvatarMessage()
  }, [resetAvatarMessage])

  const handleTabSwitch = useCallback((id: string) => {
    setActiveTabId(id)
    resetAvatarMessage()
  }, [resetAvatarMessage])

  // ── 右ペインリサイズ ──
  const handleResizerMouseDown = (e: React.MouseEvent) => {
    resizerDragging.current = true
    resizerStartX.current   = e.clientX
    resizerStartW.current   = rightWidth
    document.body.style.cursor    = 'col-resize'
    document.body.style.userSelect = 'none'
  }
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizerDragging.current) return
      const delta = resizerStartX.current - e.clientX  // 左方向が正
      const next  = Math.min(RIGHT_PANE_MAX, Math.max(RIGHT_PANE_MIN, resizerStartW.current + delta))
      setRightWidth(next)
    }
    const onUp = () => {
      if (!resizerDragging.current) return
      resizerDragging.current = false
      document.body.style.cursor     = ''
      document.body.style.userSelect = ''
      setRightWidth(w => { localStorage.setItem('hotori.rightWidth', String(w)); return w })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

  // ── 右タブ切替 (localStorage 永続化) ──
  const switchRightTab = (tab: 'avatar' | 'collection') => {
    setRightTab(tab)
    try { localStorage.setItem('hotori.rightTab', tab) } catch {}
  }

  if (!settings) return null

  const connectionMode = settings.connectionMode ?? 'ollama'
  const openaiModels   = settings.openaiModels ?? []
  const openaiApiKey   = settings.openaiApiKey ?? ''
  const difyApiKey     = settings.difyApiKey ?? ''
  const geminiModels   = settings.geminiModels ?? []    // v0.2.3追加
  const geminiApiKey   = settings.geminiApiKey ?? ''    // v0.2.3追加

  const isOffline =
    connectionMode === 'openai'  ? openaiModels.length === 0 || !openaiApiKey
    : connectionMode === 'gemini' ? geminiModels.length === 0 || !geminiApiKey  // v0.2.3追加
    : connectionMode === 'dify'   ? !difyApiKey
    : ollamaOnline === false

  const resolvedSettings =
    connectionMode === 'openai'
      ? { ...settings, defaultModel: openaiModels[0] ?? settings.defaultModel }
    : connectionMode === 'gemini'                                                // v0.2.3追加
      ? { ...settings, defaultModel: geminiModels[0] ?? settings.defaultModel }
    : settings

  return (
    <div className={styles.root}>
      {/* ── ツールバー ── */}
      <div className={styles.toolbar}>
        <span className={styles.appTitle}>🌸 Hotori</span>
        <div className={styles.toolbarActions}>
          <button
            className={styles.toolbarBtn}
            onClick={addTab}
            title="新しいタブ"
          >＋</button>
          <button
            className={`${styles.toolbarBtn} ${showDebug ? styles.toolbarBtnActive : ''}`}
            onClick={() => setShowDebug(v => !v)}
            title="モーションデバッグ"
          >🎭</button>
          <button
            className={`${styles.toolbarBtn} ${showSessions ? styles.toolbarBtnActive : ''}`}
            onClick={() => setShowSessions(v => !v)}
            title="学習セッション一覧"
          >📋</button>
          <button
            className={`${styles.toolbarBtn} ${showSettings ? styles.toolbarBtnActive : ''}`}
            onClick={() => setShowSettings(v => !v)}
            title="設定"
          >⚙️</button>
        </div>
      </div>

      {/* ── タブバー ── */}
      <div className={styles.tabBar}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`${styles.tab} ${tab.id === activeTabId ? styles.tabActive : ''}`}
            onClick={() => handleTabSwitch(tab.id)}
          >
            <span className={styles.tabTitle}>{tab.title}</span>
            <button
              className={styles.tabClose}
              onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
              title="タブを閉じる"
            >✕</button>
          </div>
        ))}
      </div>

      {/* ── メインエリア ── */}
      <div
        className={styles.main}
        style={bgDataUrl ? {
          backgroundImage: `url(${bgDataUrl})`,
          backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
        } : undefined}
      >
        {/* チャットペイン */}
        <div
          className={styles.chatPane}
          style={bgDataUrl ? { backgroundColor: 'rgba(10,10,26,0.55)', backdropFilter: 'blur(2px)' } : undefined}
        >
          {isOffline
            ? <OllamaGuide connectionMode={settings.connectionMode} />
            : tabs.map(tab => (
                <div key={tab.id} style={{ display: tab.id === activeTabId ? 'contents' : 'none' }}>
                  <Chat
                    tabId={tab.id}
                    settings={resolvedSettings}
                    models={models}
                    onMotionChange={tab.id === activeTabId ? handleMotionChange : () => {}}
                    onSessionTitleChange={handleTabTitleUpdate}
                    onSessionStart={handleSessionStart}
                    onClearChat={resetAvatarMessage}
                    onPraiseReaction={tab.id === activeTabId ? handlePraiseReaction : undefined}
                    avatarMessage={tab.id === activeTabId ? avatarMessage : null}
                  />
                </div>
              ))
          }
        </div>

        {/* ── リサイザー ── */}
        <div
          className={styles.resizer}
          onMouseDown={handleResizerMouseDown}
          title="ドラッグで幅を調整"
        />

        {/* ── 右ペイン ── */}
        <div className={styles.rightPane} style={{ width: rightWidth }}>
          {/* 縦タブ */}
          <div className={styles.rightTabBar}>
            <button
              className={`${styles.rightTabBtn} ${rightTab === 'avatar' ? styles.rightTabBtnActive : ''}`}
              onClick={() => switchRightTab('avatar')}
              title="アバター"
            >🧑</button>
            <button
              className={`${styles.rightTabBtn} ${rightTab === 'collection' ? styles.rightTabBtnActive : ''}`}
              onClick={() => switchRightTab('collection')}
              title="学習コレクション"
            >📚</button>
          </div>

          {/* タブコンテンツ */}
          <div className={styles.rightContent}>
            {rightTab === 'avatar' ? (
              <AvatarLayer
                motion={motion}
                avatarPath={settings.avatarPath}
                reducedMotion={settings.reducedMotion}
              />
            ) : (
              <CollectionPanel maxCollections={settings.maxCollections ?? 10} />
            )}
          </div>
        </div>
      </div>

      {showDebug && <MotionDebugPanel current={motion} onChange={setMotion} onClose={() => setShowDebug(false)} />}
      {showSettings && <SettingsModal settings={settings} onSave={handleSettingsSave} onClose={() => setShowSettings(false)} />}
      {showSessions && (
        <SessionsModal
          onClose={() => setShowSessions(false)}
          onDeleteSession={closeTabBySessionId}
        />
      )}
    </div>
  )
}
