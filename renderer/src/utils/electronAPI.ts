import type { AppSettings, Session, Message, MixingCollection, MixingPair } from '../../../../main/types'
export type { AppSettings, Session, Message, MixingCollection, MixingPair }

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

  // v0.2.2: 学習コレクション
  listCollections:     () => Promise<MixingCollection[]>
  createCollection:    (name: string) => Promise<MixingCollection>
  renameCollection:    (id: string, name: string) => Promise<void>
  deleteCollection:    (id: string) => Promise<void>
  listPairs:           (collectionId: string) => Promise<MixingPair[]>
  addPair:             (collectionId: string, sessionId: string, userMsgId: string, assistantMsgId: string) => Promise<MixingPair>
  removePair:          (pairId: string) => Promise<void>
  reorderPairs:        (collectionId: string, orderedIds: string[]) => Promise<void>
  exportCollectionCsv: (collectionId: string, collectionName: string) => Promise<{ ok: boolean; filePath?: string; canceled?: boolean; error?: string }>
}

declare global { interface Window { electronAPI: ElectronAPI } }

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
    geminiApiKey: '', geminiModels: [], geminiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/',  // v0.2.3追加
    avatarPath: '', backgroundImagePath: '',
    theme: 'auto', distance: 'tutor', reducedMotion: false,
    defaultModel: 'gemma3:1b', streamTimeout: 60,
    toneTagEnabled: true, enabledMotions: ['neutral', 'think', 'explain', 'praise', 'ask'],
    understandingWordsEnabled: true, understandingWords: [],
    maxCollections: 10,
  }),
  setSettings:          async () => {},
  loadAvatarManifest:   async () => null,
  checkAvatarStatic:    async () => false,
  readAvatarFile:       async () => null,
  getAvatarDefaultPath: async () => null,
  openFolderDialog:     async () => null,
  openFileDialog:       async () => null,
  // collection fallbacks
  listCollections:     async () => [],
  createCollection:    async (name) => ({ id: '', name, created_at: '' }),
  renameCollection:    async () => {},
  deleteCollection:    async () => {},
  listPairs:           async () => [],
  addPair:             async (_c, _s, _u, _a) => ({ id: '', collection_id: _c, session_id: _s, user_message_id: _u, assistant_message_id: _a, sort_order: 0, added_at: '' }),
  removePair:          async () => {},
  reorderPairs:        async () => {},
  exportCollectionCsv: async () => ({ ok: false }),
}

export const api: ElectronAPI =
  typeof window !== 'undefined' && window.electronAPI ? window.electronAPI : fallback
