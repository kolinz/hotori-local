# 学習アシスタント Hotori — ソフトウェア設計仕様書 (SDD)
**バージョン**: 0.1.9b
**作成日**: 2026-03-03
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
12. [非機能要件](#12-非機能要件)
13. [ビルド・配布仕様](#13-ビルド配布仕様)
14. [SDD開発ガイド（Claude向け）](#14-sdd開発ガイドclaude向け)

---

## 1. プロジェクト概要

### 1.1 アプリケーション概要

| 項目 | 内容 |
|------|------|
| アプリ名 | 学習アシスタント Hotori |
| 目的 | ローカルLLM（Ollama）またはOpenAI APIを使った学習支援デスクトップアプリ |
| 対象OS | Windows（主）、macOS、Linux |
| 配布形式 | NSIS インストーラー（Win）、DMG（Mac）、AppImage（Linux） |
| ネットワーク | Ollamaモード: 完全オフライン動作 / OpenAIモード: インターネット接続必要 |

### 1.2 主要機能

- **マルチタブチャット**: 最大5タブの並列セッション管理
- **ストリーミング応答**: Ollama / OpenAI API経由のリアルタイムトークン表示
- **デュアルバックエンド**: Ollama（ローカル）/ OpenAI API の切り替え
- **アバター表情制御**: 応答の感情モーションに連動したPNG切り替え
- **理解・納得ワード機能**: 指定ワード入力時にpraiseモーションで即時反応
- **セッションログ**: SQLite（sql.js）による会話履歴の永続化
- **CSVエクスポート**: セッション単位でのデータエクスポート（評価・モデル名付き）
- **応答評価**: Good/Not Good の2値評価とログへの記録
- **蒸留ワークフロー対応**: OpenAIで生成→good評価→CSV出力→ファインチューニングデータ化

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
  "electron": "^33.0.0",
  "electron-builder": "^25.1.8",
  "vite": "^6.3.0",
  "@vitejs/plugin-react": "^4.3.0",
  "typescript": "^5.7.0",
  "concurrently": "^9.2.0",
  "wait-on": "^8.0.3",
  "vitest": "^3.0.0"
}
```

### 2.2 開発コマンド

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
┌─────────────────────────────────────────────────────────────┐
│                   Electron Main Process                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ main.ts  │  │ollama.ts │  │openai.ts │  │  store.ts  │  │
│  │ IPC Hub  │  │HTTP Client│  │HTTP Client│  │ sql.js DB  │  │
│  └────┬─────┘  └──────────┘  └──────────┘  └────────────┘  │
│       │ contextBridge (preload.ts)                           │
└───────┼─────────────────────────────────────────────────────┘
        │ IPC（invoke / send / on）
┌───────┼─────────────────────────────────────────────────────┐
│       │         Electron Renderer Process                   │
│  ┌────┴──────────────────────────────────────────────────┐  │
│  │  React + Vite (TypeScript)                            │  │
│  │  App.tsx → Chat.tsx / AvatarLayer.tsx                 │  │
│  │           SettingsModal / SessionsModal               │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
        │
┌───────┴──────────────────────────────────────────┐
│  バックエンド（接続モードで切り替え）                 │
│  Ollama  http://localhost:11434 （変更可）           │
│  OpenAI  https://api.openai.com （変更可）           │
└──────────────────────────────────────────────────┘
```

### 3.2 接続モード分岐

`main/main.ts` の `CHAT_START` / `MODELS_LIST` ハンドラで `settings.connectionMode` を参照して分岐する。

```typescript
if (settings.connectionMode === 'openai') {
  await streamChatOpenAI(baseUrl, apiKey, model, messages, ...)
} else {
  await streamChat(ollamaUrl, model, messages, ...)  // Ollama（デフォルト）
}
```

---

## 4. ディレクトリ構成

```
learning-assistant/
├── assets/
│   └── avatar/
│       ├── default-static/
│       │   ├── neutral.png
│       │   ├── think.png
│       │   ├── explain.png
│       │   ├── praise.png
│       │   └── ask.png
│       └── manifest.json
├── main/
│   ├── main.ts          # エントリーポイント・IPCハブ・接続モード分岐
│   ├── ollama.ts        # Ollama HTTPストリーミングクライアント
│   ├── openai.ts        # OpenAI SSEストリーミングクライアント
│   ├── store.ts         # sql.js DBアクセス層
│   ├── settings.ts      # 設定ファイルI/O
│   ├── preload.ts       # contextBridge公開API
│   └── types.ts         # 共有型定義・IPC定数
├── renderer/
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── App.module.css
│       ├── components/
│       │   ├── Chat.tsx
│       │   ├── Chat.module.css
│       │   ├── AvatarLayer.tsx
│       │   ├── AvatarLayer.module.css
│       │   ├── SettingsModal.tsx
│       │   ├── SessionsModal.tsx
│       │   ├── MotionDebugPanel.tsx
│       │   ├── OllamaGuide.tsx      # connectionMode対応
│       │   └── Modal.module.css
│       ├── utils/
│       │   ├── electronAPI.ts
│       │   ├── parseTone.ts
│       │   └── systemPrompt.ts
│       └── styles/
│           └── global.css
```

---

## 5. データモデル

### 5.1 型定義（`main/types.ts`）

#### ConnectionMode

```typescript
/**
 * 'ollama': ローカルLLM（Ollama）
 * 'openai': OpenAI API（ChatGPT）
 * 将来: | 'dify' など
 */
export type ConnectionMode = 'ollama' | 'openai'
```

#### AppSettings

```typescript
interface AppSettings {
  // ── 接続設定 ──
  connectionMode: ConnectionMode
  // Ollama
  ollamaUrl: string
  // OpenAI
  openaiApiKey: string       // APIキー（平文・個人PC用途）
  openaiModels: string[]     // ユーザーが登録したモデル一覧
  openaiBaseUrl: string      // カスタムエンドポイント（デフォルト: OpenAI公式）

  avatarPath: string
  backgroundImagePath: string
  theme: 'light' | 'dark' | 'auto'
  distance: Distance
  reducedMotion: boolean
  defaultModel: string       // Ollamaモード用デフォルトモデル
  streamTimeout: number

  // ── アバター動作 ──
  toneTagEnabled: boolean        // toneTag → アバターモーション連携
  enabledMotions: MotionName[]   // 使用するモーション一覧

  // ── 理解・納得ワード ──
  understandingWordsEnabled: boolean
  understandingWords: string[]
}

// デフォルト値
const DEFAULT_SETTINGS: AppSettings = {
  connectionMode: 'ollama',
  ollamaUrl: 'http://localhost:11434',
  openaiApiKey: '',
  openaiModels: ['gpt-5-nano-2025-08-07', 'gpt-4.1-nano-2025-04-14'],
  openaiBaseUrl: 'https://api.openai.com',
  avatarPath: '',
  backgroundImagePath: '',
  theme: 'auto',
  distance: 'tutor',
  reducedMotion: false,
  defaultModel: 'qwen3:0.6b',
  streamTimeout: 60,
  toneTagEnabled: true,
  enabledMotions: [...ALL_MOTIONS],
  understandingWordsEnabled: true,
  understandingWords: [...DEFAULT_UNDERSTANDING_WORDS],
}
```

#### 定数

```typescript
export const ALL_MOTIONS: MotionName[] = ['neutral', 'think', 'explain', 'praise', 'ask']

export const OPENAI_PRESET_MODELS: string[] = [
  'gpt-5-nano-2025-08-07',
  'gpt-4.1-nano-2025-04-14',
  'gpt-4o',
  'gpt-4o-mini',
]

export const DEFAULT_UNDERSTANDING_WORDS: string[] = [
  'なるほど', 'わかりました', '了解', '理解しました', 'そうか', 'なるほどね',
  'わかった', 'そっか', 'なるほど！', 'わかりました！', '理解できました',
]
```

#### Session / Message

```typescript
type Distance = 'friend' | 'tutor' | 'buddy' | 'calm' | 'cheerful'
type MotionName = 'neutral' | 'think' | 'explain' | 'praise' | 'ask'
type Rating = 'good' | 'bad' | null

interface Session {
  id: string
  title: string       // "YYYY/MM/DD HH:mm"
  model: string
  started_at: string  // ISO8601
  ended_at?: string
}

interface Message {
  id: string
  session_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  content_clean?: string
  tone?: string
  model?: string      // 使用モデル名（Ollama・OpenAI問わず記録）
  ttft_ms?: number
  rating?: Rating
  safety_flags: string
  error: string
  created_at: string
}
```

### 5.2 DBスキーマ（sql.js / SQLite）

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
  model         TEXT,       -- 使用モデル名（Ollama・OpenAI問わず）
  latency_ms    INTEGER,
  ttft_ms       INTEGER,
  tokens_in     INTEGER,
  tokens_out    INTEGER,
  safety_flags  TEXT,
  error         TEXT,
  rating        TEXT,       -- 'good' | 'bad' | NULL
  created_at    TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);
```

### 5.3 CSVエクスポート形式

```
session_id,created_at,role,model,distance,ttft_ms,rating,content
abc-123,2026-03-03T11:55:08Z,user,,,,,,"質問テキスト"
abc-123,2026-03-03T11:55:11Z,assistant,gpt-5-nano-2025-08-07,tutor,2313,good,"回答テキスト"
```

- `session_id`: セッション識別子（複数セッション結合時の追跡用）
- `model`: 使用モデル名（Ollama・OpenAI問わず記録）。userの行は空
- `distance`: assistantの行のみセッションの距離感を記録
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
  LOGS_RATE_MESSAGE:   'logs:rateMessage',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  DIALOG_OPEN_FOLDER: 'dialog:openFolder',
  DIALOG_OPEN_FILE:   'dialog:openFile',
  AVATAR_LOAD_MANIFEST: 'avatar:loadManifest',
  AVATAR_CHECK_STATIC:  'avatar:checkStatic',
  AVATAR_DEFAULT_PATH:  'avatar:defaultPath',
  AVATAR_READ_FILE:     'avatar:readFile',
}
```

### 6.2 MODELS_LIST の挙動

```typescript
// Ollamaモード: Ollama API から動的取得
// OpenAIモード: settings.openaiModels をそのまま返す（API呼び出し不要）
ipcMain.handle(IPC.MODELS_LIST, async () => {
  if (settings.connectionMode === 'openai') return settings.openaiModels ?? []
  return listModels(ollamaUrl)
})
```

### 6.3 チャットストリーミングフロー

```
Renderer              Main                    Backend
   │                    │                        │
   │── CHAT_START ─────►│                        │
   │                    │── POST (Ollama/OpenAI)─►│
   │                    │◄─ SSE chunk ────────────│
   │◄── CHAT_DELTA ─────│   （繰り返し）            │
   │◄── CHAT_DONE ──────│◄─ done ─────────────────│
   │                    │                        │
   │── CHAT_ABORT ──────►│  AbortController.abort()│
```

---

## 7. コンポーネント仕様

### 7.1 App.tsx

**責務**: 全体レイアウト、タブ管理、グローバル状態保持、接続モード別モデル解決

**接続モード別 defaultModel 解決**

OpenAI モードでも `DEFAULT_SETTINGS.defaultModel` は `'qwen3:0.6b'`（Ollama用）のままのため、
そのまま `Chat` に渡すと最初のリクエストで Ollama モデル名が OpenAI API に送信されてしまう。
`resolvedSettings` で差し替えてから渡すことで防ぐ。

```typescript
// OpenAIモードのとき qwen3:0.6b などの Ollama 用モデル名が
// Chat に渡されるのを防ぐ
const resolvedSettings = settings.connectionMode === 'openai'
  ? { ...settings, defaultModel: (settings.openaiModels ?? [])[0] ?? settings.defaultModel }
  : settings
```

`resolvedSettings` を `Chat` コンポーネントに渡す（`settings` を直接渡さない）。

**モデル一覧取得**

```typescript
if (settings.connectionMode === 'openai') {
  setModels(settings.openaiModels ?? [])
  setOllamaOnline((settings.openaiModels ?? []).length > 0 ? true : null)
} else {
  api.listModels().then(m => { setModels(m); setOllamaOnline(m.length > 0) })
}
```

**未設定判定（ガイド表示条件）**

```typescript
const isOffline = settings.connectionMode === 'openai'
  ? (settings.openaiModels ?? []).length === 0 || !settings.openaiApiKey
  : ollamaOnline === false
```

**アバターメッセージ・タイマー仕様**

| タイミング | 処理 |
|---|---|
| ユーザー送信（think） | `avatarMessage` を null にクリア |
| レスポンス完了から10秒後（neutral） | `'まだ聞きたいことはあるかしら？'` + `ask` モーション |
| 理解・納得ワード検知（praise → neutral） | 即座に `'まだ聞きたいことはあるかしら？'` + `ask` モーション |
| タブ切替・新規タブ・クリア | `'私に何を聞きたいの？'` にリセット |

### 7.2 Chat.tsx

**設定フラグ参照**

```typescript
const toneTagEnabled            = settings.toneTagEnabled ?? true
const enabledMotions            = settings.enabledMotions ?? undefined
const understandingWordsEnabled = settings.understandingWordsEnabled ?? true
```

**理解・納得ワード検知フロー**

```
ユーザーが登録ワードを入力
  → understandingWordsEnabled が true のとき
  → LLMに送信しない
  → DBにユーザーメッセージのみ記録
  → praise モーション（2秒）→ neutral → onPraiseReaction()
```

**toneTagEnabled = false のとき**
- 送信時の think モーション切り替えを行わない
- systemPrompt に toneTag を出力しない指示を追加
- レスポンス完了後も neutral 固定

**モーション遷移**

| タイミング | toneTagEnabled=true | toneTagEnabled=false |
|---|---|---|
| 送信時 | think | 変化なし |
| レスポンス完了 | toneTagに従う | neutral |
| 3秒後 | neutral | neutral |

### 7.3 SettingsModal.tsx

**接続設定セクション（モード別表示切替）**

Ollamaモード選択時:
- Ollama URL 入力

OpenAIモード選択時:
- APIキー入力（パスワード形式 + 👁️ 表示切替）
- カスタムエンドポイント入力（互換API対応）
- 登録済みモデルのチップ表示（✕で個別削除）
- プリセットボタン（`gpt-5-nano-2025-08-07` / `gpt-4.1-nano-2025-04-14` / `gpt-4o` / `gpt-4o-mini`）
- 手動モデル名入力（Enter キー対応）

**理解・納得ワードセクション**
- 機能オン/オフトグル
- 登録ワードのチップ表示（✕で個別削除）
- ワード追加入力欄（Enter対応）
- デフォルトへのリセットボタン

### 7.4 OllamaGuide.tsx

`connectionMode` プロップで表示内容を切り替え。

- `'ollama'`: Ollama未起動時のインストール手順
- `'openai'`: APIキー未設定・モデル未登録時の設定手順

---

## 8. 設定仕様

### 8.1 設定の永続化

- **場所**: `%APPDATA%\learning-assistant\settings.json`（Windows）
- **形式**: JSON（`AppSettings` 型）
- **読み込み**: `{ ...DEFAULT_SETTINGS, ...JSON.parse(raw) }` でデフォルト補完（後方互換性）

### 8.2 設定画面セクション一覧

| セクション | 項目 |
|---|---|
| 🔗 接続設定 | 接続モード / Ollama URL / OpenAI APIキー・モデル・エンドポイント |
| 🎭 アバター | フォルダパス |
| 🎬 アバター動作 | toneTag連携 / 使用モーションチェックリスト |
| 🖼️ 背景画像 | 画像ファイルパス |
| 🧠 理解・納得ワード | 機能オン/オフ / ワード一覧管理 |
| 💬 距離感 | friend / tutor / buddy / calm / cheerful |
| 🎨 テーマ | auto / dark / light |
| ♿ アクセシビリティ | reducedMotion |
| ⏱ タイムアウト | streamTimeout（秒, 10〜300） |

---

## 9. セッション・ログ仕様

### 9.1 セッションタイトル形式

```
"YYYY/MM/DD HH:mm"  例: "2026/03/02 14:30"
```

### 9.2 JSONLバックアップ

メッセージ保存時に `%APPDATA%\learning-assistant\logs\YYYY-MM\session_{id}.jsonl` にも追記保存。

### 9.3 CSVエクスポート列

```
session_id, created_at, role, model, distance, ttft_ms, rating, content
```

- `session_id`: 複数セッション結合時の追跡・蒸留データのグルーピングに利用
- `model`: Ollama・OpenAI問わずレスポンスごとにモデル名を記録（例: `gemma3:4b`, `gpt-5-nano-2025-08-07`）。userの行は空
- 蒸留用途: `rating=good` でフィルタし、`model` で教師モデルを区別できる

#### `store.ts` 実装（`exportSessionCsv`）

```typescript
const header = 'session_id,created_at,role,model,distance,ttft_ms,rating,content'
const rows = messages
  .filter(m => m.role !== 'system')
  .map(m => [
    m.session_id,
    m.created_at,
    m.role,
    m.model ?? '',
    m.role === 'assistant' ? distance : '',
    m.ttft_ms ?? '',
    m.rating ?? '',
    `"${(m.content_clean ?? m.content ?? '').replace(/"/g, '""')}"`
  ].join(','))
