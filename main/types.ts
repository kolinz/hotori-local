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
  LOGS_GET_SESSION_MESSAGES: 'logs:getSessionMessages',
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
  // v0.2.2追加: 学習コレクション
  COLLECTION_LIST:        'collection:list',
  COLLECTION_CREATE:      'collection:create',
  COLLECTION_RENAME:      'collection:rename',
  COLLECTION_DELETE:      'collection:delete',
  COLLECTION_LIST_PAIRS:  'collection:listPairs',
  COLLECTION_ADD_PAIR:    'collection:addPair',
  COLLECTION_REMOVE_PAIR: 'collection:removePair',
  COLLECTION_REORDER:     'collection:reorder',
  COLLECTION_EXPORT_CSV:  'collection:exportCsv',
  COLLECTION_REVIEW_PAIR: 'collection:reviewPair',  // v0.2.4追加
} as const

export type IPCKey = keyof typeof IPC
export type Distance = 'friend' | 'tutor' | 'buddy' | 'calm' | 'cheerful'
export type MotionName = 'neutral' | 'think' | 'explain' | 'praise' | 'ask'
export type Rating = 'good' | 'bad' | null
export type ConnectionMode = 'ollama' | 'openai' | 'dify' | 'gemini'

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface ChatStartPayload {
  requestId: string; model: string; distance: Distance
  messages: ChatMessage[]; userQuery?: string
}

export interface ChatAbortPayload { requestId: string }
export interface ChatDeltaPayload { requestId: string; delta: string }
export interface ChatDonePayload  { requestId: string; ttft_ms: number; tone: MotionName }
export interface ChatErrorPayload { requestId: string; message: string }

export interface Session {
  id: string; title: string; model: string; started_at: string
  ended_at?: string; distance?: string; tags?: string; meta?: string
}

export interface Message {
  id: string; session_id: string; role: 'user' | 'assistant' | 'system'
  content: string; content_clean?: string; tone?: string; model?: string
  latency_ms?: number; ttft_ms?: number; tokens_in?: number; tokens_out?: number
  safety_flags: string; error: string; rating?: Rating; created_at: string
}

// v0.2.2追加: 学習コレクション型
export interface MixingCollection {
  id: string
  name: string
  created_at: string
}

export interface MixingPair {
  id: string
  collection_id: string
  session_id: string
  user_message_id: string
  assistant_message_id: string
  sort_order: number
  added_at: string
  needs_review: number  // v0.2.4追加: 1=要確認（デフォルト）/ 0=確認済み
  // JOINで取得する表示フィールド
  session_title?: string
  session_date?: string
  model?: string
  rating?: string | null
  user_content?: string
  assistant_content?: string
}

export interface AppSettings {
  connectionMode: ConnectionMode
  ollamaUrl: string
  openaiApiKey: string; openaiModels: string[]; openaiBaseUrl: string
  difyUrl: string; difyApiKey: string
  geminiApiKey: string; geminiModels: string[]; geminiBaseUrl: string  // v0.2.3追加
  avatarPath: string; backgroundImagePath: string
  theme: 'light' | 'dark' | 'auto'
  distance: Distance; reducedMotion: boolean
  distanceEnabled: boolean  // v0.2.4追加: 距離感機能の有効化（デフォルトオフ）
  defaultModel: string; streamTimeout: number
  toneTagEnabled: boolean; enabledMotions: MotionName[]
  understandingWordsEnabled: boolean; understandingWords: string[]
  maxCollections: number  // v0.2.2追加
}

export const ALL_MOTIONS: MotionName[] = ['neutral', 'think', 'explain', 'praise', 'ask']

export const DEFAULT_UNDERSTANDING_WORDS: string[] = [
  'なるほど', 'わかりました', '了解', '理解しました', 'そうか', 'なるほどね',
  'わかった', 'そっか', 'なるほど！', 'わかりました！', '理解できました',
]

export const OPENAI_PRESET_MODELS: string[] = [
  'gpt-5-nano-2025-08-07', 'gpt-4.1-nano-2025-04-14', 'gpt-4o', 'gpt-4o-mini',
]

export const GEMINI_PRESET_MODELS: string[] = [   // v0.2.3追加
  'gemini-2.5-flash', 'gemini-2.5-flash-lite',
]

export const DEFAULT_SETTINGS: AppSettings = {
  connectionMode: 'ollama',
  defaultModel: 'gemma3:1b',
  ollamaUrl: 'http://localhost:11434',
  openaiApiKey: '',
  openaiModels: ['gpt-5-nano-2025-08-07', 'gpt-4.1-nano-2025-04-14'],
  openaiBaseUrl: 'https://api.openai.com',
  difyUrl: 'https://api.dify.ai/v1', difyApiKey: '',
  geminiApiKey: '',
  geminiModels: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  geminiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/',
  avatarPath: '', 
  backgroundImagePath: '',
  theme: 'auto',
  distance: 'tutor',
  distanceEnabled: false,  // v0.2.4追加
  reducedMotion: false,
  streamTimeout: 60,
  toneTagEnabled: false,
  enabledMotions: [...ALL_MOTIONS],
  understandingWordsEnabled: true,
  understandingWords: [...DEFAULT_UNDERSTANDING_WORDS],
  maxCollections: 10,
}
