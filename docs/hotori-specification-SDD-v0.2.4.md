# 学習アシスタント Hotori — ソフトウェア設計仕様書 (SDD)

**バージョン**: 0.2.4
**作成日**: 2026-03-09
**手法**: 仕様駆動開発 (Specification-Driven Development)

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [技術スタック](#2-技術スタック)
3. [アーキテクチャ](#3-アーキテクチャ)
4. [ディレクトリ構成](#4-ディレクトリ構成)
5. [データモデル](#5-データモデル)
6. [IPC通信仕様](#6-ipc通信仕様)
7. [コンポーネント仕様](#7-コンポーネント仕様)
8. [設定仕様](#8-設定仕様)
9. [セッション・ログ仕様](#9-セッションログ仕様)
10. [アバター仕様](#10-アバター仕様)
11. [システムプロンプト仕様](#11-システムプロンプト仕様)
12. [toneTagパーサー仕様](#12-tonetagパーサー仕様)
13. [アバター吹き出し仕様](#13-アバター吹き出し仕様)
14. [理解・納得ワード検知仕様](#14-理解納得ワード検知仕様)
15. [学習コレクション機能仕様](#15-学習コレクション機能仕様)
16. [非機能要件](#16-非機能要件)
17. [ビルド・配布仕様](#17-ビルド配布仕様)
18. [SDD開発ガイド（Claude向け）](#18-sdd開発ガイドclaude向け)

---

## 1. プロジェクト概要

### 1.1 アプリケーション概要

| 項目 | 内容 |
|------|------|
| アプリ名 | 学習アシスタント Hotori |
| 目的 | ローカルLLM（Ollama）・OpenAI API・Dify API・Gemini API を使った学習支援デスクトップアプリ |
| 対象OS | Windows（主）、macOS、Linux |
| 配布形式 | NSIS インストーラー（Win）、DMG（Mac）、AppImage（Linux） |
| ネットワーク | Ollamaモード: 完全オフライン / OpenAIモード: インターネット必要 / Difyモード: エンドポイントに依存 / Geminiモード: インターネット必要 |
| ライセンス | MIT License |

### 1.2 主要機能

- **マルチタブチャット**: 最大5タブの並列セッション管理
- **ストリーミング応答**: Ollama / OpenAI / Gemini / Dify API 経由のリアルタイムトークン表示
- **4モードバックエンド**: Ollama（ローカル）/ OpenAI API / Gemini API / Dify API の切り替え
- **セッション中接続モード固定**: セッション開始時のモードをRefで記憶し、設定変更による誤送信を防止（v0.2.4追加）
- **アバター表情制御**: 応答の感情モーションに連動したPNG切り替え
- **インタラクティブ吹き出し**: セッション開始・理解ワード検知時のUI演出（DB保存なし）
- **理解・納得ワード検知**: 設定可能なキーワードでLLM送信をスキップしpraiseモーション発動
- **セッションログ**: sql.js（WASM SQLite）による会話履歴の永続化
- **CSVエクスポート**: セッション単位でのデータエクスポート（session_id・model・評価付き）
- **応答評価**: Good / Not Good の2値評価とログへの記録
- **蒸留ワークフロー対応**: OpenAIで生成→good評価→CSV出力→ファインチューニングデータ化
- **セッション詳細プレビュー**: セッション履歴モーダル内でメッセージ一覧を確認（v0.2.1追加）
- **学習コレクション機能**: チャット中のQ&Aペアを任意のコレクションに仕分けし、コレクション単位でCSVエクスポート（v0.2.2追加）
- **距離感機能の有効化**: チェックボックスでオン/オフ切り替え可能（デフォルトオフ、toneTagと同じUIパターン）（v0.2.4追加）

---

## 2. 技術スタック

### 2.1 依存パッケージ

```json
// 本番依存
{
  "react": "^18.3.0",
  "react-dom": "^18.3.0",
  "sql.js": "^1.12.0",
  "zustand": "^5.0.0"
}

// 開発依存
{
  "electron": "^40.8.0",          // v0.2.4: ^33.0.0 → ^40.8.0 に更新
  "electron-builder": "^26.8.1",  // v0.2.4: ^25.1.8 → ^26.8.1 に更新
  "vite": "^6.3.0",
  "@vitejs/plugin-react": "^4.3.0",
  "typescript": "^5.7.0",
  "concurrently": "^9.2.0",
  "wait-on": "^8.0.3",
  "vitest": "^3.0.0"
}
```

### 2.2 npm overrides

electron 40系 / electron-builder 26系への更新に伴い、`glob` / `tar` の overrides は削除済み。

`npm install` 後に `npm warn deprecated` が残るが、これらは `electron-builder` 内部依存（`inflight` / `rimraf` / `glob` / `boolean`）によるものでアプリ自身のコードとは無関係。`found 0 vulnerabilities` であれば対処不要。

### 2.3 動作要件

| 項目 | 要件 |
|------|------|
| Node.js | **22以上**（v0.2.4より明記） |

### 2.4 開発コマンド

| コマンド | 内容 |
|---------|------|
| `npm install` | 依存解決 |
| `npm run dev` | Vite + Electron 同時起動（開発モード） |
| `npm run build` | Vite ビルド + TypeScript コンパイル |
| `npm run dist:win` | Windows NSIS インストーラー生成 |

---

## 3. アーキテクチャ

### 3.1 全体構成

```
┌──────────────────────────────────────────────────────────────────┐
│                      Electron Main Process                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────┐  ┌───────┐  │
│  │ main.ts  │  │ollama.ts │  │openai.ts │  │dify  │  │store  │  │
│  │ IPC Hub  │  │HTTP SSE  │  │HTTP SSE  │  │ .ts  │  │ .ts   │  │
│  │ 4モード  │  │クライアント│  │クライアント│  │HTTP  │  │sql.js │  │
│  └────┬─────┘  └──────────┘  └──────────┘  │SSE   │  │DB     │  │
│       │        ┌──────────┐               │      │  └───────┘  │
│       │        │gemini.ts │               └──────┘             │
│       │        │HTTP SSE  │                                     │
│       │        │クライアント│                                     │
│       │        └──────────┘                                     │
│       │ contextBridge (preload.ts)                               │
└───────┼──────────────────────────────────────────────────────────┘
        │ IPC（invoke / send / on）
┌───────┼──────────────────────────────────────────────────────────┐
│       │              Electron Renderer Process                    │
│  ┌────┴────────────────────────────────────────────────────────┐  │
│  │  React + Vite (TypeScript)                                  │  │
│  │  App.tsx → Chat.tsx / AvatarLayer.tsx                       │  │
│  │           SettingsModal / SessionsModal / OllamaGuide       │  │
│  │           CollectionPanel（v0.2.2追加）                      │  │
│  └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
        │
┌───────┴──────────────────────────────────────────────────────────┐
│  バックエンド（connectionMode で切り替え）                           │
│  🦙 Ollama   http://localhost:11434 （変更可）                     │
│  🤖 OpenAI   https://api.openai.com （変更可）                     │
│  ⚡ Dify     https://api.dify.ai/v1  （変更可・セルフホスト可）      │
│  ✨ Gemini   https://generativelanguage.googleapis.com/v1beta/ （変更可） │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 接続モード分岐

`main/main.ts` の `CHAT_START` / `MODELS_LIST` ハンドラで `settings.connectionMode` を参照して4方向に分岐する。

```typescript
// CHAT_START
if (settings.connectionMode === 'openai') {
  await streamChatOpenAI(baseUrl, apiKey, model, messages, callbacks, signal, timeout)
} else if (settings.connectionMode === 'gemini') {
  await streamChatGemini(settings.geminiBaseUrl, settings.geminiApiKey, model, messages, callbacks, signal, timeout)
} else if (settings.connectionMode === 'dify') {
  await streamDifyChat(difyUrl, apiKey, query, callbacks, signal, timeout)
} else {
  // ollama（デフォルト）
  await streamChat(ollamaUrl, model, messages, callbacks, signal, timeout)
}

// MODELS_LIST
if (connectionMode === 'openai')  return settings.openaiModels ?? []
if (connectionMode === 'gemini')  return settings.geminiModels ?? []
if (connectionMode === 'dify')    return []   // モデル選択不要
return listModels(ollamaUrl)                  // Ollama API から動的取得
```

**Geminiモードの設計方針**:
- `main/gemini.ts` を `openai.ts` のコピーとして作成し、Gemini専用クライアントとして独立させる
- エンドポイントURL（`geminiBaseUrl`）は `settings.geminiBaseUrl` から取得する（設定画面で変更可能）
- `openai.ts` と独立しているため、将来のGemini固有の挙動変更（モデル名の扱い、エラー処理など）を `gemini.ts` だけで対応できる
- systemプロンプトはOpenAIモードと同じく `messages[0]` として渡す
- モデル一覧は手動管理（OpenAIモードと同様のUI）
- APIキーは `geminiApiKey` フィールドで独立管理

### 3.3 プロセス間通信の原則

- Main → Renderer: `event.sender.send()` （ストリーミングデルタなど）
- Renderer → Main: `ipcRenderer.invoke()` （非同期 request/response）
- すべてのIPC名は `main/types.ts` の `IPC` 定数で一元管理する
- `contextIsolation: true`, `nodeIntegration: false` を厳守する

---

## 4. ディレクトリ構成

```
learning-assistant/
├── assets/
│   └── avatar/
│       ├── default-static/          # 同梱デフォルトアバターPNG
│       │   ├── neutral.png
│       │   ├── think.png
│       │   ├── explain.png
│       │   ├── praise.png
│       │   └── ask.png
│       └── manifest.json
├── main/                            # Electron Main Process
│   ├── main.ts                      # エントリーポイント・IPCハブ・4モード分岐
│   ├── ollama.ts                    # Ollama HTTPストリーミングクライアント
│   ├── openai.ts                    # OpenAI SSEストリーミングクライアント
│   ├── dify.ts                      # Dify SSEストリーミングクライアント（v0.2.0追加）
│   ├── gemini.ts                    # Gemini SSEストリーミングクライアント（v0.2.3追加・openai.tsのコピーベース）
│   ├── store.ts                     # sql.js DBアクセス層
│   ├── settings.ts                  # 設定ファイルI/O
│   ├── preload.ts                   # contextBridge公開API
│   └── types.ts                     # 共有型定義・IPC定数
├── renderer/
│   ├── index.html                   # CSP設定（connect-src拡張済み）
│   └── src/
│       ├── App.tsx                  # ルート・タブ管理・吹き出し制御・4モード対応
│       ├── App.module.css
│       ├── components/
│       │   ├── Chat.tsx             # チャットUI・ストリーミング・理解ワード検知・Dify対応
│       │   ├── Chat.module.css
│       │   ├── AvatarLayer.tsx      # アバター表示・モーション制御
│       │   ├── AvatarLayer.module.css
│       │   ├── SettingsModal.tsx    # 設定画面（4モード対応・maxCollections追加）
│       │   ├── SessionsModal.tsx    # セッション履歴・詳細プレビュー・CSVエクスポート（v0.2.1拡張）
│       │   ├── CollectionPanel.tsx  # 学習コレクションパネル（v0.2.2追加）
│       │   ├── CollectionPanel.module.css  # コレクションパネルスタイル（v0.2.2追加）
│       │   ├── MotionDebugPanel.tsx # モーションテスト（開発用）
│       │   ├── OllamaGuide.tsx      # 未設定時のガイド（connectionMode対応）
│       │   └── Modal.module.css     # モーダル共通スタイル
│       ├── utils/
│       │   ├── electronAPI.ts       # IPC型定義・フォールバック値
│       │   ├── parseTone.ts         # toneTagパーサー（多形式対応）
│       │   └── systemPrompt.ts      # システムプロンプト生成
│       └── styles/
│           └── global.css           # CSSカスタムプロパティ
├── scripts/
│   └── dev-electron.js              # 開発時クリーンビルドスクリプト
├── docs/
│   ├── hotori-specification-SDD-v0.1.8e.md
│   ├── hotori-specification-SDD-v0.1.9b.md
│   ├── hotori-specification-SDD-v0.2.0.md
│   ├── hotori-specification-SDD-v0.2.1.md
│   ├── hotori-specification-SDD-v0.2.2.md
│   ├── hotori-specification-SDD-v0.2.3.md
│   └── hotori-specification-SDD-v0.2.4.md  ← 本ファイル
├── tsconfig.json
├── tsconfig.electron.json
├── vite.config.ts
└── package.json
```

---

## 5. データモデル

### 5.1 型定義（`main/types.ts`）

```typescript
export type ConnectionMode = 'ollama' | 'openai' | 'dify' | 'gemini'
export type Distance       = 'friend' | 'tutor' | 'buddy' | 'calm' | 'cheerful'
export type MotionName     = 'neutral' | 'think' | 'explain' | 'praise' | 'ask'
export type Rating         = 'good' | 'bad' | null

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatStartPayload {
  requestId: string
  model: string
  distance: Distance
  messages: ChatMessage[]
  userQuery?: string   // Difyモード時のみ使用（最新ユーザー入力を単独で渡す）
}

export interface AppSettings {
  // ── 接続設定 ──
  connectionMode: ConnectionMode
  // Ollama
  ollamaUrl: string
  // OpenAI
  openaiApiKey: string
  openaiModels: string[]
  openaiBaseUrl: string
  // Dify（v0.2.0追加）
  difyUrl: string
  difyApiKey: string
  // Gemini（v0.2.3追加）
  geminiApiKey: string
  geminiModels: string[]
  geminiBaseUrl: string

  // ── 表示・動作 ──
  avatarPath: string
  backgroundImagePath: string
  theme: 'light' | 'dark' | 'auto'
  distance: Distance
  reducedMotion: boolean
  defaultModel: string
  streamTimeout: number

  // ── アバター動作 ──
  toneTagEnabled: boolean
  enabledMotions: MotionName[]

  // ── 理解・納得ワード ──
  understandingWordsEnabled: boolean
  understandingWords: string[]

  // ── 距離感（v0.2.4変更）──
  distanceEnabled: boolean  // 距離感機能の有効化（デフォルトオフ）

  // ── 学習コレクション（v0.2.2追加）──
  maxCollections: number
}

export const ALL_MOTIONS: MotionName[] = ['neutral', 'think', 'explain', 'praise', 'ask']

export const DEFAULT_UNDERSTANDING_WORDS: string[] = [
  'なるほど', 'わかりました', '了解', '理解しました', 'そうか', 'なるほどね',
  'わかった', 'そっか', 'なるほど！', 'わかりました！', '理解できました',
]

export const OPENAI_PRESET_MODELS: string[] = [
  'gpt-5-nano-2025-08-07',
  'gpt-4.1-nano-2025-04-14',
  'gpt-4o',
  'gpt-4o-mini',
]

export const GEMINI_PRESET_MODELS: string[] = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
]

export const DEFAULT_SETTINGS: AppSettings = {
  connectionMode: 'ollama',
  ollamaUrl: 'http://localhost:11434',
  openaiApiKey: '',
  openaiModels: ['gpt-5-nano-2025-08-07', 'gpt-4.1-nano-2025-04-14'],
  openaiBaseUrl: 'https://api.openai.com',
  difyUrl: 'https://api.dify.ai/v1',
  difyApiKey: '',
  geminiApiKey: '',                                                   // v0.2.3追加
  geminiModels: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],          // v0.2.3追加
  geminiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/',  // v0.2.3追加
  avatarPath: '',
  backgroundImagePath: '',
  theme: 'auto',
  distance: 'tutor',
  reducedMotion: false,
  defaultModel: 'gemma3:1b',
  streamTimeout: 60,
  toneTagEnabled: false,              // v0.2.4: デフォルトオフに変更（実施済み）
  enabledMotions: [],                 // v0.2.4: デフォルト空（オフ）に変更（実施済み）
  distanceEnabled: false,             // v0.2.4追加: デフォルトオフ
  understandingWordsEnabled: true,
  understandingWords: [...DEFAULT_UNDERSTANDING_WORDS],
  maxCollections: 10,                 // v0.2.2追加
}

export interface Session {
  id: string
  title: string
  model: string
  started_at: string
  distance?: string
  tags?: string
  meta?: string
}

export interface Message {
  id: string
  session_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  content_clean?: string
  tone?: string
  model?: string
  latency_ms?: number
  ttft_ms?: number
  tokens_in?: number
  tokens_out?: number
  safety_flags: string
  error: string
  rating?: Rating
  created_at: string
}
```

### 5.2 DBスキーマ（sql.js / WASM SQLite）

```sql
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  title      TEXT,
  started_at TEXT NOT NULL,
  distance   TEXT,
  model      TEXT,
  tags       TEXT,
  meta       TEXT
);

CREATE TABLE messages (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  role          TEXT NOT NULL,
  content       TEXT NOT NULL,
  content_clean TEXT,
  tone          TEXT,
  model         TEXT,        -- 使用モデル名（Ollama / OpenAI / Gemini モデル名 / 'Dify' 固定値）
  latency_ms    INTEGER,
  ttft_ms       INTEGER,
  tokens_in     INTEGER,
  tokens_out    INTEGER,
  safety_flags  TEXT,
  error         TEXT,
  rating        TEXT,        -- 'good' | 'bad' | NULL
  created_at    TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE INDEX idx_messages_role    ON messages(role);
CREATE INDEX idx_messages_tone    ON messages(tone);

-- 学習コレクション（v0.2.2追加）
CREATE TABLE mixing_collections (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE mixing_pairs (
  id                   TEXT PRIMARY KEY,
  collection_id        TEXT NOT NULL,
  session_id           TEXT NOT NULL,
  user_message_id      TEXT NOT NULL,
  assistant_message_id TEXT NOT NULL,
  sort_order           INTEGER NOT NULL DEFAULT 0,
  added_at             TEXT NOT NULL,
  needs_review         INTEGER NOT NULL DEFAULT 1,  -- v0.2.4追加: 1=要確認（デフォルト）/ 0=確認済み。AIの回答は原則要確認とする
  FOREIGN KEY(collection_id) REFERENCES mixing_collections(id) ON DELETE CASCADE,
  FOREIGN KEY(session_id)    REFERENCES sessions(id)
);

CREATE INDEX idx_pairs_collection ON mixing_pairs(collection_id);
CREATE INDEX idx_pairs_sort       ON mixing_pairs(collection_id, sort_order);
```

**マイグレーション方針**: `initStore()` 内で `ALTER TABLE ... ADD COLUMN` を try/catch で囲み、既存DBのカラム不足を無視して追加する。

**保存場所**: `%APPDATA%\learning-assistant\learning-assistant.sqlite.bin`（Windows）

**補助ログ**: メッセージは `%APPDATA%\learning-assistant\logs\YYYY-MM\session_{id}.jsonl` にも追記保存（バックアップ）。

### 5.3 設定ファイル

- **場所**: `%APPDATA%\learning-assistant\settings.json`（Windows）
- **形式**: JSON（`AppSettings` 型）
- **I/O**: `main/settings.ts` の `loadSettings()` / `saveSettings()`

### 5.4 CSVエクスポート形式

```
session_id,created_at,role,model,distance,ttft_ms,rating,content
abc-123,2026-03-05T11:55:08Z,user,,,,,,"質問テキスト"
abc-123,2026-03-05T11:55:11Z,assistant,gemma3:1b,tutor,1823,good,"回答テキスト"
abc-456,2026-03-05T12:00:00Z,assistant,Dify,tutor,,,"Dify応答テキスト"
```

- `session_id`: セッション識別子
- `model`: Ollamaモデル名 / OpenAIモデル名 / Geminiモデル名 / `'Dify'`（固定文字列）
- `distance`: assistantの行のみ、userの行は空
- `rating`: `good` / `bad` / 空
- `content`: ダブルクォートで囲み、内部の `"` は `""` でエスケープ
- BOM付きUTF-8（Excelでの文字化け防止）
- ファイル名: `session_YYYY-MM-DD-HH-mm_モデル名.csv`

---

## 6. IPC通信仕様

### 6.1 IPC定数一覧（`main/types.ts`）

```typescript
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
  LOGS_RATE_MESSAGE:        'logs:rateMessage',
  LOGS_GET_SESSION_MESSAGES: 'logs:getSessionMessages',  // v0.2.1追加
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  DIALOG_OPEN_FOLDER: 'dialog:openFolder',
  DIALOG_OPEN_FILE:   'dialog:openFile',
  DIALOG_SAVE_CSV:    'dialog:saveCsv',
  AVATAR_LOAD_MANIFEST: 'avatar:loadManifest',
  AVATAR_CHECK_STATIC:  'avatar:checkStatic',
  AVATAR_DEFAULT_PATH:  'avatar:defaultPath',
  AVATAR_READ_FILE:     'avatar:readFile',

  // 学習コレクション（v0.2.2追加）
  COLLECTION_LIST:        'collection:list',
  COLLECTION_CREATE:      'collection:create',
  COLLECTION_RENAME:      'collection:rename',
  COLLECTION_DELETE:      'collection:delete',
  COLLECTION_LIST_PAIRS:  'collection:listPairs',
  COLLECTION_ADD_PAIR:    'collection:addPair',
  COLLECTION_REMOVE_PAIR: 'collection:removePair',
  COLLECTION_REORDER:     'collection:reorder',
  COLLECTION_EXPORT_CSV:  'collection:exportCsv',
  COLLECTION_REVIEW_PAIR:  'collection:reviewPair',  // v0.2.4追加
} as const
```

### 6.2 コレクション IPC（v0.2.2追加）

| IPC定数 | 方向 | 引数 | 戻り値 | 説明 |
|---------|------|------|--------|------|
| `COLLECTION_LIST` | invoke | — | `MixingCollection[]` | コレクション一覧取得 |
| `COLLECTION_CREATE` | invoke | `name: string` | `MixingCollection` | コレクション作成 |
| `COLLECTION_RENAME` | invoke | `id, name` | `void` | 名前変更 |
| `COLLECTION_DELETE` | invoke | `id: string` | `void` | コレクション削除（ペアも CASCADE） |
| `COLLECTION_LIST_PAIRS` | invoke | `collectionId` | `MixingPair[]` | ペア一覧（JOINあり） |
| `COLLECTION_ADD_PAIR` | invoke | `{ collectionId, sessionId, userMessageId, assistantMessageId }` | `MixingPair` | ペア追加 |
| `COLLECTION_REMOVE_PAIR` | invoke | `pairId: string` | `void` | ペア削除 |
| `COLLECTION_REVIEW_PAIR` | invoke | `{ pairId: string, needsReview: boolean }` | `void` | 要確認フラグON/OFF（v0.2.4追加） |
| `COLLECTION_REORDER` | invoke | `collectionId, orderedIds: string[]` | `void` | 並び替え |
| `COLLECTION_EXPORT_CSV` | invoke | `collectionId, collectionName` | `{ ok, filePath?, canceled?, error? }` | CSV保存ダイアログ + 書き出し |

### 6.3 getSessionMessages（v0.2.1追加）

```typescript
ipcMain.handle(IPC.LOGS_GET_SESSION_MESSAGES, (_e, id: string) => getSessionMessages(id))
```

セッション内のメッセージ一覧を `created_at ASC` で返す。`SessionsModal` の詳細ビューが使用する。

### 6.4 CHAT_START ペイロードとモード別挙動

| フィールド | Ollamaモード | OpenAIモード | Geminiモード | Difyモード |
|---|---|---|---|---|
| `model` | Ollamaモデル名 | OpenAIモデル名 | Geminiモデル名 | `''`（空文字） |
| `messages` | システムプロンプト + 全履歴 | システムプロンプト + 全履歴 | システムプロンプト + 全履歴 | `[]`（空配列） |
| `userQuery` | 未使用 | 未使用 | 未使用 | 最新ユーザー入力テキスト |

Difyモードでは会話履歴・システムプロンプトを送らない。これはDify側（RAG/ワークフロー）が会話管理を担うため。

### 6.5 MODELS_LIST の挙動

```typescript
ipcMain.handle(IPC.MODELS_LIST, async () => {
  const settings = loadSettings()
  if (settings.connectionMode === 'openai')  return settings.openaiModels ?? []
  if (settings.connectionMode === 'gemini')  return settings.geminiModels ?? []
  if (settings.connectionMode === 'dify')    return []
  return listModels(settings.ollamaUrl || 'http://localhost:11434')
})
```

---

## 7. コンポーネント仕様

### 7.1 App.tsx（ルートコンポーネント）

**責務**: 全体レイアウト、タブ管理、グローバル状態保持、アバター吹き出し制御、接続モード別モデル管理

**状態**:

| 状態 | 型 | 説明 |
|------|-----|------|
| `motion` | `MotionName` | アクティブタブのアバターモーション |
| `settings` | `AppSettings \| null` | アプリ設定（初期ロード中はnull） |
| `bgDataUrl` | `string` | 背景画像のBase64 data URL |
| `models` | `string[]` | モデル一覧（モードにより取得元が異なる） |
| `ollamaOnline` | `boolean \| null` | バックエンド接続状態 |
| `avatarMessage` | `string \| null` | 吹き出しテキスト（null=非表示） |
| `tabs` | `TabInfo[]` | タブ一覧（最大5件） |
| `activeTabId` | `string` | アクティブタブID |
| `rightTab` | `'avatar' \| 'collection'` | 右ペインタブ（`localStorage`永続化、キー: `hotori.rightTab`） |
| `rightWidth` | `number` | 右ペイン幅px（`localStorage`永続化、キー: `hotori.rightWidth`、MIN:180/MAX:400/DEFAULT:220） |

**右ペイン縦タブ（v0.2.2追加）**:
- `🧑 アバター` / `📚 コレクション` の2タブで右ペインを切り替え
- リサイズハンドル（`resizer`）で右ペイン幅を変更可能

**モデル一覧取得ロジック（`useEffect` / `handleSettingsSave`）**:

```typescript
if (connectionMode === 'openai') {
  setModels(settings.openaiModels ?? [])
  setOllamaOnline((settings.openaiModels ?? []).length > 0 ? true : null)
} else if (connectionMode === 'gemini') {
  setModels(settings.geminiModels ?? [])
  setOllamaOnline(!!settings.geminiApiKey ? true : null)
} else if (connectionMode === 'dify') {
  setModels([])
  setOllamaOnline(!!settings.difyApiKey ? true : null)
} else {
  // ollama
  api.listModels().then(m => { setModels(m); setOllamaOnline(m.length > 0) })
}
```

依存配列: `[settings?.connectionMode, settings?.openaiModels, settings?.ollamaUrl, settings?.difyApiKey, settings?.geminiApiKey, settings?.geminiModels]`

**`isOffline` 判定**:

```typescript
const isOffline =
  connectionMode === 'openai'  ? openaiModels.length === 0 || !openaiApiKey
  : connectionMode === 'gemini' ? geminiModels.length === 0 || !geminiApiKey
  : connectionMode === 'dify'   ? !difyApiKey
  : ollamaOnline === false
```

**`resolvedSettings`**（`Chat.tsx` に渡す設定）:

```typescript
// OpenAIモード: defaultModel を登録済みOpenAIモデルの先頭に差し替え
// Geminiモード: defaultModel を登録済みGeminiモデルの先頭に差し替え
// Dify / Ollama: そのまま渡す
const resolvedSettings =
  connectionMode === 'openai'
    ? { ...settings, defaultModel: openaiModels[0] ?? settings.defaultModel }
  : connectionMode === 'gemini'
    ? { ...settings, defaultModel: geminiModels[0] ?? settings.defaultModel }
  : settings
```

**Ref**:

| Ref | 型 | 用途 |
|-----|-----|------|
| `avatarMsgTimerRef` | `ReturnType<typeof setTimeout> \| null` | 吹き出し遅延タイマー |
| `isFirstResponse` | `boolean` | 初回レスポンスではタイマーを起動しない |
| `isPraiseRoute` | `boolean` | praiseルート中はneutral→タイマーをスキップ |

**タブ管理ルール**:
- 最大5タブ。6枚目追加で右端（最古）を自動削除（`const MAX_TABS = 5`）
- 新タブは常に左端に追加（＋ボタンも左端）
- タブを閉じてもセッションDBは削除しない
- 最後の1枚を閉じると内容を新セッションにリセット
- 非アクティブタブは `display: none` でマウント維持（状態保持）
- タブ切替・新規タブ・タブ閉じ時に `resetAvatarMessage()` を呼ぶ
- `TabInfo` に `sessionId?` を保持し、セッション削除時に対応タブを閉じる（v0.2.1追加）

**v0.2.1追加 Props・コールバック**:

```typescript
// Chat.tsx → App.tsx へのセッション開始通知
onSessionStart?: (tabId: string, sessionId: string, title: string) => void

// SessionsModal → App.tsx への削除通知
// closeTabBySessionId(sessionId) が対応タブを閉じる
onDeleteSession?: (sessionId: string) => void
```

### 7.2 Chat.tsx

**責務**: メッセージ送受信、ストリーミング表示、セッション管理、評価、理解ワード検知、吹き出し表示、Difyモード対応

**Props**:

```typescript
interface Props {
  tabId: string
  settings: AppSettings
  models: string[]
  onMotionChange: (motion: MotionName) => void
  onSessionTitleChange: (tabId: string, title: string) => void
  onClearChat?: () => void
  onPraiseReaction?: () => void
  avatarMessage?: string | null
  onSessionStart?: (tabId: string, sessionId: string, title: string) => void  // v0.2.1追加
  // コレクション機能（v0.2.2追加）
  // AddToCollectionPopup を Chat.tsx 内で使用。🎛️ ボタンからコレクション選択ポップアップを表示
}
```

**重要な状態・Ref**:

| 名前 | 種別 | 用途 |
|-----|-----|------|
| `selectedModel` | state | 現在選択中のモデル名 |
| `sessionCreated` | state | セッション開始済みフラグ |
| `sessionModeRef` | Ref | セッション開始時の `connectionMode` を記憶（v0.2.4追加）。セッション中は固定 |
| `sessionModelsRef` | Ref | セッション開始時のモデルリストを記憶（v0.2.4追加）。セッション中は固定 |
| `currentRequestId` | Ref | 進行中ストリームのID |
| `accumulatedContent` | Ref | ストリーム中の全文蓄積（非同期問題回避） |
| `assistantMsgId` | Ref | UIとDBで同一IDを保持 |
| `motionTimerRef` | Ref | neutral遷移タイマー |

**`selectedModel` 追従 `useEffect`**:

```typescript
// settings.defaultModel が変わったとき（接続モード切り替え時）に追従
// ただしセッション開始後は変えない
useEffect(() => {
  if (!sessionCreated) setSelectedModel(settings.defaultModel)
}, [settings.defaultModel])
```

**セッション中接続モード・モデルリスト固定（v0.2.4追加）**:

```typescript
// 初回メッセージ送信時にセッションのモード・モデルリストを固定する
if (!sessionModeRef.current) {
  sessionModeRef.current = settings.connectionMode
  sessionModelsRef.current = models  // セッション開始時のモデルリストを記憶
}
const currentMode = sessionModeRef.current  // 以降はこれを使う

// セッションリセット（クリア）時にリセット
sessionModeRef.current   = null
sessionModelsRef.current = []
```

- `sessionModeRef` は `useRef<ConnectionMode | null>(null)` で初期化
- `sessionModelsRef` は `useRef<string[]>([])` で初期化
- 初回送信時に `settings.connectionMode` と `models` を記憶し、以降のすべての分岐でこの値を使う
- セッション中に設定でモードを変更しても `sessionModeRef.current` / `sessionModelsRef.current` は変わらない
- クリアボタン時に両 Ref を `null` / `[]` にリセット
- モデルバーのモデルリストはセッション中 `sessionModelsRef.current` を使用（設定変更の影響を受けない）

**モデルバーUI（v0.2.4更新）**:

セッション開始後、モデルセレクタと同デザイン（`modelSelect` クラス）で接続モード名を読み取り専用表示（`cursor: default` / `opacity: 0.75`）。セッション中もモデルセレクタは変更可能（`disabled={isStreaming}` のみ）。モデルリストはセッション開始時の `sessionModelsRef.current` で固定。

```
[🦙 Ollama] [gemma3:1b ▼] [🗑 クリア]   ← セッション中
[🤖 OpenAI] [gpt-5-nano-2025-08-07 ▼] [🗑 クリア]
[⚡ Dify] [🗑 クリア]                    ← Difyはモデルセレクタ非表示
```

- セッション未開始時: 接続モード表示なし（モデルセレクタのみ）
- セッション開始後: 接続モードを左端に固定表示
- Difyモード: モデルセレクタは非表示
- 1モデルのみ: ラベル表示、複数モデル: セレクタ表示

**エラーメッセージ（v0.2.4更新）**:

エラー発生時、原因に応じたヒントを末尾に付加する。

```typescript
const modeHint = sessionModeRef.current !== settings.connectionMode
  ? '\n\n接続モードがセッション開始時から変更されています。チャットをクリアして新しいセッションを開始してください。'
  : '\n\n接続モードやAPIキー・モデル名の設定をご確認ください。'
```

- 接続モードがセッション開始時から変わっている場合: クリアして新しいセッションを促す
- 通常のエラー: 接続モード・APIキー・モデル名の確認を促す

```typescript
const isDify = settings.connectionMode === 'dify'

// モデル名解決（CSVのmodel列に記録する値）
const resolveModelName = (): string => isDify ? 'Dify' : selectedModel

// 送信
if (isDify) {
  api.chatStart({ requestId, model: '', distance, messages: [], userQuery: text })
} else {
  const systemPrompt = buildSystemPrompt(distance, toneTagEnabled)
  const history = messages.map(m => ({ role: m.role, content: m.content }))
  api.chatStart({ requestId, model: selectedModel, distance,
    messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: text }] })
}
```

**モデルバーUI**:
- Difyモード: `⚡ Dify` バッジを表示（モデルセレクタは非表示）
- 1モデルのみ: ラベル表示
- 複数モデル: セレクタ表示
- Geminiモード: 通常のモデルセレクタ表示（`✨` プレフィックスは表示しない）

**吹き出し表示条件**:

```typescript
const showAvatarMsg = !isStreaming && !!avatarMessage
```

`messages.length` に関係なく表示（v0.2.2b修正: `messages.length === 0` 条件を削除）。
吹き出しは `messages` リストの末尾に `assistant` クラスのラッパーで表示（`max-width: 75%` が効く）。

### 7.3 SettingsModal.tsx

**接続設定セクション**:

```typescript
const CONNECTION_MODES = [
  { value: 'ollama',  label: '🦙 Ollama',  desc: 'ローカルLLM（オフライン動作）' },
  { value: 'openai',  label: '🤖 OpenAI',  desc: 'ChatGPT API / OpenAI互換API' },
  { value: 'gemini',  label: '✨ Gemini',  desc: 'Google Gemini API' },
  { value: 'dify',    label: '⚡ Dify',    desc: 'Dify API（RAG・Agent対応）' },
]
```

各モードで表示されるUI:
- **Ollama**: `ollamaUrl` テキスト入力
- **OpenAI**: `openaiApiKey`（パスワード + 表示切替）、`openaiBaseUrl`、モデル管理UI（チップ + プリセット + 手動追加）
- **Gemini**: `geminiBaseUrl` テキスト入力、`geminiApiKey`（パスワード + 表示切替）、モデル管理UI（チップ + プリセット + 手動追加）
- **Dify**: `difyUrl` テキスト入力、`difyApiKey`（パスワード + 表示切替）

**Gemini設定UIの詳細（v0.2.3追加）**:
```typescript
// ✨ Gemini セクション（connectionMode === 'gemini' のとき表示）
// APIキー取得先: https://aistudio.google.com/app/apikey
<label>Gemini API Key</label>
<input type="password" value={draft.geminiApiKey} ... />
<button>👁 表示切替</button>

<label>Base URL</label>
<input type="text" value={draft.geminiBaseUrl} ... />
// デフォルト: https://generativelanguage.googleapis.com/v1beta/
// Googleのエンドポイント変更に備えて手動で変更可能

// モデル管理（OpenAIモードと同一UI構造）
// プリセット: GEMINI_PRESET_MODELS から選択して追加
// チップ: 登録済みモデルを削除可能
// 手動追加: テキスト入力で任意モデルを追加
```

**接続モード選択**:
接続モードの選択UIはボタングリッド（`distanceGrid` / `distanceBtn` / `selected` を流用）。
4モードのボタンを横並びで表示し、選択中は `selected` クラスで強調。`<select>` プルダウンは使用しない（ダークモードでの文字色制御が困難なため）。

**距離感設定セクション（v0.2.4変更）**:

```typescript
// 🎭 距離感（AIのトーン） セクション（toneTagと同じUIパターン）
<input type="checkbox" checked={draft.distanceEnabled} />
<label>距離感 → システムプロンプトへの反映を有効にする</label>
// ヒント: 「オンにすると、選択した距離感がシステムプロンプトに反映されます。」

// distanceEnabled=true のときのみ距離感ボタングリッドを表示
// ボタングリッドはv0.2.3と同じ固定5種（編集・削除・追加機能なし）
```

**`maxCollections` 設定セクション（v0.2.2追加）**:

```typescript
// 📚 学習コレクション セクション
<input type="number" value={draft.maxCollections ?? 10} min={1} />
// ヒント: 「目安は20程度です」
```

**`draft` 初期化（後方互換）**:

```typescript
const [draft, setDraft] = useState<AppSettings>({
  difyUrl: 'https://api.dify.ai/v1',
  difyApiKey: '',
  geminiApiKey: '',                                              // v0.2.3追加
  geminiModels: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'], // v0.2.3追加
  geminiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/', // v0.2.3追加
  ...settings,   // 既存設定で上書き（古いsettings.jsonにフィールドがない場合のフォールバック）
})
```

### 7.4 CollectionPanel.tsx（v0.2.2追加）

**責務**: 学習コレクションの一覧表示・操作・コレクションへのペア追加

**サブコンポーネント**:

| コンポーネント | 説明 |
|---|---|
| `CollectionPanel` | パネル本体（default export） |
| `AddToCollectionPopup` | Chat.tsxから呼び出す「コレクションに追加」ポップアップ（named export） |
| `PairPicker` | セッション一覧→メッセージ展開→チェックボックス選択によるペア追加UI |

**CollectionPanel の状態**:

| 状態 | 型 | 説明 |
|------|-----|------|
| `collections` | `MixingCollection[]` | コレクション一覧 |
| `pairs` | `Record<string, MixingPair[]>` | 展開済みコレクションのペアキャッシュ |
| `expanded` | `Set<string>` | 展開中コレクションID |
| `reloading` | `boolean` | 再読み込み中フラグ（ヘッダーの↻ボタン制御） |

**再読み込みボタン（v0.2.2実装）**:
- ヘッダー右端に `↻` ボタン配置
- クリック中は CSS `@keyframes spin` で回転アニメーション
- コレクション一覧 + 展開済みペアを同時に再取得

**ドラッグ&ドロップ並び替え**:
- HTML5 DnD API（`draggable`, `onDragStart`, `onDragOver`, `onDrop`）
- 完了時に `COLLECTION_REORDER` IPCで永続化

**コレクションCSVエクスポート形式**:

```
collection_name,order,session_title,session_date,model,rating,user_content,assistant_content
Python基礎,1,2026/03/07 10:00,2026-03-07T01:00:00Z,gemma3:1b,good,"質問テキスト","回答テキスト"
```

- `collection_name`: コレクション名
- `order`: ペアの並び順（1始まり）
- BOM付きUTF-8
- ファイル名: `collection_{コレクション名}_{YYYY-MM-DD}.csv`

**AddToCollectionPopup の動作**:
1. Chat.tsx の 🎛️ ボタンをクリックするとポップアップ表示
2. 既存コレクション一覧から選択 → 最後のuser/assistantペアを追加
3. 新規コレクション名を入力して作成 → 即時追加
4. 追加完了後トースト通知（2.5秒）

### 7.5 OllamaGuide.tsx

`connectionMode` に応じてガイドメッセージを切り替える:
- `ollama`: Ollama 未起動ガイド
- `openai`: APIキー・モデル未設定ガイド
- `gemini`: APIキー・モデル未設定ガイド（APIキー取得先: https://aistudio.google.com/app/apikey）
- `dify`: APIキー未設定ガイド

---

## 8. 設定仕様

### 8.1 設定項目一覧

| キー | 型 | デフォルト | 説明 |
|------|-----|-----------|------|
| `connectionMode` | `ConnectionMode` | `'ollama'` | 接続モード |
| `ollamaUrl` | `string` | `'http://localhost:11434'` | Ollama エンドポイント |
| `openaiApiKey` | `string` | `''` | OpenAI APIキー |
| `openaiModels` | `string[]` | `['gpt-5-nano-2025-08-07', 'gpt-4.1-nano-2025-04-14']` | 登録モデル一覧 |
| `openaiBaseUrl` | `string` | `'https://api.openai.com'` | OpenAI互換エンドポイント |
| `difyUrl` | `string` | `'https://api.dify.ai/v1'` | Dify エンドポイント |
| `difyApiKey` | `string` | `''` | Dify APIキー |
| `geminiApiKey` | `string` | `''` | Gemini APIキー（v0.2.3追加） |
| `geminiModels` | `string[]` | `['gemini-2.5-flash', 'gemini-2.5-flash-lite']` | 登録Geminiモデル一覧（v0.2.3追加） |
| `geminiBaseUrl` | `string` | `'https://generativelanguage.googleapis.com/v1beta/'` | GeminiエンドポイントURL（v0.2.3追加） |
| `avatarPath` | `string` | `''` | アバターPNGフォルダパス（空=デフォルト） |
| `backgroundImagePath` | `string` | `''` | 背景画像パス（空=なし） |
| `theme` | `'light'\|'dark'\|'auto'` | `'auto'` | テーマ |
| `distance` | `Distance` | `'tutor'` | AIのトーン・距離感 |
| `distanceEnabled` | `boolean` | `false` | 距離感機能の有効化（v0.2.4追加、デフォルトオフ） |
| `reducedMotion` | `boolean` | `false` | アニメーション軽減 |
| `defaultModel` | `string` | `'gemma3:1b'` | デフォルト使用モデル |
| `streamTimeout` | `number` | `60` | ストリームタイムアウト（秒） |
| `toneTagEnabled` | `boolean` | `false` | toneTag機能 on/off（v0.2.4: デフォルトオフに変更） |
| `enabledMotions` | `MotionName[]` | `[]` | 有効モーション（v0.2.4: デフォルト空に変更） |
| `understandingWordsEnabled` | `boolean` | `true` | 理解ワード機能 on/off |
| `understandingWords` | `string[]` | デフォルト11語 | 理解・納得ワード一覧 |
| `maxCollections` | `number` | `10` | コレクション最大件数（v0.2.2追加） |

### 8.2 Distance（距離感）定義

| 値 | 説明 |
|---|---|
| `friend` | タメ口・フレンドリー |
| `tutor` | 丁寧・家庭教師的（デフォルト） |
| `buddy` | 気さくな先輩 |
| `calm` | 落ち着いた・簡潔 |
| `cheerful` | 明るく励ます |

`distanceEnabled=false` のとき、システムプロンプトに `距離感={distance}` の指示を含めない。

---

## 9. セッション・ログ仕様

### 9.1 セッション管理

- セッションIDは `genId()`（タイムスタンプ + 乱数）で生成
- タイトルは初回メッセージ送信時に日時文字列 `YYYY/MM/DD HH:mm` で設定
- タブを閉じてもDBのセッションは保持

### 9.2 メッセージ保存フロー

```
1. ユーザー送信 → UIに即時反映
2. api.createSession（未作成時のみ）
3. api.appendMessage（userメッセージ）
4. ストリーミング開始（Ollama / OpenAI / Gemini / Dify）
5. 完了時: api.appendMessage（assistantメッセージ、tone・ttft_ms付き）
```

### 9.3 CSVエクスポート

```typescript
// ヘッダー
const header = 'session_id,created_at,role,model,distance,ttft_ms,rating,content'

// 各行
[session_id, created_at, role, model, distance, ttft_ms, rating, `"${content}"`].join(',')

// 出力
fs.writeFileSync(outputPath, '\uFEFF' + [header, ...rows].join('\n'), 'utf-8')
// BOM付きUTF-8
```

### 9.4 蒸留ワークフロー（コレクション機能と連携）

```
① OpenAI / Gemini / Dify / Ollama モードで応答を生成
② チャット中に気になった Q&A ペアをコレクション機能（バックログ）で科目名・技術名などの
   任意の分類名に仕分けして蓄積
③ コレクション単位で CSV エクスポート
④ CSV をファインチューニング用データセットに変換
⑤ Ollama モードでローカルモデルに蒸留
```

> **v0.2.2**: コレクション機能が実装済み。`CollectionPanel` からQ&Aペアをコレクションに追加し、コレクション単位でCSVエクスポートできる。

---

## 10. アバター仕様

### 10.1 PNG静止画モード

- フォルダ内の `{motionName}.png` を IPC 経由で Base64 読み込み
- 5種類のモーション: `neutral` / `think` / `explain` / `praise` / `ask`
- `neutral` は常時有効（フォールバック先）
- `enabledMotions` に含まれないモーションは `neutral` にフォールバック

### 10.2 推奨アバター画像仕様

| 項目 | 推奨値 |
|------|--------|
| アスペクト比 | 1:1.8（縦長）|
| 解像度 | 600×1080px 以上 |
| 構図 | 全身または上半身（縦長ペインに収まるよう） |

現行同梱画像（約1:2.5比率）はペインに対して横に引き伸びて表示される問題があるため、再作成が推奨。

### 10.3 モーション遷移タイミング

| タイミング | モーション |
|---|---|
| ユーザー送信（toneTagEnabled=true） | `think` |
| ストリーミング中 | `think` のまま |
| レスポンス完了 | toneTagに従う |
| 完了から3秒後 | `neutral` |
| 理解・納得ワード入力 | `praise`（2秒）→ `neutral` → `ask` |
| レスポンス完了から10秒後 | `ask` + アバターメッセージ表示 |
| エラー・クリア・タブ切替 | `neutral` |

---

## 11. システムプロンプト仕様

Ollama / OpenAI / Gemini モードのみ送信。Dify モードでは送信しない（Dify 管理画面のシステムプロンプトと競合するため）。

```
あなたは"学習支援に特化したAIコーチ"です。以下を厳守してください：
- 宗教・文化・価値観・恋愛について中立で、押し付けない。
- 親しみは示すが、依存を助長しない。学習行動につながる具体的提案を優先する。
- セクシャル/不適切表現は行わず、教育目的に集中する。
- 距離感（トーン）={distance} を保つ（friend/tutor/buddy/calm/cheerful）。
  （distanceEnabled=false のとき: この行はシステムプロンプトから除外する）
- 回答は簡潔→必要なら箇条書き→最後に次アクション（小さな一歩）を示す。
- 応答の最後に **必ず** 1つだけ toneTag を出力する。形式: `<toneTag name="MOTION" />` （MOTION は neutral / think / explain / praise / ask のいずれか1つ）（v0.2.2b修正: バッククォートで囲んだパイプ区切りサンプルを廃止し、モデルの誤模倣を防止）
  （toneTagEnabled=false のとき: toneTagは出力しないよう指示が変わる）
- 不明点は確認質問を返し、推測で断定しない。
```

`buildSystemPrompt(distance, toneTagEnabled)` で生成（`renderer/src/utils/systemPrompt.ts`）。

---

## 12. toneTagパーサー仕様

### 12.1 対応フォーマット

```typescript
// 正規形（XML属性・Markdown太字ラップ含む）
const TONE_TAG = /\*{0,2}\s*<toneTag\b[^>]*>\s*\*{0,2}/g
const TONE_VALUE = /name="([^"|>]+)/

// **<neutral|think|...>** 形式（システムプロンプトの誤模倣対策・v0.2.2b追加）
const TONE_LIST_BOLD = /\*{1,2}<(?:neutral|think|explain|praise|ask)(?:\|(?:neutral|think|explain|praise|ask))*>\*{1,2}/gi

// XML省略形
const TONE_SHORT = /<(neutral|explain|praise|ask|think)\s*\/>/gi

// 太字形式
const TONE_BARE  = /\*\*(neutral|explain|praise|ask|think)\*\*/gi

// 括弧付き形式
const TONE_PAREN = /\((neutral|explain|praise|ask|think)\)/gi
```

### 12.2 パース優先順位

1. `TONE_TAG`（正規形・Markdown太字ラップ含む）→ `name=` 属性値からパイプ区切りで最初の有効値を取得
2. `TONE_SHORT`（XML省略形）
3. `TONE_BARE`（太字単体）
4. `TONE_PAREN`（括弧付き）
5. デフォルト: `'neutral'`

**clean テキスト生成**（全パターンを順次 replace）:
```typescript
text
  .replace(TONE_TAG, '')
  .replace(TONE_LIST_BOLD, '')   // v0.2.2b追加
  .replace(TONE_SHORT, '')
  .replace(TONE_BARE, '')
  .replace(TONE_PAREN, '')
  .replace(EMPTY_LINE, '')
  .trimEnd()
```

### 12.3 既知のモデル別出力形式

| モデル | 観測された形式 |
|--------|-------------|
| gemma3:1b | `<toneTag name="neutral" />` |
| llama3.2:3b | `<toneTag name="explain" />` |
| qwen3系 | `**neutral**` / `(**neutral**)` |
| granite3.3:2b | `**explain**` / `(**explain**)` |
| （旧systemPrompt）| `**<neutral\|think\|praise\|ask>**`（v0.2.2b で `TONE_LIST_BOLD` により除去対応）|

---

## 13. アバター吹き出し仕様

### 13.1 概要

チャットエリア内にアバターからのセリフをUI演出として表示。DBへの保存は行わない。

### 13.2 表示タイミングと内容

| タイミング | テキスト | モーション |
|-----------|--------|-----------|
| セッション開始時（初期値） | 「私に何を聞きたいの？」 | neutral |
| レスポンス完了から10秒後 | 「まだ聞きたいことはあるかしら？」 | ask |
| 理解ワード検知後 | 「まだ聞きたいことはあるかしら？」 | ask |

### 13.3 非表示・リセットタイミング

- ユーザー送信時（`think` モーション遷移で null に）
- ストリーミング中（`showAvatarMsg = !isStreaming && ...`）
- `resetAvatarMessage()` 呼び出し時（タブ切替・新規タブ・クリア）

### 13.4 吹き出し制御フラグ（App.tsx）

```typescript
// isPraiseRoute: praiseルート後にneutralに戻ったとき、10秒タイマーをスキップ
// isFirstResponse: 初回レスポンス完了後のneutral遷移でタイマーを起動しない
```

### 13.5 吹き出しスタイル（Chat.module.css）

`.avatarMsgBubble` はライト・ダーク両モードで常に白文字固定。`@media (prefers-color-scheme: dark)` による上書きは不要。

```css
.avatarMsgBubble {
  background: rgba(167, 139, 250, 0.15);
  border: 1px dashed rgba(167, 139, 250, 0.5);
  color: #ffffff;   /* ライト・ダーク共通で白文字 */
  backdrop-filter: blur(12px);
}
```

---

## 14. 理解・納得ワード検知仕様

### 14.1 検知ロジック

```typescript
function buildUnderstandingRegex(words: string[]): RegExp {
  if (words.length === 0) return /(?!)/
  const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^(${escaped.join('|')})[。、！!…\\s]*$`, 'i')
}
```

### 14.2 検知時の動作フロー

```
1. ユーザーメッセージをUIに表示
2. DBにユーザーメッセージを保存（tone: 'neutral'）
3. onMotionChange('praise')
4. 2秒後: onPraiseReaction() → onMotionChange('neutral')  ← v0.2.2b: 呼び出し順を修正
   ├─ onPraiseReaction(): isPraiseRoute = true、avatarMessage = 'まだ聞きたいことはあるかしら？'、motion = 'ask'
   └─ onMotionChange('neutral'): isPraiseRoute = true のため早期 return（10秒タイマー起動しない）
```

> **v0.2.2b修正**: 旧実装では `onMotionChange('neutral')` を先に呼んでいたため、`isPraiseRoute` がまだ `false` の状態で `handleMotionChange` が実行され、10秒タイマーが起動してしまっていた。`onPraiseReaction()` を先に呼ぶことで修正。

LLMへは送信しない。アシスタントメッセージはUIにもDBにも生成されない。

### 14.3 デフォルト理解ワード

```
なるほど / わかりました / 了解 / 理解しました / そうか / なるほどね /
わかった / そっか / なるほど！ / わかりました！ / 理解できました
```

---


## 15. 学習コレクション機能仕様

### 15.1 概要

チャット中のQ&Aペア（userメッセージ + assistantメッセージの1往復）を任意の名前のコレクションに仕分けして蓄積し、コレクション単位でCSVエクスポートする機能。蒸留用データセット作成の中核。

### 15.2 型定義

```typescript
export interface MixingCollection {
  id:         string
  name:       string
  created_at: string
}

export interface MixingPair {
  id:                   string
  collection_id:        string
  session_id:           string
  user_message_id:      string
  assistant_message_id: string
  sort_order:           number
  added_at:             string
  needs_review:         number  // v0.2.4追加: 1=要確認（デフォルト）/ 0=確認済み
  // store.ts JOIN フィールド（listPairs の戻り値のみ）
  user_content?:      string
  assistant_content?: string
  session_title?:     string
  session_date?:      string
  model?:             string
  rating?:            string
}
```

### 15.3 store.ts 関数一覧

| 関数 | シグネチャ | 説明 |
|------|-----------|------|
| `listCollections` | `() => MixingCollection[]` | 作成日降順で全コレクション取得 |
| `createCollection` | `(name: string) => MixingCollection` | 新規作成 |
| `renameCollection` | `(id, name) => void` | 名前変更 |
| `deleteCollection` | `(id) => void` | 削除（ペアはCASCADE） |
| `listPairs` | `(collectionId) => MixingPair[]` | JOINで拡張情報付きペア一覧（sort_order ASC） |
| `addPair` | `(collectionId, sessionId, userMsgId, assistantMsgId) => MixingPair` | ペア追加（sort_orderは末尾） |
| `removePair` | `(pairId) => void` | ペア削除 |
| `reviewPair` | `(pairId, needsReview: boolean) => void` | 要確認フラグON/OFFを更新（v0.2.4追加） |
| `reorderPairs` | `(collectionId, orderedIds: string[]) => void` | 並び替え（sort_order再採番） |
| `exportCollectionCsv` | `(collectionId, collectionName, outputPath) => void` | CSVファイル書き出し |

### 15.4 CSVエクスポート仕様

**ヘッダー行**:
```
collection_name,order,needs_review,session_title,session_date,model,rating,user_content,assistant_content
```

**各行**:
```
"コレクション名",1,0,"2026/03/07 10:00","2026-03-07T01:00:00Z","gemma3:1b","good","質問","回答"
"コレクション名",2,1,"2026/03/07 10:05","2026-03-07T01:05:00Z","gemma3:1b","good","質問","回答"
```

- `needs_review`: `1`=要確認（ペア追加時のデフォルト）/ `0`=確認済み（v0.2.4追加）。AIの回答は原則信じないという思想のもと、利用者が内容を確認してから `0` に落とす運用を想定。スプレッドシートで `needs_review=1` をフィルタして編集対象を絞り込む
- BOM付きUTF-8（Excelでの文字化け防止）
- ファイル名デフォルト: `collection_{コレクション名}_{YYYY-MM-DD}.csv`
- `content` フィールドはダブルクォートで囲み、内部の `"` は `""` でエスケープ

### 15.5 UI仕様

#### App.tsx 右ペイン構成

```
右ペイン（幅: rightWidth, MIN:180/MAX:400/DEFAULT:220px）
├── 縦タブバー
│   ├── 🧑 アバター（タブ）
│   └── 📚 コレクション（タブ）
└── タブコンテンツ
    ├── [アバタータブ] AvatarLayer
    └── [コレクションタブ] CollectionPanel
```

#### CollectionPanel ヘッダー

```
📚 コレクション  [件数/上限]  [↻ 再読み込みボタン]
```

再読み込みボタン:
- クリックで `handleReload()` 呼び出し
- 実行中は `@keyframes spin` 回転アニメーション
- コレクション一覧 + 展開中ペア一覧を同時に再取得

#### コレクション操作

| 操作 | 方法 |
|------|------|
| 作成 | ＋ボタン → 名前入力 → Enter / 追加ボタン |
| 名前変更 | ✏️ボタン → インライン編集 |
| 削除 | 🗑️ボタン → 確認ダイアログ |
| 展開/折り畳み | コレクション行クリック |
| ペア並び替え | ドラッグ&ドロップ（HTML5 DnD） |
| ペア削除 | 各ペア行の ✕ ボタン |
| CSV出力 | 各コレクションの 📥 ボタン |
| ペア追加（PairPicker） | ➕ボタン → セッション選択 → メッセージ選択 |

#### コレクションプレビューモーダルの要確認フラグ操作（v0.2.4追加）

プレビューモーダルに「要確認フラグ」列を追加。CSVエクスポート後にスプレッドシート（Google スプレッドシート / Excel Online 等）で編集が必要な行を識別するための機能。AIの回答は原則要確認とする思想に基づきデフォルト `needs_review=1`。

```
# | セッション | モデル | 評価 | 要確認フラグ | Q（ユーザー） | A（アシスタント）
```

- プレビューモーダルを開くたびに `api.listPairs()` でDBから最新データを取得（キャッシュ不使用）
- 取得中は「読み込み中…」を表示
- 要確認フラグ列のチェックボックス操作はstateのみ変更（即時DB保存しない）
- ヘッダーの「💾 保存」ボタンで変更分（`changedIds`）をまとめてDB保存
- 変更がない場合は保存ボタンを `disabled` 表示
- 保存完了後2秒間「✅ 保存済み」と表示
- IPC `COLLECTION_REVIEW_PAIR` で Main プロセスに通知し `reviewPair()` を実行

#### Chat.tsx のコレクション追加フロー

```
1. 🎛️ ボタン（評価ボタン横）をクリック
2. AddToCollectionPopup が表示
   - 既存コレクション一覧（ラジオ的に選択）
   - 新規作成欄（名前入力 + Enter）
3. コレクション選択 → 現在の最後の user/assistant ペアを追加
4. トースト「○○ に追加しました」（2.5秒）
5. CollectionPanel の ↻ ボタンで即時反映確認
```

### 15.6 maxCollections 制御

- `AppSettings.maxCollections`（デフォルト: 10）
- `collections.length >= maxCollections` のとき ＋ボタンと `AddToCollectionPopup` の作成入力を disabled
- 設定画面「📚 学習コレクション」セクションで変更可能（数値入力、最小値:1）

## 16. 非機能要件

### 16.1 セキュリティ

| 設定 | 値 | 理由 |
|------|-----|------|
| `contextIsolation` | `true` | Renderer/Mainの隔離 |
| `nodeIntegration` | `false` | RendererからのNode.js直接アクセス禁止 |
| `sandbox` | `false` | preloadスクリプトの実行に必要 |
| APIキー保存 | `settings.json` 平文 | 個人PC専用アプリのため許容 |
| CSP `connect-src` | `'self' http://localhost:* https:` | Ollama（任意ポート）+ Dify Cloud / セルフホスト対応 |
| アバター・背景 | Base64 data URL で渡す | file:// の CSP 制約回避 |

### 16.2 パフォーマンス

- 非アクティブタブは `display: none` でマウント維持（再レンダリングなし）
- ストリーミングデルタは `accumulatedContent` Refに直接蓄積（setState非同期問題回避）
- `persistDb()` はDB操作のたびに呼び出す（データ損失防止）

### 16.3 DevTools

- 開発時も自動起動しない（`openDevTools()` 削除済み）
- 手動起動: `Ctrl+Shift+I`

---

## 17. ビルド・配布仕様

### 17.1 ビルドフロー

```
npm run build
  └─► vite build                        → dist/（Renderer成果物）
  └─► tsc -p tsconfig.electron.json     → dist-electron/（Main成果物）

npm run dist:win
  └─► electron-builder --win            → release/*.exe（NSISインストーラー）
```

### 17.2 同梱リソース

```json
"extraResources": [
  { "from": "assets", "to": "assets", "filter": ["**/*"] }
]
```

### 17.3 開発時クリーンビルド

`scripts/dev-electron.js` により `dist-electron/` を毎回削除してからビルド（古いファイルの混入防止）。

---

## 18. SDD開発ガイド（Claude向け）

### 18.1 開発の前提

1. **この仕様書を先に読む**: 変更前に必ず関連セクションを確認する
2. **型安全を守る**: `main/types.ts` を変更したら `preload.ts` / `electronAPI.ts` / 使用箇所をすべて更新する
3. **IPC定数を使う**: 文字列リテラルを直接書かず `IPC.CHAT_START` などを使う
4. **ビルド検証**: 変更後は `npm run dist:win` で TypeScript エラーがないことを確認する

### 18.2 接続モード追加手順

新しいバックエンド（例: `'anthropic'`）を追加する場合:

```
1. main/types.ts の ConnectionMode 型に追加
2. main/{newmode}.ts を新規作成（ストリーミングクライアント）
   ※ OpenAI互換APIの場合は openai.ts を再利用できるため不要
3. main/main.ts の CHAT_START / MODELS_LIST に else if を追加
4. renderer/src/components/SettingsModal.tsx の CONNECTION_MODES 配列に追加
5. renderer/src/App.tsx のモデル取得 useEffect / handleSettingsSave / isOffline / resolvedSettings に追加
6. renderer/src/components/OllamaGuide.tsx に対応メッセージを追加
7. renderer/src/utils/electronAPI.ts のフォールバック値に追加
```

### 18.2b Geminiモード実装の注意点（v0.2.3追加）

**`main/gemini.ts` の作成**:

`openai.ts` をコピーして `gemini.ts` を作成し、以下の点を変更する:

```typescript
// gemini.ts: openai.ts のコピーベース。変更点のみ示す

// ① 関数名を変更。baseUrl は引数として受け取る（設定UIで変更可能にするため）
export async function streamChatGemini(
  baseUrl: string,        // settings.geminiBaseUrl（デフォルト: https://generativelanguage.googleapis.com/v1beta/）
  apiKey: string,         // settings.geminiApiKey
  model: string,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  signal: AbortSignal,
  timeout: number
): Promise<void> {
  const url = `${baseUrl}/chat/completions`
  // 以降は openai.ts と同一ロジック（Authorization: Bearer {apiKey} もそのまま）
}
```

**main.ts での呼び出し**:

```typescript
import { streamChatGemini } from './gemini'

// CHAT_START ハンドラ内
} else if (settings.connectionMode === 'gemini') {
  await streamChatGemini(
    settings.geminiBaseUrl,
    settings.geminiApiKey,
    model,
    messages,   // systemPrompt + history（OpenAIモードと同一）
    callbacks, signal, timeout
  )
}
```

**設計上のメリット**:
- `openai.ts` と独立しているため、将来 Gemini 固有の挙動変更（エラーコード処理、レスポンス形式の差異など）を `gemini.ts` だけで対応できる
- `geminiBaseUrl` を設定UIで変更できるため、Googleがエンドポイントを変更しても設定画面から即対応可能

**⚠️ Gemini API のレート制限**:

| モデル | RPM | TPM | RPD |
|---|---|---|---|
| gemini-2.5-flash | 10 | 250,000 | 250 |
| gemini-2.5-flash-lite | 15 | 250,000 | 1,000 |

> ⚠️ **レート制限は予告なく変更される**。上記の数値はあくまで参考値。429エラーは既存の `CHAT_ERROR` IPC で自然に表示されるため追加対応不要。最新の制限は [Google AI Studio](https://aistudio.google.com) で確認のこと。

**CSV の `model` 列**: Gemini モデル名をそのまま記録（例: `gemini-2.0-flash`）。Dify の `'Dify'` 固定とは異なる。

### 18.3 設定項目追加手順

```
1. main/types.ts の AppSettings インターフェースに追加
2. main/types.ts の DEFAULT_SETTINGS にデフォルト値を追加
3. renderer/src/utils/electronAPI.ts のフォールバック値に追加
4. renderer/src/components/SettingsModal.tsx の draft 初期値とUIセクションに追加
5. 使用箇所で settings.newProp として参照
```

### 18.4 React非同期の注意点（既知のバグパターン）

```typescript
// ❌ setMessages内の変数は非同期で確定しない
setMessages(prev => { finalContent = prev[prev.length - 1].content })
await api.appendMessage({ content: finalContent })  // 空になる！

// ✅ Refに直接蓄積する
accumulatedContent.current += delta
await api.appendMessage({ content: accumulatedContent.current })  // 確実
```

### 18.5 selectedModel 追従パターン

接続モード切り替え時に `selectedModel` が古いモデル名のままになるバグを防ぐ:

```typescript
// Chat.tsx
useEffect(() => {
  if (!sessionCreated) setSelectedModel(settings.defaultModel)
}, [settings.defaultModel]) // eslint-disable-line react-hooks/exhaustive-deps
```

`App.tsx` の `resolvedSettings` で `defaultModel` を正しい値に差し替えてから `Chat.tsx` に渡すことが前提。

### 18.6 吹き出し制御の注意点

`handleMotionChange('neutral')` が通常完了・praiseルートの2経路から呼ばれるため `isPraiseRoute` Refで区別する。

```typescript
// Chat.tsx: praiseルートのタイマー内（v0.2.2b修正: onPraiseReaction を先に呼ぶ）
motionTimerRef.current = setTimeout(() => {
  onPraiseReaction?.()      // ← 先に isPraiseRoute = true をセット
  onMotionChange('neutral') // ← その後 neutral に遷移
}, 2000)

// App.tsx: handlePraiseReaction
isPraiseRoute.current = true
setAvatarMessage('まだ聞きたいことはあるかしら？')
setMotion('ask')

// App.tsx: handleMotionChange内
if (m === 'neutral' && isPraiseRoute.current) {
  isPraiseRoute.current = false
  return  // 10秒タイマーを起動しない
}
```

> ⚠️ **順序が逆になるとバグになる**: `onMotionChange('neutral')` を先に呼ぶと、`isPraiseRoute` がまだ `false` のまま `handleMotionChange` が実行され、10秒タイマーが起動してしまう。

### 18.7 toneTagパーサーの拡張方法

```typescript
// parseTone.ts に新パターンを追加
const TONE_NEW = /新しいパターンの正規表現/g

// parseToneTagged 内の優先順位に応じて追加
// clean の replace chain にも追加する
const clean = text
  .replace(TONE_TAG, '').replace(TONE_SHORT, '')
  .replace(TONE_BARE, '').replace(TONE_PAREN, '')
  .replace(TONE_NEW, '')  // ← 追加
  .replace(EMPTY_LINE, '').trimEnd()
```

### 18.8 DBスキーマ変更時の注意

```typescript
// initStore() 内でマイグレーション
try { db.run('ALTER TABLE messages ADD COLUMN new_col TEXT') } catch {}
// 既存カラムがある場合のエラーを無視してOK
```

### 18.9 ハードコード値一覧

| 項目 | ファイル | 値 |
|---|---|---|
| タブ最大数 | `App.tsx` | `const MAX_TABS = 5` |
| neutral 遷移タイマー | `Chat.tsx` | `setTimeout(..., 3000)` |
| praise 後の neutral 遷移 | `Chat.tsx` | `setTimeout(..., 2000)` |
| フォロー吹き出し待機時間 | `App.tsx` | `setTimeout(..., 10_000)` |
| コレクション追加トースト表示時間 | `Chat.tsx` | `setTimeout(..., 2500)` |
| 右ペイン幅デフォルト | `App.tsx` | `220` px（MIN:180 / MAX:400）|

### 18.10 バージョン管理規則

| 変更種別 | バージョン例 | 内容 |
|---------|------------|------|
| 機能追加 | v0.1.9 → v0.2.0 | 新機能・UI変更 |
| バグ修正 | v0.2.0 → v0.2.0b | 同一機能の不具合修正 |
| 小さな修正 | v0.2.0b → v0.2.0c | 1〜2ファイルの局所修正 |

**`package.json` との同期**:

SDD バージョンと `package.json` の `version` フィールドは常に一致させる。

```json
{
  "name": "learning-assistant-hotori",
  "version": "0.2.4"
}
```

- SDD を更新するたびに `package.json` の `version` も同じ番号に更新する
- サフィックス（`b`, `c` など）はバグ修正を示すが、`package.json` はセマンティックバージョン形式のみ受け付けるため、サフィックス付きの場合は数値部分のみ記載する（例: `v0.2.0b` → `"version": "0.2.0"`）
- `npm run dist:win` のビルド成果物のインストーラーファイル名にもこのバージョンが反映される

アーカイブ: `learning-assistant-v{version}.zip`（`node_modules` / `dist-electron` / `dist` を除外）

### 18.11 変更履歴

| バージョン | 内容 |
|---|---|
| **v0.2.4** | **距離感機能の有効化**: `AppSettings.distanceEnabled` 追加（デフォルト `false`）。toneTagと同じチェックボックスUIパターン。`distanceEnabled=false` のときシステムプロンプトから距離感指示を除外。`Distance` 型・プリセット5種はv0.2.3から変更なし。`buildSystemPrompt` の引数に `distanceEnabled` 追加。`SettingsModal.tsx` に距離感有効化チェックボックスUI追加（オンのときのみ距離感ボタングリッドを表示）。`electronAPI.ts` フォールバック値に `distanceEnabled: false` 追加。**要確認フラグ機能**: `mixing_pairs` に `needs_review INTEGER NOT NULL DEFAULT 1` カラム追加。既存DBへのマイグレーション（`ALTER TABLE ... ADD COLUMN` を try/catch）。ペア追加時は常に `needs_review=1`（要確認）。`MixingPair` 型に `needs_review: number` フィールド追加。`reviewPair(pairId, needsReview: boolean)` 関数追加。IPC `COLLECTION_REVIEW_PAIR` 追加（`preload.ts` / `main.ts` / `electronAPI.ts` すべて対応）。コレクションプレビューモーダルに「要確認フラグ」列を追加しチェックボックスで操作。プレビューモーダルを開くたびに `api.listPairs()` でDBから最新データを取得（キャッシュ不使用）。「💾 保存」ボタンで変更分をまとめてDB保存。CSVエクスポートに `needs_review` カラム追加。AIの回答は原則要確認とする思想に基づきデフォルト1。**セッション中接続モード固定（バグ修正）**: `Chat.tsx` に `sessionModeRef: useRef<ConnectionMode \| null>` と `sessionModelsRef: useRef<string[]>` を追加。初回送信時に接続モードとモデルリストを記憶し以降固定。クリア時に両 Ref をリセット。セッション中に設定で接続モードを変更してもモデルリストは変わらない。**モデルバーUI改善**: セッション開始後、モデルセレクタと同デザインで接続モード名を読み取り専用表示（`opacity: 0.75`）。セッション中もモデルセレクタは変更可能。モデルリストはセッション開始時の `sessionModelsRef.current` で固定。**エラーメッセージ改善**: エラー発生時、接続モードがセッション開始時から変更されている場合は「クリアして新しいセッションを開始してください」、通常エラーは「接続モードやAPIキー・モデル名の設定をご確認ください」をヒントとして末尾に付加。**依存更新**: `electron` `^33.0.0` → `^40.8.0`、`electron-builder` `^25.1.8` → `^26.8.1`、`npm overrides`（glob / tar）削除済み、`npm audit` で `found 0 vulnerabilities` 確認済み。**デフォルト変更（実施済み）**: `toneTagEnabled` → `false`、`enabledMotions` → `[]`。**タブ数の設定化（`maxTabs`）はバックログに先送り**。 |
| **v0.2.3** | Gemini API 対応追加。`ConnectionMode` に `'gemini'` 追加。`AppSettings` に `geminiApiKey` / `geminiModels` / `geminiBaseUrl` 追加。`GEMINI_PRESET_MODELS` 定数追加（`gemini-2.5-flash` / `gemini-2.5-flash-lite`）。`main/gemini.ts` 新規作成（`openai.ts` のコピーベース、関数名を `streamChatGemini` に変更、URLパスは `${normalizedBase}chat/completions`、`/v1/` を挟まない）。`main/main.ts` の `CHAT_START` / `MODELS_LIST` に Gemini 分岐追加。`SettingsModal.tsx` に `✨ Gemini` モード追加（APIキー入力・Base URL入力・モデル管理UI）。接続モード選択UIを `<select>` プルダウンからボタングリッド（`distanceBtn` 流用）に変更（ダークモードでの文字色問題を解消）。`App.tsx` のモデル取得ロジック / `isOffline` 判定 / `resolvedSettings` / 依存配列に Gemini 対応追加。`OllamaGuide.tsx` に Gemini 未設定ガイドを追加。`electronAPI.ts` フォールバック値に `geminiApiKey: ''` / `geminiModels: []` / `geminiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/'` 追加。`Chat.module.css` の `.avatarMsgBubble` を白文字固定（`color: #ffffff`）に変更、`@media (prefers-color-scheme: dark)` 上書きを削除。 |
| **v0.2.2** | 学習コレクション機能追加。`mixing_collections` / `mixing_pairs` テーブル追加。`CollectionPanel.tsx` / `CollectionPanel.module.css` 新規作成。Chat.tsx に🎛️ボタン + `AddToCollectionPopup` 追加。App.tsx に右ペイン縦タブ（アバター/コレクション）とリサイズハンドル追加（`localStorage`永続化）。`AppSettings` に `maxCollections` 追加。`SettingsModal.tsx` の接続モード選択をボタングリッドから `<select>` プルダウンに変更。`SettingsModal.tsx` のCSSクラス名を既存 `Modal.module.css` に合わせて修正（デザイン崩れ修正）。IPC定数9種追加（`COLLECTION_*`）。CollectionPanelのヘッダーに再読み込みボタン（↻, スピンアニメーション付き）追加。バグ修正: ①理解ワード検知後の吹き出し表示（`onPraiseReaction` 呼び出し順・`showAvatarMsg` 条件修正）。②`systemPrompt.ts` toneTag指示文を自然言語化（モデルの誤模倣防止）。③`parseTone.ts` `TONE_LIST_BOLD` パターン追加。 |
| **v0.2.1** | セッション詳細プレビュー追加。セッション履歴モーダルに 👁 ボタンを追加し、メッセージ一覧（時刻・役割・評価・モデル・内容）をモーダル内で確認できるようになった。メッセージ行クリックで全文展開。詳細ビューからCSVエクスポート・削除操作が可能。セッションを削除すると対応するタブも同時に閉じるよう動作を変更。「すべてクリア」確認文に削除対象の件数を表示。IPC `logs:getSessionMessages` 追加。`TabInfo` に `sessionId?` 追加。`Chat.tsx` に `onSessionStart` コールバック追加。 |
| **v0.2.0** | Dify API 連携追加（RAG / Agent 両対応、Chatbot / Agent アプリタイプ自動判別）。`ConnectionMode` に `'dify'` 追加。`AppSettings` に `difyUrl` / `difyApiKey` 追加。`ChatStartPayload` に `userQuery?` 追加。`main/dify.ts` 新規作成。CSP `connect-src` を `http://localhost:* https:` に拡張。`selectedModel` が接続モード切り替え時に追従しないバグ修正（`useEffect` 追加）。`DEFAULT_SETTINGS.defaultModel` を `'gemma3:1b'` に変更。 |
| v0.1.9b | `store.ts` CSVに `session_id` / `model` カラム追加。OpenAIモードで `defaultModel` が Ollama用モデル名のまま送信されるバグ修正（`resolvedSettings` 導入）。OpenAI初期プリセットを `gpt-5-nano-2025-08-07` / `gpt-4.1-nano-2025-04-14` に変更。`types.ts` の `Session` / `Message` 型にフィールド追加（ビルドエラー修正）。 |
| v0.1.9 | OpenAI API 対応。デュアルバックエンド実装。`main/openai.ts` 新規追加。設定画面に OpenAI 設定UI追加。 |
| v0.1.8e | 理解・納得ワード機能。toneTag連携 on/off。使用モーション選択。接続モード基盤。 |

### 18.12 バックログ

| 優先度 | 機能 | 概要 |
|---|---|---|
| Low | タブ数の設定化 | `AppSettings.maxTabs` 追加、`MAX_TABS` 定数廃止（現行5固定で問題なし） |
| Low | ShareGPT変換ツール | コレクションCSVエクスポートをShareGPT構造（`conversations` 形式）に変換するツール |
| Low | コレクションメモ機能 | コレクション単位の目的・概要メモ。`mixing_collections` に `memo TEXT` カラム追加、モーダルで表示・編集 |
| Low | コレクションのペア検索機能 | プレビューモーダル内でQ/A内容をキーワード検索・絞り込み |
| Low | コレクション間のペア移動 | プレビューモーダルから別コレクションへペアを移動 |
| Low | コレクションのペア編集機能 | プレビューモーダル上でQ/Aの内容を直接編集・保存。元データはセッション履歴に残るため削除・再追加で復元可能 |
| Low | アバター画像再作成 | 1:1.8 比率・600×1080px 以上での再作成（現行1:2.5は表示崩れあり）。背景画像が主役となった現在は優先度低 |
| Low | アバター機能の検討 | コレクション機能・背景画像の存在を踏まえ、アバター機能の要否を整理。**残す**: 理解ワード検知による吹き出し反応（LLMにはできないユーザー発話への反応であり独自価値）。**検討**: モーション・トーンタグ（トーンタグはデフォルトオフ済み）。**不要寄り**: アバター画像の高品質化（背景画像が主役のため）。 |
| Low | モデル自動更新 | 定期的にOllamaのモデル一覧を再取得し、アプリ再起動なしで反映 |
| Low | 吹き出しメッセージカスタマイズ | 設定画面でテキストを変更可能に |

---

