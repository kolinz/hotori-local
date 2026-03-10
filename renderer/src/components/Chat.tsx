import { useState, useEffect, useRef, useCallback } from 'react'
import { api, AppSettings, Session, Message, MixingCollection } from '../utils/electronAPI'
import type { ChatDeltaPayload, ChatDonePayload } from '../utils/electronAPI'
import { parseToneTagged, MotionName } from '../utils/parseTone'
import { buildSystemPrompt } from '../utils/systemPrompt'
import { AddToCollectionPopup } from './CollectionPanel'
import styles from './Chat.module.css'

interface Props {
  tabId: string
  settings: AppSettings
  models: string[]
  onMotionChange: (motion: MotionName) => void
  onSessionTitleChange: (tabId: string, title: string) => void
  onSessionStart?: (tabId: string, sessionId: string, title: string) => void
  onClearChat?: () => void
  onPraiseReaction?: () => void
  avatarMessage?: string | null
}

interface UIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  contentClean: string
  tone: MotionName
  isStreaming: boolean
  ttft_ms?: number
  rating?: 'good' | 'bad' | null
}

function genId() { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }

function makeSessionTitle(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}/${pad(now.getMonth()+1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

function buildUnderstandingRegex(words: string[]): RegExp {
  if (words.length === 0) return /(?!)/
  const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^(${escaped.join('|')})[。、！!…\\s]*$`, 'i')
}

export function Chat({
  tabId, settings, models, onMotionChange, onSessionTitleChange,
  onSessionStart, onClearChat, onPraiseReaction, avatarMessage,
}: Props) {
  const [messages, setMessages]         = useState<UIMessage[]>([])
  const [input, setInput]               = useState('')
  const [isStreaming, setIsStreaming]   = useState(false)
  const [selectedModel, setSelectedModel] = useState(settings.defaultModel)
  const [sessionId]                     = useState(genId)
  const [sessionCreated, setSessionCreated] = useState(false)

  // v0.2.2: コレクション関連状態
  const [collections, setCollections]           = useState<MixingCollection[]>([])
  const [collectionPopup, setCollectionPopup]   = useState<{ userMsgId: string; assistantMsgId: string } | null>(null)
  const [addToast, setAddToast]                 = useState<string | null>(null)
  const collectionBtnRef = useRef<HTMLButtonElement | null>(null)
  const collectionBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  useEffect(() => {
    if (!sessionCreated) setSelectedModel(settings.defaultModel)
  }, [settings.defaultModel]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentRequestId   = useRef<string | null>(null)
  const accumulatedContent = useRef<string>('')
  const assistantMsgId     = useRef<string>('')
  const motionTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesEndRef     = useRef<HTMLDivElement>(null)
  const textareaRef        = useRef<HTMLTextAreaElement>(null)
  const sessionModeRef     = useRef<typeof settings.connectionMode | null>(null)  // v0.2.4追加
  const sessionModelsRef   = useRef<string[]>([])  // v0.2.4追加: セッション開始時のモデルリストを固定

  const toneTagEnabled            = settings.toneTagEnabled ?? false
  const enabledMotions            = settings.enabledMotions ?? undefined
  const understandingWordsEnabled = settings.understandingWordsEnabled ?? true
  const distanceEnabled           = settings.distanceEnabled ?? false

  const isDify = settings.connectionMode === 'dify'

  const resolveModelName = (): string => {
    const mode = sessionModeRef.current ?? settings.connectionMode
    if (mode === 'dify') return 'Dify'
    return selectedModel
  }

  // セッション中の接続モード（表示用）
  const sessionMode = sessionModeRef.current ?? settings.connectionMode

  const resolveTone = useCallback((text: string): { tone: MotionName; clean: string } => {
    if (!toneTagEnabled) {
      const { clean } = parseToneTagged(text, [])
      return { tone: 'neutral', clean }
    }
    return parseToneTagged(text, enabledMotions)
  }, [toneTagEnabled, enabledMotions])

  const triggerPostResponseMotion = useCallback((tone: MotionName) => {
    onMotionChange(tone)
    if (motionTimerRef.current) clearTimeout(motionTimerRef.current)
    motionTimerRef.current = setTimeout(() => onMotionChange('neutral'), 3000)
  }, [onMotionChange])

  useEffect(() => () => { if (motionTimerRef.current) clearTimeout(motionTimerRef.current) }, [])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, avatarMessage])

  // v0.2.2: コレクション一覧を取得（コレクション追加ポップアップ用）
  useEffect(() => {
    api.listCollections().then(setCollections)
  }, [])

  useEffect(() => {
    const unsubDelta = api.onChatDelta((p: ChatDeltaPayload) => {
      if (p.requestId !== currentRequestId.current) return
      accumulatedContent.current += p.delta
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (!last || last.role !== 'assistant') return prev
        const newContent = last.content + p.delta
        const { clean } = resolveTone(newContent)
        return [...prev.slice(0, -1), { ...last, content: newContent, contentClean: clean }]
      })
    })

    const unsubDone = api.onChatDone(async (p: ChatDonePayload) => {
      if (p.requestId !== currentRequestId.current) return
      currentRequestId.current = null

      const fullContent = accumulatedContent.current
      accumulatedContent.current = ''
      const { tone, clean } = resolveTone(fullContent)

      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (!last || last.role !== 'assistant') return prev
        return [...prev.slice(0, -1), {
          ...last, content: fullContent, contentClean: clean, tone,
          isStreaming: false, ttft_ms: p.ttft_ms,
        }]
      })

      setIsStreaming(false)
      triggerPostResponseMotion(tone)

      await api.appendMessage({
        id: assistantMsgId.current,
        session_id: sessionId, role: 'assistant',
        content: fullContent, content_clean: clean,
        tone, model: resolveModelName(),
        latency_ms: 0, ttft_ms: p.ttft_ms,
        tokens_in: 0, tokens_out: 0, safety_flags: '', error: '',
        created_at: new Date().toISOString(),
      } as Message)
    })

    const unsubError = api.onChatError((p) => {
      if (p.requestId !== currentRequestId.current) return
      currentRequestId.current = null
      setIsStreaming(false)
      onMotionChange('neutral')
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (!last || last.role !== 'assistant') return prev
        const modeHint = sessionModeRef.current !== settings.connectionMode
          ? '\n\n接続モードがセッション開始時から変更されています。チャットをクリアして新しいセッションを開始してください。'
          : '\n\n接続モードやAPIキー・モデル名の設定をご確認ください。'
        return [...prev.slice(0, -1), { ...last, contentClean: `⚠️ エラー: ${p.message}${modeHint}`, isStreaming: false }]
      })
    })

    return () => { unsubDelta(); unsubDone(); unsubError() }
  }, [sessionId, selectedModel, isDify, onMotionChange, triggerPostResponseMotion, resolveTone])

  const ensureSession = useCallback(async () => {
    if (sessionCreated) return
    const session: Session = {
      id: sessionId, title: makeSessionTitle(),
      started_at: new Date().toISOString(),
      distance: settings.distance, model: resolveModelName(),
    }
    await api.createSession(session)
    setSessionCreated(true)
    onSessionTitleChange(tabId, session.title)
    onSessionStart?.(tabId, sessionId, session.title)
  }, [sessionCreated, sessionId, settings.distance, selectedModel, isDify]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming) return
    await ensureSession()

    // v0.2.4: セッション開始時の接続モード・モデルリストを記録（以降固定）
    if (sessionModeRef.current === null) {
      sessionModeRef.current = settings.connectionMode
      sessionModelsRef.current = models
    }
    const currentMode = sessionModeRef.current

    if (motionTimerRef.current) { clearTimeout(motionTimerRef.current); motionTimerRef.current = null }

    const understandingRegex = understandingWordsEnabled
      ? buildUnderstandingRegex(settings.understandingWords ?? [])
      : /(?!)/

    if (understandingRegex.test(text)) {
      const userMsg: UIMessage = {
        id: genId(), role: 'user', content: text, contentClean: text,
        tone: 'neutral', isStreaming: false,
      }
      setMessages(prev => [...prev, userMsg])
      setInput('')
      await api.appendMessage({
        id: userMsg.id, session_id: sessionId, role: 'user',
        content: text, content_clean: text, tone: 'neutral',
        model: resolveModelName(), latency_ms: 0, ttft_ms: 0,
        tokens_in: 0, tokens_out: 0, safety_flags: '', error: '',
        created_at: new Date().toISOString(),
      } as Message)
      onMotionChange('praise')
      motionTimerRef.current = setTimeout(() => {
        onPraiseReaction?.()   // isPraiseRoute = true をセットしてからneutralに遷移
        onMotionChange('neutral')
      }, 2000)
      return
    }

    const userMsg: UIMessage = {
      id: genId(), role: 'user', content: text, contentClean: text,
      tone: 'neutral', isStreaming: false,
    }
    const asstId = genId()
    assistantMsgId.current = asstId

    setMessages(prev => [
      ...prev, userMsg,
      { id: asstId, role: 'assistant', content: '', contentClean: '', tone: 'neutral', isStreaming: true },
    ])
    setInput('')
    setIsStreaming(true)
    if (toneTagEnabled) onMotionChange('think')

    await api.appendMessage({
      id: userMsg.id, session_id: sessionId, role: 'user',
      content: text, content_clean: text, tone: 'neutral',
      model: resolveModelName(), latency_ms: 0, ttft_ms: 0,
      tokens_in: 0, tokens_out: 0, safety_flags: '', error: '',
      created_at: new Date().toISOString(),
    } as Message)

    const requestId = genId()
    currentRequestId.current = requestId
    accumulatedContent.current = ''

    if (currentMode === 'dify') {
      api.chatStart({ requestId, model: '', distance: settings.distance, messages: [], userQuery: text })
    } else {
      const systemPrompt = buildSystemPrompt(settings.distance, toneTagEnabled, distanceEnabled)
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      api.chatStart({
        requestId, model: selectedModel, distance: settings.distance,
        messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: text }],
      })
    }
  }, [input, isStreaming, ensureSession, messages, onMotionChange, onPraiseReaction,
      selectedModel, sessionId, settings.distance, settings.understandingWords,
      toneTagEnabled, understandingWordsEnabled, isDify]) // eslint-disable-line react-hooks/exhaustive-deps

  const abort = useCallback(() => {
    if (!currentRequestId.current) return
    api.chatAbort({ requestId: currentRequestId.current })
    currentRequestId.current = null
    setIsStreaming(false)
    onMotionChange('neutral')
    setMessages(prev => {
      const last = prev[prev.length - 1]
      if (!last || last.role !== 'assistant' || !last.isStreaming) return prev
      return [...prev.slice(0, -1), { ...last, isStreaming: false, contentClean: last.contentClean + ' [中断]' }]
    })
  }, [onMotionChange])

  const clearChat = useCallback(() => {
    if (isStreaming) return
    setMessages([])
    setSessionCreated(false)
    sessionModeRef.current   = null  // v0.2.4: セッションモードをリセット
    sessionModelsRef.current = []    // v0.2.4: セッションモデルリストをリセット
    onMotionChange('neutral')
    onSessionTitleChange(tabId, '新しいセッション')
    onClearChat?.()
  }, [isStreaming, onMotionChange, onSessionTitleChange, onClearChat, tabId])

  const handleRate = useCallback(async (
    msgId: string, rating: 'good' | 'bad', current: 'good' | 'bad' | null | undefined,
  ) => {
    const newRating = current === rating ? null : rating
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, rating: newRating } : m))
    await api.rateMessage(msgId, newRating)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  // ── v0.2.2: コレクション追加ハンドラ ────────────────────────────────────
  const openCollectionPopup = useCallback((userMsgId: string, assistantMsgId: string) => {
    api.listCollections().then(setCollections)
    setCollectionPopup({ userMsgId, assistantMsgId })
  }, [])

  const handleCollectionSelect = useCallback(async (collectionId: string) => {
    if (!collectionPopup || !sessionCreated) return
    setCollectionPopup(null)
    try {
      await api.addPair(collectionId, sessionId, collectionPopup.userMsgId, collectionPopup.assistantMsgId)
      const cols = await api.listCollections()
      setCollections(cols)
      const col = cols.find(c => c.id === collectionId)
      setAddToast(`📚 「${col?.name ?? ''}」に追加しました`)
      setTimeout(() => setAddToast(null), 2500)
    } catch {
      setAddToast('⚠️ 追加に失敗しました')
      setTimeout(() => setAddToast(null), 2500)
    }
  }, [collectionPopup, sessionId, sessionCreated])


  const showAvatarMsg = !isStreaming && !!avatarMessage

  // ── ユーザー→アシスタント のペアを特定するヘルパー ──────────────────────
  const findUserMsgId = (assistantIdx: number): string | undefined => {
    for (let i = assistantIdx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].id
    }
  }

  return (
    <div className={styles.chat}>
      <div className={styles.modelBar}>
        {/* v0.2.4: セッション接続モード（読み取り専用、モデルセレクタと同デザイン） */}
        {sessionCreated && (
          <span className={styles.modelSelect} style={{ cursor: 'default', opacity: 0.75 }}>
            {sessionMode === 'ollama' ? '🦙 Ollama'
              : sessionMode === 'openai' ? '🤖 OpenAI'
              : sessionMode === 'gemini' ? '✨ Gemini'
              : sessionMode === 'dify'   ? '⚡ Dify'
              : sessionMode}
          </span>
        )}
        {sessionMode !== 'dify' && (sessionCreated ? sessionModelsRef.current : models).length > 1 && (
          <select
            className={styles.modelSelect}
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            disabled={isStreaming}
          >
            {(sessionCreated ? sessionModelsRef.current : models).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        {sessionMode !== 'dify' && (sessionCreated ? sessionModelsRef.current : models).length === 1 && (
          <span className={styles.modelLabel}>{(sessionCreated ? sessionModelsRef.current : models)[0]}</span>
        )}
        {messages.length > 0 && !isStreaming && (
          <button className={styles.clearBtn} onClick={clearChat} title="チャットをクリア">
            🗑️ クリア
          </button>
        )}
      </div>

      {/* トースト */}
      {addToast && (
        <div className={styles.collectionToast}>{addToast}</div>
      )}

      <div className={styles.messages}>
        {messages.length === 0 && !avatarMessage && (
          <div className={styles.welcome}>
            <p>何でも話しかけてください 👋</p>
            <p className={styles.welcomeSub}>
              {isDify ? '⚡ Dify に接続中' : '学習のお悩み、一緒に考えましょう。'}
            </p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={msg.id} className={`${styles.message} ${styles[msg.role]}`}>
            <div className={`${styles.bubble} selectable`}>
              {msg.contentClean}
              {msg.isStreaming && <span className={styles.cursor} />}
            </div>
            {msg.role === 'assistant' && !msg.isStreaming && msg.contentClean && (
              <div className={styles.ratingRow}>
                <button
                  className={`${styles.rateBtn} ${msg.rating === 'good' ? styles.rated : ''}`}
                  onClick={() => handleRate(msg.id, 'good', msg.rating)}
                  title="Good"
                >👍</button>
                <button
                  className={`${styles.rateBtn} ${msg.rating === 'bad' ? styles.ratedBad : ''}`}
                  onClick={() => handleRate(msg.id, 'bad', msg.rating)}
                  title="Not Good"
                >👎</button>
                {/* v0.2.2: コレクション追加ボタン */}
                <div className={styles.collectionBtnWrap}>
                  <button
                    ref={el => {
                      if (el) collectionBtnRefs.current.set(msg.id, el)
                      else collectionBtnRefs.current.delete(msg.id)
                    }}
                    className={`${styles.rateBtn} ${styles.collectBtn}`}
                    onClick={() => {
                      const userMsgId = findUserMsgId(idx)
                      if (!userMsgId) return
                      if (collectionPopup?.assistantMsgId === msg.id) {
                        setCollectionPopup(null)
                      } else {
                        openCollectionPopup(userMsgId, msg.id)
                      }
                    }}
                    title="コレクションに追加"
                    disabled={!sessionCreated}
                  >🎛️</button>
                  {collectionPopup?.assistantMsgId === msg.id && (
                    <AddToCollectionPopup
                      collections={collections}
                      onSelect={handleCollectionSelect}
                      onClose={() => setCollectionPopup(null)}
                      anchorRef={{ current: collectionBtnRefs.current.get(msg.id) ?? null } as React.RefObject<HTMLElement>}
                    />
                  )}
                </div>
                {msg.ttft_ms && <span className={styles.meta}>TTFT: {msg.ttft_ms}ms</span>}
              </div>
            )}
          </div>
        ))}

        {showAvatarMsg && (
          <div className={`${styles.message} ${styles.assistant} ${styles.avatarMsg}`}>
            <div className={styles.avatarMsgBubble}>
              <span className={styles.avatarMsgIcon}>✨</span>
              {avatarMessage}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputArea}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="メッセージを入力… (Enter で送信 / Shift+Enter で改行)"
          disabled={isStreaming}
          rows={1}
        />
        {isStreaming ? (
          <button className={`${styles.send} ${styles.abort}`} onClick={abort}>■ 停止</button>
        ) : (
          <button className={styles.send} onClick={send} disabled={!input.trim()}>
            送信 ↵
          </button>
        )}
      </div>
    </div>
  )
}
