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

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatStartPayload {
  requestId: string
  model: string
  distance: Distance
  messages: ChatMessage[]
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
}

export interface Message {
  id: string
  session_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  tone?: string
  ttft_ms?: number
  rating?: Rating
  safety_flags: string
  error: string
  created_at: string
}

export interface AppSettings {
  avatarPath: string
  backgroundImagePath: string
  ollamaUrl: string
  theme: 'light' | 'dark' | 'auto'
  distance: Distance
  reducedMotion: boolean
  defaultModel: string
  streamTimeout: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  avatarPath: '',
  backgroundImagePath: '',
  ollamaUrl: 'http://localhost:11434',
  theme: 'auto',
  distance: 'tutor',
  reducedMotion: false,
  defaultModel: 'qwen3:0.6b',
  streamTimeout: 60,
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
