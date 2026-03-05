import { app, BrowserWindow, ipcMain, dialog, nativeTheme } from 'electron'
import path from 'path'
import fs from 'fs'
import { IPC, ChatStartPayload, ChatAbortPayload, Session, Message, AppSettings } from './types'
import { streamChat, listModels } from './ollama'
import { streamChatOpenAI } from './openai'
import { streamDifyChat } from './dify'
import { initStore, createSession, appendMessage, listSessions, getSession, exportSessionCsv, deleteSession, clearAllSessions, rateMessage } from './store'
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
  try { await initStore() } catch (err) {
    console.error('[main] initStore failed:', err)
  }

  try {
    const settings = loadSettings()
    const defaultAvatarPath = app.isPackaged
      ? path.join(process.resourcesPath, 'assets', 'avatar', 'default-static')
      : path.join(app.getAppPath(), 'assets', 'avatar', 'default-static')
    if (fs.existsSync(path.join(defaultAvatarPath, 'neutral.png'))) {
      saveSettings({ ...settings, avatarPath: defaultAvatarPath })
    }
  } catch {}

  createWindow()
  app.on('activate', () => { if (!mainWindow) createWindow() })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: Chat ────────────────────────────────────────────────────────────────
ipcMain.on(IPC.CHAT_START, async (event, payload: ChatStartPayload) => {
  const { requestId, model, messages, userQuery } = payload
  const settings = loadSettings()

  const controller = new AbortController()
  activeStreams.set(requestId, controller)

  const callbacks = {
    onDelta: (delta: string) => {
      if (!activeStreams.has(requestId)) return
      event.sender.send(IPC.CHAT_DELTA, { requestId, delta })
    },
    onDone: (_full: string, ttft_ms: number) => {
      activeStreams.delete(requestId)
      event.sender.send(IPC.CHAT_DONE, { requestId, ttft_ms })
    },
    onError: (message: string) => {
      activeStreams.delete(requestId)
      event.sender.send(IPC.CHAT_ERROR, { requestId, message })
    },
  }

  // ── 接続モードで分岐 ──────────────────────────────────────────────────────
  if (settings.connectionMode === 'openai') {
    const baseUrl = settings.openaiBaseUrl || 'https://api.openai.com'
    const apiKey  = settings.openaiApiKey  || ''
    if (!apiKey) {
      callbacks.onError('OpenAI APIキーが設定されていません。設定画面から入力してください。')
      return
    }
    await streamChatOpenAI(
      baseUrl, apiKey, model, messages,
      callbacks,
      controller.signal,
      settings.streamTimeout * 1000
    )
  } else if (settings.connectionMode === 'dify') {
    const difyUrl = settings.difyUrl || 'https://api.dify.ai/v1'
    const apiKey  = settings.difyApiKey || ''
    if (!apiKey) {
      callbacks.onError('Dify APIキーが設定されていません。設定画面から入力してください。')
      return
    }
    // Dify には userQuery（最後のユーザーメッセージ）だけを渡す
    const query = userQuery ?? messages.filter(m => m.role === 'user').at(-1)?.content ?? ''
    await streamDifyChat(
      difyUrl, apiKey, query,
      callbacks,
      controller.signal,
      settings.streamTimeout * 1000
    )
  } else {
    // Ollama（デフォルト）
    const ollamaUrl = settings.ollamaUrl || 'http://localhost:11434'
    await streamChat(
      ollamaUrl, model, messages,
      callbacks,
      controller.signal,
      settings.streamTimeout * 1000
    )
  }
})

ipcMain.on(IPC.CHAT_ABORT, (_e, payload: ChatAbortPayload) => {
  const c = activeStreams.get(payload.requestId)
  if (c) { c.abort(); activeStreams.delete(payload.requestId) }
})

// ─── IPC: Models ──────────────────────────────────────────────────────────────
ipcMain.handle(IPC.MODELS_LIST, async () => {
  const settings = loadSettings()
  if (settings.connectionMode === 'openai') {
    // OpenAIモードは登録済みモデル一覧を返す（API呼び出し不要）
    return settings.openaiModels ?? []
  }
  if (settings.connectionMode === 'dify') {
    // Difyモードはモデル選択不要（空配列）
    return []
  }
  const ollamaUrl = settings.ollamaUrl || 'http://localhost:11434'
  return listModels(ollamaUrl)
})

// ─── IPC: Logs ────────────────────────────────────────────────────────────────
ipcMain.handle(IPC.LOGS_CREATE_SESSION, (_e, session: Session) => { createSession(session) })
ipcMain.handle(IPC.LOGS_APPEND_MESSAGE, (_e, msg: Message) => { appendMessage(msg) })
ipcMain.handle(IPC.LOGS_LIST_SESSIONS, () => listSessions())
ipcMain.handle(IPC.LOGS_GET_SESSION, (_e, id: string) => getSession(id))

ipcMain.handle(IPC.LOGS_EXPORT_CSV, async (_e, sessionId: string, defaultName: string) => {
  if (!mainWindow) return { ok: false, error: 'no window' }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'CSVとして保存', defaultPath: defaultName,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  })
  if (result.canceled || !result.filePath) return { ok: false, canceled: true }
  try {
    exportSessionCsv(sessionId, result.filePath)
    return { ok: true, filePath: result.filePath }
  } catch (e) { return { ok: false, error: String(e) } }
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
  } catch (e) {
    console.warn('[main] avatar:readFile failed:', filePath, e)
    return null
  }
})

ipcMain.handle(IPC.AVATAR_CHECK_STATIC, (_e, avatarPath: string) => {
  try {
    return fs.existsSync(path.join(avatarPath, 'neutral.png'))
  } catch { return false }
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
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'], title: 'アバターフォルダを選択',
  })
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
