import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC, ChatStartPayload, ChatAbortPayload, ChatDeltaPayload, ChatDonePayload,
  Session, Message, AppSettings, MixingCollection, MixingPair,
} from './types'

contextBridge.exposeInMainWorld('electronAPI', {
  chatStart: (payload: ChatStartPayload) => ipcRenderer.send(IPC.CHAT_START, payload),
  chatAbort: (payload: ChatAbortPayload) => ipcRenderer.send(IPC.CHAT_ABORT, payload),

  onChatDelta: (cb: (p: ChatDeltaPayload) => void) => {
    const h = (_: import('electron').IpcRendererEvent, p: ChatDeltaPayload) => cb(p)
    ipcRenderer.on(IPC.CHAT_DELTA, h)
    return () => ipcRenderer.removeListener(IPC.CHAT_DELTA, h)
  },
  onChatDone: (cb: (p: ChatDonePayload) => void) => {
    const h = (_: import('electron').IpcRendererEvent, p: ChatDonePayload) => cb(p)
    ipcRenderer.on(IPC.CHAT_DONE, h)
    return () => ipcRenderer.removeListener(IPC.CHAT_DONE, h)
  },
  onChatError: (cb: (p: { requestId: string; message: string }) => void) => {
    const h = (_: import('electron').IpcRendererEvent, p: { requestId: string; message: string }) => cb(p)
    ipcRenderer.on(IPC.CHAT_ERROR, h)
    return () => ipcRenderer.removeListener(IPC.CHAT_ERROR, h)
  },

  listModels: (): Promise<string[]> => ipcRenderer.invoke(IPC.MODELS_LIST),

  createSession:      (s: Session): Promise<void>                => ipcRenderer.invoke(IPC.LOGS_CREATE_SESSION, s),
  appendMessage:      (m: Message): Promise<void>                => ipcRenderer.invoke(IPC.LOGS_APPEND_MESSAGE, m),
  listSessions:       (): Promise<Session[]>                     => ipcRenderer.invoke(IPC.LOGS_LIST_SESSIONS),
  getSession:         (id: string): Promise<Session | undefined> => ipcRenderer.invoke(IPC.LOGS_GET_SESSION, id),
  getSessionMessages: (sessionId: string): Promise<Message[]>    => ipcRenderer.invoke(IPC.LOGS_GET_SESSION_MESSAGES, sessionId),
  exportCsv: (sessionId: string, defaultName: string): Promise<{ ok: boolean; filePath?: string; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.LOGS_EXPORT_CSV, sessionId, defaultName),
  deleteSession:    (id: string): Promise<void> => ipcRenderer.invoke(IPC.LOGS_DELETE_SESSION, id),
  clearAllSessions: (): Promise<void>           => ipcRenderer.invoke(IPC.LOGS_CLEAR_ALL),
  rateMessage: (messageId: string, rating: string | null): Promise<void> =>
    ipcRenderer.invoke(IPC.LOGS_RATE_MESSAGE, messageId, rating),

  getSettings: (): Promise<AppSettings>        => ipcRenderer.invoke(IPC.SETTINGS_GET),
  setSettings: (s: AppSettings): Promise<void> => ipcRenderer.invoke(IPC.SETTINGS_SET, s),

  loadAvatarManifest:   (p: string)                     => ipcRenderer.invoke(IPC.AVATAR_LOAD_MANIFEST, p),
  checkAvatarStatic:    (p: string): Promise<boolean>   => ipcRenderer.invoke(IPC.AVATAR_CHECK_STATIC, p),
  readAvatarFile:       (p: string): Promise<string | null> => ipcRenderer.invoke(IPC.AVATAR_READ_FILE, p),
  getAvatarDefaultPath: (): Promise<string | null>      => ipcRenderer.invoke(IPC.AVATAR_DEFAULT_PATH),

  openFolderDialog: (): Promise<string | null>               => ipcRenderer.invoke(IPC.DIALOG_OPEN_FOLDER),
  openFileDialog:   (ext: string[]): Promise<string | null>  => ipcRenderer.invoke(IPC.DIALOG_OPEN_FILE, ext),

  // v0.2.2: 学習コレクション
  listCollections:  (): Promise<MixingCollection[]>                       => ipcRenderer.invoke(IPC.COLLECTION_LIST),
  createCollection: (name: string): Promise<MixingCollection>             => ipcRenderer.invoke(IPC.COLLECTION_CREATE, name),
  renameCollection: (id: string, name: string): Promise<void>             => ipcRenderer.invoke(IPC.COLLECTION_RENAME, id, name),
  deleteCollection: (id: string): Promise<void>                           => ipcRenderer.invoke(IPC.COLLECTION_DELETE, id),
  listPairs:        (collectionId: string): Promise<MixingPair[]>         => ipcRenderer.invoke(IPC.COLLECTION_LIST_PAIRS, collectionId),
  addPair: (collectionId: string, sessionId: string, userMsgId: string, assistantMsgId: string): Promise<MixingPair> =>
    ipcRenderer.invoke(IPC.COLLECTION_ADD_PAIR, collectionId, sessionId, userMsgId, assistantMsgId),
  removePair:   (pairId: string): Promise<void>                           => ipcRenderer.invoke(IPC.COLLECTION_REMOVE_PAIR, pairId),
  reorderPairs: (collectionId: string, orderedIds: string[]): Promise<void> => ipcRenderer.invoke(IPC.COLLECTION_REORDER, collectionId, orderedIds),
  reviewPair:   (pairId: string, needsReview: boolean): Promise<void>     => ipcRenderer.invoke(IPC.COLLECTION_REVIEW_PAIR, pairId, needsReview),  // v0.2.4追加
  exportCollectionCsv: (collectionId: string, collectionName: string): Promise<{ ok: boolean; filePath?: string; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.COLLECTION_EXPORT_CSV, collectionId, collectionName),
})