fs.writeFileSync(outputPath, '\uFEFF' + [header, ...rows].join('\n'), 'utf-8')
```

### 9.4 蒸留ワークフロー

```
① OpenAI モードで高品質な応答を生成
② 👍 good 評価で良回答を選別
③ CSV エクスポート（session_id / model / rating 付き）
④ CSV → ファインチューニング用データセットに変換
⑤ Ollama モードでローカルモデルを育てる
```

---

## 10. アバター仕様

### 10.1 PNG静止画モード

- フォルダ内の `{motionName}.png` を直接参照
- 5種類のモーション: `neutral`, `think`, `explain`, `praise`, `ask`
- `neutral` は常時有効（フォールバック先）

### 10.2 toneTag仕様

```
<toneTag name="neutral|explain|praise|ask|think" />
```

- `toneTagEnabled = false` のとき: タグ除去のみ、モーション変化なし
- `enabledMotions` に含まれないモーションは `neutral` にフォールバック

### 10.3 理解・納得ワード仕様

`buildUnderstandingRegex(words)` で動的に正規表現を生成。

```typescript
// マッチ条件: ワード + 句読点・感嘆符・空白のみで構成される入力
/^(なるほど|わかった|...)[。、！!…\s]*$/i
```

`understandingWordsEnabled = false` のとき `/(?!)/`（常にマッチしない）を使用。

### 10.4 モーション遷移タイミング

| タイミング | モーション |
|---|---|
| ユーザー送信（toneTagEnabled=true） | `think` |
| ストリーミング中 | `think` のまま |
| レスポンス完了 | toneTagに従う |
| 完了から3秒後 | `neutral` |
| 理解・納得ワード入力 | `praise`（2秒）→ `neutral` → `ask` |
| レスポンス完了から10秒後 | `ask` + アバターメッセージ |
| エラー・クリア・タブ切替 | `neutral` |

---

## 11. システムプロンプト仕様

```
あなたは"学習支援に特化したAIコーチ"です。以下を厳守してください：
- 宗教・文化・価値観・恋愛について中立で、押し付けない。
- 親しみは示すが、依存を助長しない。学習行動につながる具体的提案を優先する。
- セクシャル/不適切表現は行わず、教育目的に集中する。
- 距離感（トーン）={distance} を保つ（friend/tutor/buddy/calm/cheerful）。
- 回答は簡潔→必要なら箇条書き→最後に次アクション（小さな一歩）を示す。
- 応答の最後に必ず1つだけ `<toneTag name="neutral|think|explain|praise|ask" />` を付ける。
  （toneTagEnabled=false のとき: toneTagは出力しないよう指示が変わる）
