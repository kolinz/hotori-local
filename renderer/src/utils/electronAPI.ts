import type { AppSettings, Session, Message } from '../../../../main/types'
export type { AppSettings, Session, Message }

export interface ElectronAPI {
  chatStart: (payload: import('../../../../main/types').ChatStartPayload) => void
  chatAbort: (payload: import('../../../../main/types').ChatAbortPayload) => void
  onChatDelta: (cb: (p: import('../../../../main/types').ChatDeltaPayload) => void) => () => void
  onChatDone: (cb: (p: import('../../../../main/types').ChatDonePayload) => void) => () => void
  onChatError: (cb: (p: { requestId: string; message: string }) => void) => () => void
  listModels: () => Promise<string[]>
  createSession: (s: Session) => Promise<void>
  appendMessage: (m: Message) => Promise<void>
  listSessions: () => Promise<Session[]>
  getSession: (id: string) => Promise<Session | undefined>
  exportCsv: (sessionId: string, defaultName: string) => Promise<{ ok: boolean; filePath?: string; canceled?: boolean; error?: string }>
  deleteSession: (id: string) => Promise<void>
  clearAllSessions: () => Promise<void>
  rateMessage: (messageId: string, rating: string | null) => Promise<void>
  getSettings: () => Promise<AppSettings>
  setSettings: (s: AppSettings) => Promise<void>
  loadAvatarManifest: (p: string) => Promise<unknown>
  checkAvatarStatic: (p: string) => Promise<boolean>
  readAvatarFile: (p: string) => Promise<string | null>
  getAvatarDefaultPath: () => Promise<string | null>
  openFolderDialog: () => Promise<string | null>
  openFileDialog: (ext: string[]) => Promise<string | null>
}

declare global {
  interface Window { electronAPI: ElectronAPI }
}

const fallback: ElectronAPI = {
  chatStart: () => {},
  chatAbort: () => {},
  onChatDelta: () => () => {},
  onChatDone: () => () => {},
  onChatError: () => () => {},
  listModels: async () => [],
  createSession: async () => {},
  appendMessage: async () => {},
  listSessions: async () => [],
  getSession: async () => undefined,
  exportCsv: async () => ({ ok: false }),
  deleteSession: async () => {},
  clearAllSessions: async () => {},
  rateMessage: async () => {},
  getSettings: async () => ({
    avatarPath: '', backgroundImagePath: '', ollamaUrl: 'http://localhost:11434',
    theme: 'auto', distance: 'tutor', reducedMotion: false,
    defaultModel: 'qwen3:0.6b', streamTimeout: 60,
    understandingWords: ['なるほど', 'わかりました', '了解', '理解しました', 'わかった', 'ok', 'okay', 'そうか', 'なるほどね', 'そうですか', 'そうなんですね'],
  }),
  setSettings: async () => {},
  loadAvatarManifest: async () => null,
  checkAvatarStatic: async () => false,
  readAvatarFile: async () => null,
  getAvatarDefaultPath: async () => null,
  openFolderDialog: async () => null,
  openFileDialog: async () => null,
}

export const api: ElectronAPI =
  typeof window !== 'undefined' && window.electronAPI ? window.electronAPI : fallback
