import type { AppSettings, Session, Message } from '../../../../main/types'
export type { AppSettings, Session, Message }

export interface ChatDeltaPayload { requestId: string; delta: string }
export interface ChatDonePayload  { requestId: string; ttft_ms: number }

export interface ElectronAPI {
  chatStart:  (payload: import('../../../../main/types').ChatStartPayload) => void
  chatAbort:  (payload: import('../../../../main/types').ChatAbortPayload) => void
  onChatDelta: (cb: (p: ChatDeltaPayload) => void) => () => void
  onChatDone:  (cb: (p: ChatDonePayload)  => void) => () => void
  onChatError: (cb: (p: { requestId: string; message: string }) => void) => () => void
  listModels:  () => Promise<string[]>
  createSession:      (s: Session) => Promise<void>
  appendMessage:      (m: Message) => Promise<void>
  listSessions:       () => Promise<Session[]>
  getSession:         (id: string) => Promise<Session | undefined>
  // v0.2.1: セッションのメッセージ一覧取得
  getSessionMessages: (sessionId: string) => Promise<Message[]>
  exportCsv:          (sessionId: string, defaultName: string) => Promise<{ ok: boolean; filePath?: string; canceled?: boolean; error?: string }>
  deleteSession:      (id: string) => Promise<void>
  clearAllSessions:   () => Promise<void>
  rateMessage:        (messageId: string, rating: string | null) => Promise<void>
  getSettings:        () => Promise<AppSettings>
  setSettings:        (s: AppSettings) => Promise<void>
  loadAvatarManifest: (p: string) => Promise<unknown>
  checkAvatarStatic:  (p: string) => Promise<boolean>
  readAvatarFile:     (p: string) => Promise<string | null>
  getAvatarDefaultPath: () => Promise<string | null>
  openFolderDialog:   () => Promise<string | null>
  openFileDialog:     (ext: string[]) => Promise<string | null>
}

declare global {
  interface Window { electronAPI: ElectronAPI }
}

const fallback: ElectronAPI = {
  chatStart:   () => {},
  chatAbort:   () => {},
  onChatDelta: () => () => {},
  onChatDone:  () => () => {},
  onChatError: () => () => {},
  listModels:         async () => [],
  createSession:      async () => {},
  appendMessage:      async () => {},
  listSessions:       async () => [],
  getSession:         async () => undefined,
  getSessionMessages: async () => [],
  exportCsv:          async () => ({ ok: false }),
  deleteSession:      async () => {},
  clearAllSessions:   async () => {},
  rateMessage:        async () => {},
  getSettings: async () => ({
    connectionMode: 'ollama',
    ollamaUrl: 'http://localhost:11434',
    openaiApiKey: '', openaiModels: [], openaiBaseUrl: 'https://api.openai.com',
    difyUrl: 'https://api.dify.ai/v1', difyApiKey: '',
    avatarPath: '', backgroundImagePath: '',
    theme: 'auto', distance: 'tutor', reducedMotion: false,
    defaultModel: 'gemma3:1b', streamTimeout: 60,
    toneTagEnabled: true, enabledMotions: ['neutral', 'think', 'explain', 'praise', 'ask'],
    understandingWordsEnabled: true, understandingWords: [],
  }),
  setSettings:         async () => {},
  loadAvatarManifest:  async () => null,
  checkAvatarStatic:   async () => false,
  readAvatarFile:      async () => null,
  getAvatarDefaultPath: async () => null,
  openFolderDialog:    async () => null,
  openFileDialog:      async () => null,
}

export const api: ElectronAPI =
  typeof window !== 'undefined' && window.electronAPI ? window.electronAPI : fallback