- 不明点は確認質問を返し、推測で断定しない。
```

`buildSystemPrompt(distance, toneTagEnabled)` で生成。

---

## 12. 非機能要件

### 12.1 セキュリティ

| 設定 | 値 | 理由 |
|---|---|---|
| `contextIsolation` | `true` | Renderer/Mainの隔離 |
| `nodeIntegration` | `false` | RendererからのNode.js直接アクセス禁止 |
| `sandbox` | `false` | preloadスクリプトの実行に必要 |
| OpenAI APIキー保存 | `settings.json` 平文 | 個人PC専用アプリのため許容 |
| CSP | file:// 制限のため Base64でアバター/背景を渡す | XSS対策 |

### 12.2 パフォーマンス

- 非アクティブタブは `display: none` でマウント維持（再レンダリングなし）
- ストリーミングデルタは `accumulatedContent` Refに直接蓄積
- `persistDb()` はDB操作のたびに呼び出す（データ損失防止）

---

## 13. ビルド・配布仕様

### 13.1 ビルドフロー

```
npm run build
  └─► vite build         → dist/
  └─► tsc -p tsconfig.electron.json → dist-electron/

npm run dist:win
  └─► electron-builder --win → release/*.exe
```

### 13.2 同梱リソース

```json
"extraResources": [
  { "from": "assets", "to": "assets", "filter": ["**/*"] }
]
```

---

## 14. SDD開発ガイド（Claude向け）

### 14.1 開発の前提

1. **この仕様書を先に読む**: 変更前に必ず関連セクションを確認する
2. **型安全を守る**: `main/types.ts` を変更したら `preload.ts` / `electronAPI.ts` / 使用箇所をすべて更新する
3. **IPC定数を使う**: 文字列リテラルを直接書かず `IPC.CHAT_START` などを使う

### 14.2 接続モード追加手順

```
1. main/types.ts の ConnectionMode 型に追加
2. main/{newmode}.ts を新規作成（ストリーミングクライアント）
3. main/main.ts の CHAT_START / MODELS_LIST に else if を追加
4. renderer/src/components/SettingsModal.tsx の CONNECTION_MODES 配列に追加
5. renderer/src/App.tsx のモデル一覧取得・isOffline 判定に追加
6. renderer/src/components/OllamaGuide.tsx に対応メッセージを追加
```

### 14.3 設定項目追加手順

```
1. main/types.ts の AppSettings に追加
2. main/types.ts の DEFAULT_SETTINGS にデフォルト値追加
3. renderer/src/components/SettingsModal.tsx にUIセクション追加
4. 使用箇所で settings.newProp として参照
```

### 14.4 React非同期の注意点

```typescript
// ❌ setMessages内の変数は非同期で確定しない
setMessages(prev => { finalContent = prev[...].content })
await api.appendMessage({ content: finalContent })  // 空！

