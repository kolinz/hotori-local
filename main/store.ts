import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import type { SqlJsStatic, Database as SqlDatabase } from 'sql.js'
import { Session, Message } from './types'

let db: SqlDatabase | null = null
let dbPath = ''

export async function initStore(): Promise<void> {
  try {
    const initSqlJs = require('sql.js') as (cfg?: object) => Promise<SqlJsStatic>
    const wasmCandidates = [
      path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
      path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    ]
    const wasmPath = wasmCandidates.find(p => fs.existsSync(p)) ?? wasmCandidates[0]
    const SQL = await initSqlJs({ locateFile: () => wasmPath })

    const userDataPath = app.getPath('userData')
    dbPath = path.join(userDataPath, 'learning-assistant.sqlite.bin')

    if (fs.existsSync(dbPath)) {
      db = new SQL.Database(fs.readFileSync(dbPath))
    } else {
      db = new SQL.Database()
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        started_at TEXT NOT NULL,
        distance TEXT,
        model TEXT,
        tags TEXT,
        meta TEXT
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        content_clean TEXT,
        tone TEXT,
        model TEXT,
        latency_ms INTEGER,
        ttft_ms INTEGER,
        tokens_in INTEGER,
        tokens_out INTEGER,
        safety_flags TEXT,
        error TEXT,
        rating TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id)
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_role    ON messages(role);
      CREATE INDEX IF NOT EXISTS idx_messages_tone    ON messages(tone);
    `)
    // 既存DBにratingカラムがない場合に追加（マイグレーション）
    try { db.run(`ALTER TABLE messages ADD COLUMN rating TEXT`) } catch {}

    persistDb()
    console.log('[store] sql.js initialized:', dbPath)
  } catch (err) {
    console.error('[store] initStore error:', err)
    db = null
  }
}

function persistDb(): void {
  if (!db) return
  try {
    fs.writeFileSync(dbPath, Buffer.from(db.export()))
  } catch (err) {
    console.error('[store] persist error:', err)
  }
}

export function createSession(session: Session): void {
  if (!db) return
  db.run(
    `INSERT OR IGNORE INTO sessions (id, title, started_at, distance, model, tags, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [session.id, session.title, session.started_at, session.distance,
     session.model, session.tags ?? null, session.meta ?? null]
  )
  persistDb()
}

export function listSessions(): Session[] {
  if (!db) return []
  const stmt = db.prepare(`SELECT * FROM sessions ORDER BY started_at DESC`)
  const rows: Session[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as unknown as Session)
  stmt.free()
  return rows
}

export function getSession(id: string): Session | undefined {
  if (!db) return undefined
  const stmt = db.prepare(`SELECT * FROM sessions WHERE id = ?`)
  stmt.bind([id])
  const row = stmt.step() ? stmt.getAsObject() as unknown as Session : undefined
  stmt.free()
  return row
}

export function appendMessage(msg: Message): void {
  if (!db) { writeJsonl(msg); return }
  db.run(
    `INSERT OR IGNORE INTO messages (
       id, session_id, role, content, content_clean, tone, model,
       latency_ms, ttft_ms, tokens_in, tokens_out, safety_flags, error, rating, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [msg.id, msg.session_id, msg.role, msg.content, msg.content_clean,
     msg.tone, msg.model, msg.latency_ms, msg.ttft_ms,
     msg.tokens_in, msg.tokens_out, msg.safety_flags, msg.error, msg.rating ?? null, msg.created_at]
  )
  persistDb()
  writeJsonl(msg)
}

export function rateMessage(messageId: string, rating: string | null): void {
  if (!db) return
  db.run(`UPDATE messages SET rating = ? WHERE id = ?`, [rating, messageId])
  persistDb()
}

export function deleteSession(sessionId: string): void {
  if (!db) return
  db.run(`DELETE FROM messages WHERE session_id = ?`, [sessionId])
  db.run(`DELETE FROM sessions WHERE id = ?`, [sessionId])
  persistDb()
}

export function clearAllSessions(): void {
  if (!db) return
  db.run(`DELETE FROM messages`)
  db.run(`DELETE FROM sessions`)
  persistDb()
}

export function getSessionMessages(sessionId: string): Message[] {
  if (!db) return []
  const stmt = db.prepare(`SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC`)
  stmt.bind([sessionId])
  const rows: Message[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as unknown as Message)
  stmt.free()
  return rows
}

function writeJsonl(msg: Message): void {
  try {
    const userDataPath = app.getPath('userData')
    const date = new Date(msg.created_at)
    const monthDir = path.join(
      userDataPath, 'logs',
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    )
    fs.mkdirSync(monthDir, { recursive: true })
    fs.appendFileSync(
      path.join(monthDir, `session_${msg.session_id}.jsonl`),
      JSON.stringify(msg) + '\n', 'utf-8'
    )
  } catch (err) {
    console.error('[store] JSONL write error:', err)
  }
}

export function exportSessionCsv(sessionId: string, outputPath: string): void {
  const session = getSession(sessionId)
  const messages = getSessionMessages(sessionId)
  const distance = session?.distance ?? ''
  const header = 'created_at,role,model,distance,ttft_ms,rating,content'
  const rows = messages
    .filter(m => m.role !== 'system')
    .map(m => [
      m.created_at,
      m.role,
      m.model ?? '', 
      m.role === 'assistant' ? distance : '',
      m.ttft_ms ?? '',
      m.rating ?? '',
      `"${(m.content_clean ?? m.content ?? '').replace(/"/g, '""')}"`
    ].join(','))
  fs.writeFileSync(outputPath, '\uFEFF' + [header, ...rows].join('\n'), 'utf-8')
}
