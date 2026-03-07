import { app, BrowserWindow, ipcMain, dialog, nativeTheme } from 'electron'
import path from 'path'
import fs from 'fs'
import { IPC, ChatStartPayload, ChatAbortPayload, Session, Message, AppSettings } from './types'
import { streamChat, listModels } from './ollama'
import { streamChatOpenAI } from './openai'
import { streamDifyChat } from './dify'
import {
  initStore, createSession, appendMessage, listSessions, getSession,
  getSessionMessages, exportSessionCsv, deleteSession, clearAllSessions, rateMessage,
  // v0.2.2追加
  listCollections, createCollection, renameCollection, deleteCollection,
  listPairs, addPair, removePair, reorderPairs, exportCollectionCsv,
} from './store'
import { loadSettings, saveSettings } from './settings'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const VITE_URL = 'http://localhost:5173'
const activeStreams = new Map<string, AbortController>()
let mainWindow: BrowserWindow | null = null

function createWindow() {
  const settings = loadSettings()
  if (settings.theme !== 'auto') nativeTheme.themeSource = settings.theme

  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 800, minHeight: 600,
    frame: true, backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: false, nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL(VITE_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(async () => {
  try { await initStore() } catch (err) { console.error('[main] initStore failed:', err) }

  try {
    const settings = loadSettings()
    const defaultAvatarPath = app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'avatar', 'default-static')
      : path.join(app.getAppPath(), 'assets', 'avatar', 'default-static')
    if (!settings.avatarPath && fs.existsSync(defaultAvatarPath)) {
      saveSettings({ ...settings, avatarPath: defaultAvatarPath })
    }
  } catch {}

  createWindow()
  app.on('activate', () => { if (mainWindow === null) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ─── IPC: Chat ────────────────────────────────────────────────────────────────
ipcMain.on(IPC.CHAT_START, async (event, payload: ChatStartPayload) => {
  const { requestId, model, messages, userQuery } = payload
  const settings = loadSettings()
  const controller = new AbortController()
  activeStreams.set(requestId, controller)

  let firstChunk = true
  let ttft_ms = 0
  const startTime = Date.now()

  const callbacks = {
    onDelta: (delta: string) => {
      if (firstChunk) { ttft_ms = Date.now() - startTime; firstChunk = false }
      event.sender.send(IPC.CHAT_DELTA, { requestId, delta })
    },
    onDone: (tone?: string) => {
      activeStreams.delete(requestId)
      event.sender.send(IPC.CHAT_DONE, { requestId, ttft_ms, tone: tone ?? 'neutral' })
    },
    onError: (err: string) => {
      activeStreams.delete(requestId)
      event.sender.send(IPC.CHAT_ERROR, { requestId, message: err })
    },
  }

  if (settings.connectionMode === 'openai') {
    const baseUrl = settings.openaiBaseUrl || 'https://api.openai.com'
    const apiKey  = settings.openaiApiKey || ''
    await streamChatOpenAI(baseUrl, apiKey, model, messages, callbacks, controller.signal, settings.streamTimeout * 1000)
  } else if (settings.connectionMode === 'dify') {
    const difyUrl = settings.difyUrl || 'https://api.dify.ai/v1'
    const apiKey  = settings.difyApiKey || ''
    const query   = userQuery ?? messages.filter(m => m.role === 'user').at(-1)?.content ?? ''
    await streamDifyChat(difyUrl, apiKey, query, callbacks, controller.signal, settings.streamTimeout * 1000)
  } else {
    const ollamaUrl = settings.ollamaUrl || 'http://localhost:11434'
    await streamChat(ollamaUrl, model, messages, callbacks, controller.signal, settings.streamTimeout * 1000)
  }
})

ipcMain.on(IPC.CHAT_ABORT, (_e, payload: ChatAbortPayload) => {
  const c = activeStreams.get(payload.requestId)
  if (c) { c.abort(); activeStreams.delete(payload.requestId) }
})

// ─── IPC: Models ──────────────────────────────────────────────────────────────
ipcMain.handle(IPC.MODELS_LIST, async () => {
  const settings = loadSettings()
  if (settings.connectionMode === 'openai') return settings.openaiModels ?? []
  if (settings.connectionMode === 'dify')   return []
  return listModels(settings.ollamaUrl || 'http://localhost:11434')
})

// ─── IPC: Logs ────────────────────────────────────────────────────────────────
ipcMain.handle(IPC.LOGS_CREATE_SESSION, (_e, session: Session) => { createSession(session) })
ipcMain.handle(IPC.LOGS_APPEND_MESSAGE, (_e, msg: Message) => { appendMessage(msg) })
ipcMain.handle(IPC.LOGS_LIST_SESSIONS, () => listSessions())
ipcMain.handle(IPC.LOGS_GET_SESSION, (_e, id: string) => getSession(id))
ipcMain.handle(IPC.LOGS_GET_SESSION_MESSAGES, (_e, sessionId: string) => getSessionMessages(sessionId))

ipcMain.handle(IPC.LOGS_EXPORT_CSV, async (_e, sessionId: string, defaultName: string) => {
  if (!mainWindow) return { ok: false, error: 'no window' }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'CSVとして保存', defaultPath: defaultName,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  })
  if (result.canceled || !result.filePath) return { ok: false, canceled: true }
  try { exportSessionCsv(sessionId, result.filePath); return { ok: true, filePath: result.filePath } }
  catch (e) { return { ok: false, error: String(e) } }
})

ipcMain.handle(IPC.LOGS_DELETE_SESSION, (_e, id: string) => { deleteSession(id) })
ipcMain.handle(IPC.LOGS_CLEAR_ALL, () => { clearAllSessions() })
ipcMain.handle(IPC.LOGS_RATE_MESSAGE, (_e, messageId: string, rating: string | null) => {
  rateMessage(messageId, rating)
})

// ─── IPC: Settings ────────────────────────────────────────────────────────────
ipcMain.handle(IPC.SETTINGS_GET, () => loadSettings())
ipcMain.handle(IPC.SETTINGS_SET, (_e, settings: AppSettings) => {
  saveSettings(settings)
  nativeTheme.themeSource = settings.theme !== 'auto' ? settings.theme : 'system'
})

// ─── IPC: Avatar ──────────────────────────────────────────────────────────────
ipcMain.handle(IPC.AVATAR_DEFAULT_PATH, () => {
  const p = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'avatar', 'default-static')
    : path.join(app.getAppPath(), 'assets', 'avatar', 'default-static')
  return fs.existsSync(p) ? p : null
})
ipcMain.handle(IPC.AVATAR_READ_FILE, (_e, filePath: string) => {
  try {
    const data = fs.readFileSync(filePath)
    return `data:image/png;base64,${data.toString('base64')}`
  } catch (e) { console.warn('[main] avatar:readFile failed:', filePath, e); return null }
})
ipcMain.handle(IPC.AVATAR_CHECK_STATIC, (_e, avatarPath: string) => {
  try { return fs.existsSync(path.join(avatarPath, 'neutral.png')) } catch { return false }
})
ipcMain.handle(IPC.AVATAR_LOAD_MANIFEST, (_e, avatarPath: string) => {
  try {
    const p = path.join(avatarPath, 'manifest.json')
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null
  } catch { return null }
})

// ─── IPC: Dialog ──────────────────────────────────────────────────────────────
ipcMain.handle(IPC.DIALOG_OPEN_FOLDER, async () => {
  if (!mainWindow) return null
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'], title: 'アバターフォルダを選択' })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.handle(IPC.DIALOG_OPEN_FILE, async (_e, extensions: string[]) => {
  if (!mainWindow) return null
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'], title: 'ファイルを選択',
    filters: [
      { name: '画像ファイル', extensions: extensions ?? ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
      { name: 'すべて', extensions: ['*'] },
    ],
  })
  return r.canceled ? null : r.filePaths[0]
})

// ─── IPC: Collections (v0.2.2) ───────────────────────────────────────────────
ipcMain.handle(IPC.COLLECTION_LIST,   () => listCollections())
ipcMain.handle(IPC.COLLECTION_CREATE, (_e, name: string) => createCollection(name))
ipcMain.handle(IPC.COLLECTION_RENAME, (_e, id: string, name: string) => renameCollection(id, name))
ipcMain.handle(IPC.COLLECTION_DELETE, (_e, id: string) => deleteCollection(id))
ipcMain.handle(IPC.COLLECTION_LIST_PAIRS, (_e, collectionId: string) => listPairs(collectionId))
ipcMain.handle(IPC.COLLECTION_ADD_PAIR, (
  _e, collectionId: string, sessionId: string, userMsgId: string, assistantMsgId: string
) => addPair(collectionId, sessionId, userMsgId, assistantMsgId))
ipcMain.handle(IPC.COLLECTION_REMOVE_PAIR, (_e, pairId: string) => removePair(pairId))
ipcMain.handle(IPC.COLLECTION_REORDER, (_e, collectionId: string, orderedIds: string[]) =>
  reorderPairs(collectionId, orderedIds)
)
ipcMain.handle(IPC.COLLECTION_EXPORT_CSV, async (_e, collectionId: string, collectionName: string) => {
  if (!mainWindow) return { ok: false, error: 'no window' }
  const pad = (n: number) => String(n).padStart(2, '0')
  const now = new Date()
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`
  const safeName = collectionName.replace(/[/\\:*?"<>|]/g, '_')
  const defaultName = `collection_${safeName}_${dateStr}.csv`
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'コレクションをCSVとして保存', defaultPath: defaultName,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  })
  if (result.canceled || !result.filePath) return { ok: false, canceled: true }
  try { exportCollectionCsv(collectionId, collectionName, result.filePath); return { ok: true, filePath: result.filePath } }
  catch (e) { return { ok: false, error: String(e) } }
})
