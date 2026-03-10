import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import type { SqlJsStatic, Database as SqlDatabase } from 'sql.js'
import { Session, Message, MixingCollection, MixingPair } from './types'

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
        id TEXT PRIMARY KEY, title TEXT, started_at TEXT NOT NULL,
        distance TEXT, model TEXT, tags TEXT, meta TEXT
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL,
        content TEXT NOT NULL, content_clean TEXT, tone TEXT, model TEXT,
        latency_ms INTEGER, ttft_ms INTEGER, tokens_in INTEGER, tokens_out INTEGER,
        safety_flags TEXT, error TEXT, rating TEXT, created_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id)
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_role    ON messages(role);
      CREATE INDEX IF NOT EXISTS idx_messages_tone    ON messages(tone);
    `)
    // 既存DBマイグレーション
    try { db.run(`ALTER TABLE messages ADD COLUMN rating TEXT`) } catch {}

    // v0.2.2: コレクションテーブル追加
    db.run(`
      CREATE TABLE IF NOT EXISTS mixing_collections (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS mixing_pairs (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        user_message_id TEXT NOT NULL,
        assistant_message_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        added_at TEXT NOT NULL,
        needs_review INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY(collection_id) REFERENCES mixing_collections(id)
      );
      CREATE INDEX IF NOT EXISTS idx_mixing_pairs_col ON mixing_pairs(collection_id);
    `)
    // v0.2.4: needs_reviewカラムのマイグレーション（既存DBへの追加）
    try { db.run(`ALTER TABLE mixing_pairs ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 1`) } catch {}
    persistDb()
    console.log('[store] sql.js initialized:', dbPath)
  } catch (err) {
    console.error('[store] initStore error:', err)
    db = null
  }
}

function persistDb(): void {
  if (!db) return
  try { fs.writeFileSync(dbPath, Buffer.from(db.export())) }
  catch (err) { console.error('[store] persist error:', err) }
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export function createSession(session: Session): void {
  if (!db) return
  db.run(
    `INSERT OR IGNORE INTO sessions (id, title, started_at, distance, model, tags, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [session.id, session.title, session.started_at, session.distance ?? null,
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
    [msg.id, msg.session_id, msg.role, msg.content, msg.content_clean ?? null,
     msg.tone ?? null, msg.model ?? null, msg.latency_ms ?? null, msg.ttft_ms ?? null,
     msg.tokens_in ?? null, msg.tokens_out ?? null, msg.safety_flags, msg.error,
     msg.rating ?? null, msg.created_at]
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

export function exportSessionCsv(sessionId: string, outputPath: string): void {
  const session = getSession(sessionId)
  const messages = getSessionMessages(sessionId)
  const distance = session?.distance ?? ''
  const header = 'session_id,created_at,role,model,distance,ttft_ms,rating,content'
  const rows = messages
    .filter(m => m.role !== 'system')
    .map(m => [
      m.session_id, m.created_at, m.role, m.model ?? '',
      m.role === 'assistant' ? distance : '',
      m.ttft_ms ?? '', m.rating ?? '',
      `"${(m.content_clean ?? m.content ?? '').replace(/"/g, '""')}"`
    ].join(','))
  fs.writeFileSync(outputPath, '\uFEFF' + [header, ...rows].join('\n'), 'utf-8')
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
  } catch (err) { console.error('[store] JSONL write error:', err) }
}

// ─── Collections (v0.2.2) ─────────────────────────────────────────────────────

export function listCollections(): MixingCollection[] {
  if (!db) return []
  const stmt = db.prepare(`SELECT * FROM mixing_collections ORDER BY created_at ASC`)
  const rows: MixingCollection[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as unknown as MixingCollection)
  stmt.free()
  return rows
}

export function createCollection(name: string): MixingCollection {
  if (!db) throw new Error('DB not initialized')
  const id = genId()
  const created_at = new Date().toISOString()
  db.run(`INSERT INTO mixing_collections (id, name, created_at) VALUES (?, ?, ?)`, [id, name, created_at])
  persistDb()
  return { id, name, created_at }
}

export function renameCollection(id: string, name: string): void {
  if (!db) return
  db.run(`UPDATE mixing_collections SET name = ? WHERE id = ?`, [name, id])
  persistDb()
}

export function deleteCollection(id: string): void {
  if (!db) return
  db.run(`DELETE FROM mixing_pairs WHERE collection_id = ?`, [id])
  db.run(`DELETE FROM mixing_collections WHERE id = ?`, [id])
  persistDb()
}

export function listPairs(collectionId: string): MixingPair[] {
  if (!db) return []
  const stmt = db.prepare(`
    SELECT
      mp.id, mp.collection_id, mp.session_id,
      mp.user_message_id, mp.assistant_message_id,
      mp.sort_order, mp.added_at,
      mp.needs_review,
      s.title      AS session_title,
      s.started_at AS session_date,
      am.model     AS model,
      am.rating    AS rating,
      COALESCE(um.content_clean, um.content, '') AS user_content,
      COALESCE(am.content_clean, am.content, '') AS assistant_content
    FROM mixing_pairs mp
    LEFT JOIN sessions s  ON s.id  = mp.session_id
    LEFT JOIN messages um ON um.id = mp.user_message_id
    LEFT JOIN messages am ON am.id = mp.assistant_message_id
    WHERE mp.collection_id = ?
    ORDER BY mp.sort_order ASC
  `)
  stmt.bind([collectionId])
  const rows: MixingPair[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    rows.push({
      id:                   r.id as string,
      collection_id:        r.collection_id as string,
      session_id:           r.session_id as string,
      user_message_id:      r.user_message_id as string,
      assistant_message_id: r.assistant_message_id as string,
      sort_order:           r.sort_order as number,
      added_at:             r.added_at as string,
      needs_review:         (r.needs_review as number) ?? 1,
      session_title:        (r.session_title as string) ?? '',
      session_date:         (r.session_date as string) ?? '',
      model:                (r.model as string) ?? '',
      rating:               r.rating as string | null,
      user_content:         (r.user_content as string) ?? '',
      assistant_content:    (r.assistant_content as string) ?? '',
    })
  }
  stmt.free()
  return rows
}

export function addPair(
  collectionId: string, sessionId: string,
  userMessageId: string, assistantMessageId: string
): MixingPair {
  if (!db) throw new Error('DB not initialized')
  const maxStmt = db.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM mixing_pairs WHERE collection_id = ?`
  )
  maxStmt.bind([collectionId])
  maxStmt.step()
  const nextOrder = ((maxStmt.getAsObject() as Record<string, unknown>).m as number ?? 0) + 1
  maxStmt.free()

  const id = genId()
  const added_at = new Date().toISOString()
  db.run(
    `INSERT INTO mixing_pairs
      (id, collection_id, session_id, user_message_id, assistant_message_id, sort_order, added_at, needs_review)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    [id, collectionId, sessionId, userMessageId, assistantMessageId, nextOrder, added_at]
  )
  persistDb()
  return {
    id, collection_id: collectionId, session_id: sessionId,
    user_message_id: userMessageId, assistant_message_id: assistantMessageId,
    sort_order: nextOrder, added_at, needs_review: 1,
  }
}

// v0.2.4追加: 要確認フラグ更新
export function reviewPair(pairId: string, needsReview: boolean): void {
  if (!db) return
  db.run(`UPDATE mixing_pairs SET needs_review = ? WHERE id = ?`, [needsReview ? 1 : 0, pairId])
  persistDb()
}

export function removePair(pairId: string): void {
  if (!db) return
  db.run(`DELETE FROM mixing_pairs WHERE id = ?`, [pairId])
  persistDb()
}

export function reorderPairs(collectionId: string, orderedIds: string[]): void {
  if (!db) return
  orderedIds.forEach((id, idx) => {
    db!.run(
      `UPDATE mixing_pairs SET sort_order = ? WHERE id = ? AND collection_id = ?`,
      [idx + 1, id, collectionId]
    )
  })
  persistDb()
}

export function exportCollectionCsv(collectionId: string, collectionName: string, outputPath: string): void {
  const pairs = listPairs(collectionId)
  const header = 'collection_name,order,needs_review,session_title,session_date,model,rating,user_content,assistant_content'
  const safeColName = `"${collectionName.replace(/"/g, '""')}"`
  const rows = pairs.map((p, i) => [
    safeColName,
    i + 1,
    p.needs_review ?? 1,
    `"${(p.session_title ?? '').replace(/"/g, '""')}"`,
    p.session_date ?? '',
    p.model ?? '',
    p.rating ?? '',
    `"${(p.user_content ?? '').replace(/"/g, '""')}"`,
    `"${(p.assistant_content ?? '').replace(/"/g, '""')}"`,
  ].join(','))
  fs.writeFileSync(outputPath, '\uFEFF' + [header, ...rows].join('\n'), 'utf-8')
}