// ✅ Refに直接蓄積する
accumulatedContent.current += delta
await api.appendMessage({ content: accumulatedContent.current })  // 確実
```

### 14.5 ハードコード値一覧

| 項目 | ファイル | 変数 |
|---|---|---|
| セッションタブの最大数 | `renderer/src/App.tsx` | `const MAX_TABS = 5` |
| neutral に戻るまでの時間 | `renderer/src/components/Chat.tsx` | `setTimeout(..., 3000)` |
| praise 後の neutral 遷移時間 | `renderer/src/components/Chat.tsx` | `setTimeout(..., 2000)` |
| フォロー吹き出しまでの待機時間 | `renderer/src/App.tsx` | `setTimeout(..., 10_000)` |

### 14.6 バージョン管理規則

| 変更種別 | 例 |
|---|---|
| 機能追加 | v0.1.8 → v0.1.9 |
| バグ修正 | v0.1.9 → v0.1.9b |
| 小さな修正 | v0.1.9b → v0.1.9c |

### 14.7 変更履歴

| バージョン | 内容 |
|---|---|
| v0.1.9b | `store.ts` CSVに `session_id` / `model` カラム追加。OpenAIモードで `defaultModel` が Ollama用モデル名のまま送信されるバグ修正（`resolvedSettings` 導入）。OpenAI初期モデルを `gpt-5-nano-2025-08-07` / `gpt-4.1-nano-2025-04-14` に変更。`types.ts` の `Session` / `Message` 型に `store.ts` が参照するフィールドを追加（ビルドエラー修正）。本番ビルド検証完了。 |
| v0.1.9 | OpenAI API（ChatGPT）対応。デュアルバックエンド実装。`main/openai.ts` 新規追加。設定画面にOpenAI設定UI追加。 |
| v0.1.8e | 理解・納得ワード機能。toneTag連携オン/オフ。使用モーション選択。接続モード基盤。 |


### 14.8 バックログ

| 優先度 | 機能 | 概要 |
|---|---|---|
| High | 蒸留UI | CSVビューア・フィルタ・ファインチューニングデータ変換ツール |
| Medium | Dify対応 | `ConnectionMode` に `'dify'` を追加 |
| Medium | セッション検索 | セッション履歴モーダルにキーワード検索 |
| Low | キーボードショートカット | `Ctrl+L` でチャットクリア など |
| Low | モデル自動更新 | 起動時にOllamaのモデル一覧を自動再取得 |
