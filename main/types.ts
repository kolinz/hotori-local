export const IPC = {
  CHAT_START:  'chat:stream:start',
  CHAT_ABORT:  'chat:stream:abort',
  CHAT_DELTA:  'chat:stream:delta',
  CHAT_DONE:   'chat:stream:done',
  CHAT_ERROR:  'chat:stream:error',
  MODELS_LIST: 'models:list',
  LOGS_CREATE_SESSION: 'logs:createSession',
  LOGS_APPEND_MESSAGE: 'logs:appendMessage',
  LOGS_LIST_SESSIONS:  'logs:listSessions',
  LOGS_GET_SESSION:    'logs:getSession',
  LOGS_GET_SESSION_MESSAGES: 'logs:getSessionMessages',  // v0.2.1追加
  LOGS_EXPORT_CSV:     'logs:exportCsv',
  LOGS_DELETE_SESSION: 'logs:deleteSession',
  LOGS_CLEAR_ALL:      'logs:clearAll',
  LOGS_RATE_MESSAGE:   'logs:rateMessage',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  DIALOG_OPEN_FOLDER: 'dialog:openFolder',
  DIALOG_OPEN_FILE:   'dialog:openFile',
  DIALOG_SAVE_CSV:    'dialog:saveCsv',
  AVATAR_LOAD_MANIFEST: 'avatar:loadManifest',
  AVATAR_CHECK_STATIC:  'avatar:checkStatic',
  AVATAR_DEFAULT_PATH:  'avatar:defaultPath',
  AVATAR_READ_FILE:     'avatar:readFile',
} as const

export type IPCKey = keyof typeof IPC
export type Distance = 'friend' | 'tutor' | 'buddy' | 'calm' | 'cheerful'
export type MotionName = 'neutral' | 'think' | 'explain' | 'praise' | 'ask'
export type Rating = 'good' | 'bad' | null

/**
 * 接続モード
 * 'ollama': ローカルLLM（Ollama）
 * 'openai': OpenAI API / OpenAI互換API
 * 'dify':   Dify API（Chatbot・Agent、RAG対応）
 */
export type ConnectionMode = 'ollama' | 'openai' | 'dify'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatStartPayload {
  requestId: string
  model: string
  distance: Distance
  messages: ChatMessage[]
  /** Dify モード時のみ使用: ユーザーが入力したテキスト */
  userQuery?: string
}

export interface ChatAbortPayload {
  requestId: string
}

export interface ChatDeltaPayload {
  requestId: string
  delta: string
}

export interface ChatDonePayload {
  requestId: string
  ttft_ms: number
  tone: MotionName
}

export interface ChatErrorPayload {
  requestId: string
  message: string
}

export interface Session {
  id: string
  title: string
  model: string
  started_at: string
  ended_at?: string
  distance?: string
  tags?: string
  meta?: string
}

export interface Message {
  id: string
  session_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  content_clean?: string
  tone?: string
  model?: string
  latency_ms?: number
  ttft_ms?: number
  tokens_in?: number
  tokens_out?: number
  safety_flags: string
  error: string
  rating?: Rating
  created_at: string
}

export interface AppSettings {
  // ── 接続設定 ──
  connectionMode: ConnectionMode
  // Ollama
  ollamaUrl: string
  // OpenAI / OpenAI互換
  openaiApiKey: string
  openaiModels: string[]
  openaiBaseUrl: string
  // Dify
  difyUrl: string
  difyApiKey: string

  avatarPath: string
  backgroundImagePath: string
  theme: 'light' | 'dark' | 'auto'
  distance: Distance
  reducedMotion: boolean
  defaultModel: string
  streamTimeout: number

  // ── アバター動作 ──
  toneTagEnabled: boolean
  enabledMotions: MotionName[]

  // ── 理解・納得ワード ──
  understandingWordsEnabled: boolean
  understandingWords: string[]
}

export const ALL_MOTIONS: MotionName[] = ['neutral', 'think', 'explain', 'praise', 'ask']

export const DEFAULT_UNDERSTANDING_WORDS: string[] = [
  'なるほど', 'わかりました', '了解', '理解しました', 'そうか', 'なるほどね',
  'わかった', 'そっか', 'なるほど！', 'わかりました！', '理解できました',
]

export const OPENAI_PRESET_MODELS: string[] = [
  'gpt-5-nano-2025-08-07',
  'gpt-4.1-nano-2025-04-14',
  'gpt-4o',
  'gpt-4o-mini',
]

export const DEFAULT_SETTINGS: AppSettings = {
  connectionMode: 'ollama',
  ollamaUrl: 'http://localhost:11434',
  openaiApiKey: '',
  openaiModels: ['gpt-5-nano-2025-08-07', 'gpt-4.1-nano-2025-04-14'],
  openaiBaseUrl: 'https://api.openai.com',
  difyUrl: 'https://api.dify.ai/v1',
  difyApiKey: '',
  avatarPath: '',
  backgroundImagePath: '',
  theme: 'auto',
  distance: 'tutor',
  reducedMotion: false,
  defaultModel: 'gemma3:1b',
  streamTimeout: 60,
  toneTagEnabled: true,
  enabledMotions: [...ALL_MOTIONS],
  understandingWordsEnabled: true,
  understandingWords: [...DEFAULT_UNDERSTANDING_WORDS],
}

export interface PngMotionConfig {
  dir: string
  count: number
  fps: number
  loop: boolean
}

export interface MotionConfig {
  webm?: string
  png?: PngMotionConfig
}

export interface AvatarManifest {
  version: string
  motions: Record<MotionName, MotionConfig>
  defaults: {
    fallbackMotion: MotionName
    reducedMotionFps: number
  }
}
