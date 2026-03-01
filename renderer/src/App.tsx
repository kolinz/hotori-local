import { useState, useEffect, useCallback } from 'react'
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
  id: string           // Chat コンポーネントの key にもなる一意ID
  title: string        // セッション開始後に日時タイトルが入る
}

function newTab(): TabInfo {
  return { id: `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`, title: '新しいセッション' }
}

export default function App() {
  const [motion, setMotion]               = useState<MotionName>('neutral')
  const [settings, setSettings]           = useState<AppSettings | null>(null)
  const [bgDataUrl, setBgDataUrl]         = useState<string>('')
  const [models, setModels]               = useState<string[]>([])
  const [ollamaOnline, setOllamaOnline]   = useState<boolean | null>(null)
  const [showSettings, setShowSettings]   = useState(false)
  const [showSessions, setShowSessions]   = useState(false)
  const [showDebug, setShowDebug]         = useState(false)

  // ── タブ管理 ──
  const [tabs, setTabs]         = useState<TabInfo[]>(() => [newTab()])
  const [activeTabId, setActiveTabId] = useState<string>(() => tabs[0].id)

  // 設定読み込み
  useEffect(() => {
    api.getSettings().then(async s => {
      const defaultPath = await api.getAvatarDefaultPath()
      const resolvedPath = defaultPath ?? s.avatarPath
      const next = { ...s, avatarPath: resolvedPath }
      if (resolvedPath !== s.avatarPath) await api.setSettings(next)
      setSettings(next)
    })
  }, [])

  // モデル一覧
  useEffect(() => {
    api.listModels().then(m => {
      setModels(m)
      setOllamaOnline(m.length > 0)
    })
  }, [])

  // 背景画像
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

  // タブタイトル更新（セッション作成時にChatから呼ばれる）
  const handleTabTitleUpdate = useCallback((tabId: string, title: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, title } : t))
  }, [])

  // 新規タブ追加
  const addTab = useCallback(() => {
    const tab = newTab()
    setTabs(prev => {
      const next = [tab, ...prev]
      // 5を超えたら末尾（最古）を削除
      return next.length > MAX_TABS ? next.slice(0, MAX_TABS) : next
    })
    setActiveTabId(tab.id)
  }, [])

  // タブを閉じる（セッションDBは削除しない）
  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      if (prev.length === 1) {
        // 最後の1枚は閉じずに新しいタブに置き換える
        const fresh = newTab()
        setActiveTabId(fresh.id)
        return [fresh]
      }
      const next = prev.filter(t => t.id !== tabId)
      // 閉じたのがアクティブなら隣を選択
      setActiveTabId(cur => {
        if (cur !== tabId) return cur
        const idx = prev.findIndex(t => t.id === tabId)
        return (next[idx] ?? next[idx - 1]).id
      })
      return next
    })
  }, [])

  if (!settings) return null

  return (
    <div className={styles.root}>
      {/* ── ツールバー ── */}
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

      {/* ── タブバー ── */}
      <div className={styles.tabBar}>
        {tabs.length < MAX_TABS && (
          <button className={styles.tabAdd} onClick={addTab} title="新しいセッション">＋</button>
        )}
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`${styles.tab} ${tab.id === activeTabId ? styles.tabActive : ''}`}
            onClick={() => setActiveTabId(tab.id)}
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
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        } : undefined}
      >
        {/* 左: チャット（タブごとにChatをマウント、非アクティブは隠す） */}
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
                    onMotionChange={tab.id === activeTabId ? setMotion : () => {}}
                    onSessionTitleChange={handleTabTitleUpdate}
                  />
                </div>
              ))
          }
        </div>

        {/* 右: アバター */}
        <div className={styles.avatarPane}>
          <AvatarLayer
            motion={motion}
            avatarPath={settings.avatarPath}
            reducedMotion={settings.reducedMotion}
          />
        </div>
      </div>

      {/* オーバーレイ */}
      {showDebug && <MotionDebugPanel current={motion} onChange={setMotion} onClose={() => setShowDebug(false)} />}
      {showSettings && <SettingsModal settings={settings} onSave={handleSettingsSave} onClose={() => setShowSettings(false)} />}
      {showSessions && <SessionsModal onClose={() => setShowSessions(false)} />}
    </div>
  )
}
