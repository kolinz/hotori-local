import { useState, useEffect, useCallback, useRef } from 'react'
import { Chat } from './components/Chat'
import { AvatarLayer } from './components/AvatarLayer'
import { SettingsModal } from './components/SettingsModal'
import { SessionsModal } from './components/SessionsModal'
import { OllamaGuide } from './components/OllamaGuide'
import { MotionDebugPanel } from './components/MotionDebugPanel'
import { api, AppSettings } from './utils/electronAPI'
import type { MotionName } from './utils/parseTone'
import styles from './App.module.css'

const MAX_TABS = 5

interface TabInfo {
  id: string
  title: string
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

  // ── アバターからの話しかけメッセージ ──
  const [avatarMessage, setAvatarMessage] = useState<string | null>('私に何を聞きたいの？')
  const avatarMsgTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstResponse    = useRef(true)
  const isPraiseRoute      = useRef(false)   // praiseルート中はneutral→タイマーをスキップ

  const handleMotionChange = useCallback((m: MotionName) => {
    setMotion(m)
    if (m === 'think') {
      // 送信時: メッセージ消去・タイマークリア
      setAvatarMessage(null)
      isPraiseRoute.current = false
      if (avatarMsgTimerRef.current) clearTimeout(avatarMsgTimerRef.current)
    } else if (m === 'neutral') {
      // praiseルート経由のneutralはスキップ（handlePraiseReactionが処理する）
      if (isPraiseRoute.current) {
        isPraiseRoute.current = false
        return
      }
      // 通常レスポンス完了3秒後のneutral
      if (isFirstResponse.current) {
        isFirstResponse.current = false
      } else {
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

  // 理解・納得ワード検知時: praise モーション後に吹き出し表示
  const handlePraiseReaction = useCallback(() => {
    if (avatarMsgTimerRef.current) clearTimeout(avatarMsgTimerRef.current)
    isPraiseRoute.current = true   // neutral が来てもタイマーをスキップさせる
    setAvatarMessage('まだ聞きたいことはあるかしら？')
    setMotion('ask')
  }, [])

  useEffect(() => () => { if (avatarMsgTimerRef.current) clearTimeout(avatarMsgTimerRef.current) }, [])

  // ── タブ管理 ──
  const [tabs, setTabs]               = useState<TabInfo[]>(() => [newTab()])
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id)

  useEffect(() => {
    api.getSettings().then(async s => {
      const defaultPath = await api.getAvatarDefaultPath()
      const resolvedPath = defaultPath ?? s.avatarPath
      const next = { ...s, avatarPath: resolvedPath }
      if (resolvedPath !== s.avatarPath) await api.setSettings(next)
      setSettings(next)
    })
  }, [])

  useEffect(() => {
    api.listModels().then(m => {
      setModels(m)
      setOllamaOnline(m.length > 0)
    })
  }, [])

  useEffect(() => {
    if (!settings?.backgroundImagePath) { setBgDataUrl(''); return }
    api.readAvatarFile(settings.backgroundImagePath).then(d => setBgDataUrl(d ?? ''))
  }, [settings?.backgroundImagePath])

  const handleSettingsSave = async (next: AppSettings) => {
    await api.setSettings(next)
    setSettings(next)
    setShowSettings(false)
    api.listModels().then(m => { setModels(m); setOllamaOnline(m.length > 0) })
  }

  const handleTabTitleUpdate = useCallback((tabId: string, title: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, title } : t))
  }, [])

  const addTab = useCallback(() => {
    const tab = newTab()
    setTabs(prev => {
      const next = [tab, ...prev]
      return next.length > MAX_TABS ? next.slice(0, MAX_TABS) : next
    })
    setActiveTabId(tab.id)
    resetAvatarMessage()
  }, [resetAvatarMessage])

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      if (prev.length === 1) {
        const fresh = newTab()
        setActiveTabId(fresh.id)
        resetAvatarMessage()
        return [fresh]
      }
      const next = prev.filter(t => t.id !== tabId)
      setActiveTabId(cur => {
        if (cur !== tabId) return cur
        const idx = prev.findIndex(t => t.id === tabId)
        return (next[idx] ?? next[idx - 1]).id
      })
      return next
    })
  }, [resetAvatarMessage])

  const handleTabSwitch = useCallback((tabId: string) => {
    setActiveTabId(tabId)
    resetAvatarMessage()
  }, [resetAvatarMessage])

  if (!settings) return null

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.appTitle}>学習アシスタント Hotori</span>
        <div className={styles.toolbarActions}>
          <button
            className={`${styles.toolbarBtn} ${showDebug ? styles.toolbarBtnActive : ''}`}
            onClick={() => setShowDebug(v => !v)} title="モーションテスト"
          >🎭</button>
          <button className={styles.toolbarBtn} onClick={() => setShowSessions(true)} title="履歴">📋</button>
          <button className={styles.toolbarBtn} onClick={() => setShowSettings(true)} title="設定">⚙️</button>
        </div>
      </div>

      <div className={styles.tabBar}>
        {tabs.length < MAX_TABS && (
          <button className={styles.tabAdd} onClick={addTab} title="新しいセッション">＋</button>
        )}
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

      <div
        className={styles.main}
        style={bgDataUrl ? {
          backgroundImage: `url(${bgDataUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        } : undefined}
      >
        <div
          className={styles.chatPane}
          style={bgDataUrl ? { backgroundColor: 'rgba(10,10,26,0.55)', backdropFilter: 'blur(2px)' } : undefined}
        >
          {ollamaOnline === false
            ? <OllamaGuide />
            : tabs.map(tab => (
                <div key={tab.id} style={{ display: tab.id === activeTabId ? 'contents' : 'none' }}>
                  <Chat
                    tabId={tab.id}
                    settings={settings}
                    models={models}
                    onMotionChange={tab.id === activeTabId ? handleMotionChange : () => {}}
                    onSessionTitleChange={handleTabTitleUpdate}
                    onClearChat={resetAvatarMessage}
                    onPraiseReaction={tab.id === activeTabId ? handlePraiseReaction : undefined}
                    avatarMessage={tab.id === activeTabId ? avatarMessage : null}
                  />
                </div>
              ))
          }
        </div>

        <div className={styles.avatarPane}>
          <AvatarLayer
            motion={motion}
            avatarPath={settings.avatarPath}
            reducedMotion={settings.reducedMotion}
          />
        </div>
      </div>

      {showDebug && <MotionDebugPanel current={motion} onChange={setMotion} onClose={() => setShowDebug(false)} />}
      {showSettings && <SettingsModal settings={settings} onSave={handleSettingsSave} onClose={() => setShowSettings(false)} />}
      {showSessions && <SessionsModal onClose={() => setShowSessions(false)} />}
    </div>
  )
}
