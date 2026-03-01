import { useState, useEffect, useRef, useCallback } from 'react'
import { api, AppSettings, Session, Message } from '../utils/electronAPI'
import type { ChatDeltaPayload, ChatDonePayload } from '../utils/electronAPI'
import { parseToneTagged, MotionName } from '../utils/parseTone'
import { buildSystemPrompt } from '../utils/systemPrompt'
import styles from './Chat.module.css'

interface Props {
  tabId: string
  settings: AppSettings
  models: string[]
  onMotionChange: (motion: MotionName) => void
  onSessionTitleChange: (tabId: string, title: string) => void
  onClearChat?: () => void
  onPraiseReaction?: () => void           // 理解・納得ワード検知時のコールバック
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

// 理解・納得ワード検知用の正規表現を動的生成
function buildUnderstandingRegex(words: string[]): RegExp {
  if (words.length === 0) return /(?!)/  // マッチしない正規表現
  const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^(${escaped.join('|')})[。、！!…\\s]*$`, 'i')
}

export function Chat({ tabId, settings, models, onMotionChange, onSessionTitleChange, onClearChat, onPraiseReaction, avatarMessage }: Props) {
  const [messages, setMessages]           = useState<UIMessage[]>([])
  const [input, setInput]                 = useState('')
  const [isStreaming, setIsStreaming]     = useState(false)
  const [selectedModel, setSelectedModel] = useState(settings.defaultModel)
  const [sessionId]                       = useState(genId)
  const [sessionCreated, setSessionCreated] = useState(false)

  const currentRequestId   = useRef<string | null>(null)
  const accumulatedContent = useRef<string>('')
  const assistantMsgId     = useRef<string>('')
  const motionTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesEndRef     = useRef<HTMLDivElement>(null)
  const textareaRef        = useRef<HTMLTextAreaElement>(null)

  const triggerPostResponseMotion = useCallback((tone: MotionName) => {
    onMotionChange(tone)
    if (motionTimerRef.current) clearTimeout(motionTimerRef.current)
    motionTimerRef.current = setTimeout(() => onMotionChange('neutral'), 3000)
  }, [onMotionChange])

  useEffect(() => () => { if (motionTimerRef.current) clearTimeout(motionTimerRef.current) }, [])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, avatarMessage])

  // IPC listeners
  useEffect(() => {
    const unsubDelta = api.onChatDelta((p: ChatDeltaPayload) => {
      if (p.requestId !== currentRequestId.current) return
      accumulatedContent.current += p.delta
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (!last || last.role !== 'assistant') return prev
        const newContent = last.content + p.delta
        const { clean } = parseToneTagged(newContent)
        return [...prev.slice(0, -1), { ...last, content: newContent, contentClean: clean }]
      })
    })

    const unsubDone = api.onChatDone(async (p: ChatDonePayload) => {
      if (p.requestId !== currentRequestId.current) return
      currentRequestId.current = null

      const fullContent = accumulatedContent.current
      accumulatedContent.current = ''
      const { tone, clean } = parseToneTagged(fullContent)

      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (!last || last.role !== 'assistant') return prev
        return [...prev.slice(0, -1), { ...last, content: fullContent, contentClean: clean, tone, isStreaming: false, ttft_ms: p.ttft_ms }]
      })

      setIsStreaming(false)
      triggerPostResponseMotion(tone)

      await api.appendMessage({
        id: assistantMsgId.current,
        session_id: sessionId, role: 'assistant',
        content: fullContent, content_clean: clean,
        tone, model: selectedModel,
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
        return [...prev.slice(0, -1), { ...last, contentClean: `⚠️ エラー: ${p.message}`, isStreaming: false }]
      })
    })

    return () => { unsubDelta(); unsubDone(); unsubError() }
  }, [sessionId, selectedModel, onMotionChange, triggerPostResponseMotion])

  const ensureSession = useCallback(async () => {
    if (sessionCreated) return
    const session: Session = {
      id: sessionId,
      title: makeSessionTitle(),
      started_at: new Date().toISOString(),
      distance: settings.distance,
      model: selectedModel,
    }
    await api.createSession(session)
    setSessionCreated(true)
    onSessionTitleChange(tabId, session.title)
  }, [sessionCreated, sessionId, settings.distance, selectedModel])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || isStreaming) return
    await ensureSession()

    if (motionTimerRef.current) { clearTimeout(motionTimerRef.current); motionTimerRef.current = null }

    // 理解・納得ワード検知: LLMに送らずpraiseモーションで返す
    const understandingRegex = buildUnderstandingRegex(settings.understandingWords ?? [])
    if (understandingRegex.test(text)) {
      const userMsg: UIMessage = { id: genId(), role: 'user', content: text, contentClean: text, tone: 'neutral', isStreaming: false }
      setMessages(prev => [...prev, userMsg])
      setInput('')
      await api.appendMessage({
        id: userMsg.id, session_id: sessionId, role: 'user',
        content: text, content_clean: text, tone: 'neutral',
        model: selectedModel, latency_ms: 0, ttft_ms: 0,
        tokens_in: 0, tokens_out: 0, safety_flags: '', error: '',
        created_at: new Date().toISOString(),
      } as Message)
      onMotionChange('praise')
      motionTimerRef.current = setTimeout(() => {
        onMotionChange('neutral')
        onPraiseReaction?.()
      }, 2000)
      return
    }

    const userMsg: UIMessage = { id: genId(), role: 'user', content: text, contentClean: text, tone: 'neutral', isStreaming: false }
    const asstId = genId()
    assistantMsgId.current = asstId

    setMessages(prev => [
      ...prev, userMsg,
      { id: asstId, role: 'assistant', content: '', contentClean: '', tone: 'neutral', isStreaming: true },
    ])
    setInput('')
    setIsStreaming(true)
    onMotionChange('think')

    await api.appendMessage({
      id: userMsg.id, session_id: sessionId, role: 'user',
      content: text, content_clean: text, tone: 'neutral',
      model: selectedModel, latency_ms: 0, ttft_ms: 0,
      tokens_in: 0, tokens_out: 0, safety_flags: '', error: '',
      created_at: new Date().toISOString(),
    } as Message)

    const systemPrompt = buildSystemPrompt(settings.distance)
    const history = messages.map(m => ({ role: m.role, content: m.content }))
    const requestId = genId()
    currentRequestId.current = requestId
    accumulatedContent.current = ''

    api.chatStart({
      requestId, model: selectedModel, distance: settings.distance,
      messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: text }],
    })
  }, [input, isStreaming, ensureSession, messages, onMotionChange, onPraiseReaction, selectedModel, sessionId, settings.distance])

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
    onMotionChange('neutral')
    onSessionTitleChange(tabId, '新しいセッション')
    onClearChat?.()
  }, [isStreaming, onMotionChange, onSessionTitleChange, onClearChat, tabId])

  const handleRate = useCallback(async (msgId: string, rating: 'good' | 'bad', current: 'good' | 'bad' | null | undefined) => {
    const newRating = current === rating ? null : rating
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, rating: newRating } : m))
    await api.rateMessage(msgId, newRating)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  // アバターメッセージを表示すべきか
  // ストリーミング中は非表示。ユーザーメッセージ直後でも
  // avatarMessage がセットされていれば表示（なるほど検知後など）
  const showAvatarMsg = !!avatarMessage && !isStreaming

  return (
    <div className={styles.chat}>
      <div className={styles.modelBar}>
        {models.length > 1 && (
          <select className={styles.modelSelect} value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)} disabled={isStreaming}>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        {messages.length > 0 && !isStreaming && (
          <button className={styles.clearBtn} onClick={clearChat} title="チャットをクリア">
            🗑️ クリア
          </button>
        )}
      </div>

      <div className={styles.messages}>
        {messages.length === 0 && !avatarMessage && (
          <div className={styles.welcome}>
            <p>何でも話しかけてください 👋</p>
            <p className={styles.welcomeSub}>学習のお悩み、一緒に考えましょう。</p>
          </div>
        )}
        {messages.map(msg => (
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
                {msg.ttft_ms && <span className={styles.meta}>TTFT: {msg.ttft_ms}ms</span>}
              </div>
            )}
          </div>
        ))}

        {/* アバターからの話しかけメッセージ（UI演出専用・DB保存なし） */}
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
          <button className={`${styles.sendBtn} ${styles.abortBtn}`} onClick={abort}>■ 停止</button>
        ) : (
          <button className={styles.sendBtn} onClick={send} disabled={!input.trim()}>
            送信 ↵
          </button>
        )}
      </div>
    </div>
  )
}
