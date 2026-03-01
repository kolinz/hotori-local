# 学習アシスタント — ソフトウェア設計仕様書 (SDD)
**バージョン**: 0.1.0 
**作成日**: 2026-03-01  
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
| アプリ名 | 学習アシスタント |
| 目的 | ローカルLLM（Ollama）を使った学習支援デスクトップアプリ |
| 対象OS | Windows（主）、macOS、Linux |
| 配布形式 | NSIS インストーラー（Win）、DMG（Mac）、AppImage（Linux） |
| ネットワーク | 完全オフライン動作（Ollamaがローカルまたはリモートで稼働していること） |

### 1.2 主要機能

- **マルチタブチャット**: 最大5タブの並列セッション管理
- **ストリーミング応答**: Ollama API経由のリアルタイムトークン表示
- **アバター表情制御**: 応答の感情モーションに連動したPNG切り替え
- **セッションログ**: SQLite（sql.js）による会話履歴の永続化
- **CSV エクスポート**: セッション単位でのデータエクスポート（評価付き）
- **応答評価**: Good/Not Good の2値評価とログへの記録
- **カスタマイズ設定**: アバター・背景・距離感・テーマ・タイムアウト

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

### 2.2 npm overrides（deprecation回避）

```json
{
  "overrides": {
    "glob": "^11.0.0",
    "tar": "^7.0.0"
  }
}
```

### 2.3 開発コマンド

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
┌─────────────────────────────────────────────────────────┐
│                   Electron Main Process                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ main.ts  │  │ollama.ts │  │ store.ts │  │settings│  │
│  │ IPC Hub  │  │ HTTP Client│  │ sql.js DB│  │  .ts   │  │
│  └────┬─────┘  └──────────┘  └──────────┘  └────────┘  │
│       │ contextBridge (preload.ts)                       │
└───────┼─────────────────────────────────────────────────┘
        │ IPC（invoke / send / on）
┌───────┼─────────────────────────────────────────────────┐
│       │         Electron Renderer Process               │
│  ┌────┴──────────────────────────────────────────────┐  │
│  │  React + Vite (TypeScript)                        │  │
│  │  App.tsx → Chat.tsx / AvatarLayer.tsx             │  │
│  │           SettingsModal / SessionsModal           │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
        │
┌───────┼──────────────┐
│  Ollama HTTP API     │
│  http://localhost:11434 (変更可) │
└──────────────────────┘
```

### 3.2 プロセス間通信の原則

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
│       └── manifest.json            # アバターマニフェスト
├── main/                            # Electron Main Process
│   ├── main.ts                      # エントリーポイント・IPCハブ
│   ├── ollama.ts                    # Ollama HTTPクライアント
│   ├── store.ts                     # sql.js DBアクセス層
│   ├── settings.ts                  # 設定ファイルI/O
│   ├── preload.ts                   # contextBridge公開API
│   └── types.ts                     # 共有型定義・IPC定数
├── renderer/
│   ├── index.html
│   └── src/
│       ├── App.tsx                  # ルート・タブ管理
│       ├── App.module.css
│       ├── components/
│       │   ├── Chat.tsx             # チャットUI・ストリーミング
│       │   ├── Chat.module.css
│       │   ├── AvatarLayer.tsx      # アバター表示
│       │   ├── AvatarLayer.module.css
│       │   ├── SettingsModal.tsx    # 設定画面
│       │   ├── SessionsModal.tsx    # セッション履歴
│       │   ├── MotionDebugPanel.tsx # モーションテスト（開発用）
│       │   ├── OllamaGuide.tsx      # Ollama未起動時のガイド
│       │   └── Modal.module.css     # モーダル共通スタイル
│       ├── utils/
│       │   ├── electronAPI.ts       # IPC型定義・フォールバック
│       │   ├── parseTone.ts         # toneTagパーサー
│       │   └── systemPrompt.ts      # システムプロンプト生成
│       └── styles/
│           └── global.css           # CSSカスタムプロパティ
├── scripts/
│   └── dev-electron.js              # 開発時ビルドスクリプト
├── tsconfig.json                    # Renderer用TS設定
├── tsconfig.electron.json           # Main Process用TS設定
├── vite.config.ts
└── package.json
```

---

## 5. データモデル

### 5.1 型定義（`main/types.ts`）

#### AppSettings

```typescript
interface AppSettings {
  avatarPath: string          // アバターPNGフォルダパス（'' = デフォルト）
  backgroundImagePath: string // 背景画像ファイルパス（'' = なし）
  ollamaUrl: string           // Ollama APIエンドポイント
  theme: 'light' | 'dark' | 'auto'
  distance: Distance          // AIのトーン・距離感
  reducedMotion: boolean      // アニメーション軽減
  defaultModel: string        // デフォルト使用モデル名
  streamTimeout: number       // ストリームタイムアウト（秒）
}

// デフォルト値
const DEFAULT_SETTINGS: AppSettings = {
  avatarPath: '',
  backgroundImagePath: '',
  ollamaUrl: 'http://localhost:11434',
  theme: 'auto',
  distance: 'tutor',
  reducedMotion: false,
  defaultModel: 'qwen3:0.6b',
  streamTimeout: 60,
}
```

#### Session / Message

```typescript
type Distance = 'friend' | 'tutor' | 'buddy' | 'calm' | 'cheerful'
type MotionName = 'neutral' | 'think' | 'explain' | 'praise' | 'ask'
type Rating = 'good' | 'bad' | null

interface Session {
  id: string          // UUID（タイムスタンプ+乱数）
  title: string       // 日時文字列 "YYYY/MM/DD HH:mm"
  model: string       // 使用モデル名
  started_at: string  // ISO8601
  ended_at?: string
}

interface Message {
  id: string
  session_id: string
  role: 'user' | 'assistant' | 'system'
  content: string         // 生テキスト（toneTag含む）
  content_clean?: string  // toneTag除去済みテキスト
  tone?: string           // アバターモーション名（記録用）
  ttft_ms?: number        // Time To First Token（ミリ秒）
  rating?: Rating         // ユーザー評価
  safety_flags: string
  error: string
  created_at: string      // ISO8601
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
  model         TEXT,
  latency_ms    INTEGER,
  ttft_ms       INTEGER,
  tokens_in     INTEGER,
  tokens_out    INTEGER,
  safety_flags  TEXT,
  error         TEXT,
  rating        TEXT,          -- 'good' | 'bad' | NULL
  created_at    TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);
```

**注意**: 既存DBへの `rating` カラム追加は `ALTER TABLE messages ADD COLUMN rating TEXT` でマイグレーション済み（エラーを無視して実行）。

### 5.3 設定ファイル

- **場所**: `%APPDATA%\learning-assistant\settings.json`（Windows）
- **形式**: JSON（`AppSettings` 型）
- **I/O**: `main/settings.ts` の `loadSettings()` / `saveSettings()`

### 5.4 CSVエクスポート形式

```
created_at,role,distance,ttft_ms,rating,content
2026-02-28T11:55:08.617Z,user,,0,,"質問テキスト"
2026-02-28T11:55:11.969Z,assistant,tutor,2313,good,"回答テキスト"
```

- `distance`: assistantの行のみセッションの距離感を記録、userは空
- `rating`: `good` / `bad` / 空
- `content`: ダブルクォートで囲み、内部の `"` は `""` でエスケープ
- BOM付きUTF-8（Excelでの文字化け防止）
- ファイル名: `session_YYYY-MM-DD-HH-mm_モデル名.csv`

---

## 6. IPC通信仕様

### 6.1 IPC定数一覧（`main/types.ts`）

```typescript
export const IPC = {
  // チャット（send/on方式 = 双方向ストリーミング）
  CHAT_START:  'chat:stream:start',   // Renderer → Main
  CHAT_ABORT:  'chat:stream:abort',   // Renderer → Main
  CHAT_DELTA:  'chat:stream:delta',   // Main → Renderer
  CHAT_DONE:   'chat:stream:done',    // Main → Renderer
  CHAT_ERROR:  'chat:stream:error',   // Main → Renderer

  // モデル（invoke方式）
  MODELS_LIST: 'models:list',

  // ログ（invoke方式）
  LOGS_CREATE_SESSION: 'logs:createSession',
  LOGS_APPEND_MESSAGE: 'logs:appendMessage',
  LOGS_LIST_SESSIONS:  'logs:listSessions',
  LOGS_GET_SESSION:    'logs:getSession',
  LOGS_EXPORT_CSV:     'logs:exportCsv',
  LOGS_DELETE_SESSION: 'logs:deleteSession',
  LOGS_CLEAR_ALL:      'logs:clearAll',
  LOGS_RATE_MESSAGE:   'logs:rateMessage',

  // 設定（invoke方式）
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // ダイアログ（invoke方式）
  DIALOG_OPEN_FOLDER: 'dialog:openFolder',
  DIALOG_OPEN_FILE:   'dialog:openFile',

  // アバター（invoke方式）
  AVATAR_LOAD_MANIFEST: 'avatar:loadManifest',
  AVATAR_CHECK_STATIC:  'avatar:checkStatic',
  AVATAR_DEFAULT_PATH:  'avatar:defaultPath',
  AVATAR_READ_FILE:     'avatar:readFile',  // Base64返却
}
```

### 6.2 チャットストリーミングフロー

```
Renderer                          Main                        Ollama
   │                               │                             │
   │── CHAT_START(payload) ──────►│                             │
   │                               │── POST /api/chat ─────────►│
   │                               │◄─ chunk(delta) ────────────│
   │◄── CHAT_DELTA(delta) ─────── │                             │
   │◄── CHAT_DELTA(delta) ─────── │   （繰り返し）               │
   │                               │◄─ done ────────────────────│
   │◄── CHAT_DONE(ttft_ms) ──────│                             │
   │                               │                             │
   │── CHAT_ABORT（任意）─────────►│  AbortController.abort()   │
```

### 6.3 `AVATAR_READ_FILE` の仕様

- 目的: `file://` プロトコル制限回避
- 入力: ファイルの絶対パス（string）
- 出力: `data:image/png;base64,{base64文字列}` または `null`
- Main側で `fs.readFileSync()` → Base64変換して返却

---

## 7. コンポーネント仕様

### 7.1 App.tsx（ルートコンポーネント）

**責務**: 全体レイアウト、タブ管理、グローバル状態保持

**状態**:
| 状態 | 型 | 説明 |
|------|-----|------|
| `motion` | `MotionName` | アクティブタブのアバターモーション |
| `settings` | `AppSettings \| null` | アプリ設定（初期ロード中はnull） |
| `bgDataUrl` | `string` | 背景画像のBase64 data URL |
| `models` | `string[]` | Ollamaから取得したモデル一覧 |
| `ollamaOnline` | `boolean \| null` | Ollama接続状態 |
| `tabs` | `TabInfo[]` | タブ一覧（最大5件） |
| `activeTabId` | `string` | アクティブタブID |

**TabInfo型**:
```typescript
interface TabInfo {
  id: string     // Chat コンポーネントの key
  title: string  // "新しいセッション" → "YYYY/MM/DD HH:mm"
}
```

**タブ管理ルール**:
- 最大5タブ。上限到達時、6枚目追加で右端（最古）を自動削除
- 新タブは常に左端に追加（＋ボタンも左端）
- タブを閉じてもセッションDBは削除しない
- 最後の1枚を閉じると、タブを削除せず内容を新セッションにリセット
- 非アクティブタブのChatコンポーネントは `display: none` でマウント維持（状態保持）

### 7.2 Chat.tsx

**責務**: メッセージ送受信、ストリーミング表示、セッション管理、評価

**Props**:
```typescript
interface Props {
  tabId: string
  settings: AppSettings
  models: string[]
  onMotionChange: (motion: MotionName) => void
  onSessionTitleChange: (tabId: string, title: string) => void
}
```

**重要なRef**:
| Ref | 型 | 用途 |
|-----|-----|------|
| `currentRequestId` | `string \| null` | 進行中ストリームのID |
| `accumulatedContent` | `string` | ストリーム中の全文蓄積（非同期問題回避） |
| `assistantMsgId` | `string` | UIとDBで同一IDを使うための保持 |
| `motionTimerRef` | `ReturnType<typeof setTimeout> \| null` | neutral遷移タイマー |

**セッション作成タイミング**: 最初のメッセージ送信時に `ensureSession()` で作成。タブタイトルも同時更新。

**モーション遷移**:
```
ユーザー送信 → think
レスポンス完了 → explain（または応答toneTag）→ 3秒後 → neutral
```

**評価ボタン条件**: `role === 'assistant' && !isStreaming && contentClean !== ''` の場合のみ表示

**UIとDBのID同期**:
```typescript
// 送信時
const asstId = genId()
assistantMsgId.current = asstId   // UIのメッセージIDをRefに保存

// 完了時
await api.appendMessage({ id: assistantMsgId.current, ... })  // 同じIDでDB保存

// 評価時
await api.rateMessage(msg.id, rating)  // UIのIDがDBのIDと一致
```

### 7.3 AvatarLayer.tsx

**責務**: モーション名に応じたPNG画像の表示切り替え

**フォールバック順序**:
1. `{avatarPath}/{motion}.png`
2. `{avatarPath}/neutral.png`
3. デフォルト同梱PNG（`assets/avatar/default-static/`）

**画像読み込み**: `api.readAvatarFile(filePath)` → Base64 data URL → `<img src>` に設定

### 7.4 SettingsModal.tsx

**セクション一覧**:

| セクション | 設定項目 | 型 |
|-----------|---------|-----|
| 🔗 Ollama URL | 接続先URL | string |
| 🎭 アバター | フォルダパス | string（フォルダ選択ダイアログ） |
| 🖼️ 背景画像 | 画像ファイルパス | string（ファイル選択ダイアログ） |
| 💬 距離感 | friend/tutor/buddy/calm/cheerful | Distance |
| 🎨 テーマ | auto/dark/light | string |
| ♿ アクセシビリティ | reducedMotion | boolean |
| ⏱ タイムアウト | streamTimeout (秒, 10〜300) | number |

### 7.5 SessionsModal.tsx

**機能**:
- セッション一覧表示（降順）
- CSVダウンロード（ファイル名: `session_YYYY-MM-DD-HH-mm_モデル名.csv`）
- 個別セッション削除（確認なし）
- すべてクリア（確認ダイアログあり）
- 操作後フィードバックメッセージ（2.5秒表示）

---

## 8. 設定仕様

### 8.1 設定の永続化

```typescript
// main/settings.ts
function loadSettings(): AppSettings   // JSONファイル読み込み + DEFAULT_SETTINGSでデフォルト補完
function saveSettings(s: AppSettings)  // JSONファイル書き込み
```

### 8.2 アバターパスの自動設定

アプリ起動時（`app.whenReady`）に同梱デフォルトアバターのパスを自動設定する：

```typescript
const defaultAvatarPath = app.isPackaged
  ? path.join(process.resourcesPath, 'assets', 'avatar', 'default-static')
  : path.join(app.getAppPath(), 'assets', 'avatar', 'default-static')

if (fs.existsSync(path.join(defaultAvatarPath, 'neutral.png'))) {
  saveSettings({ ...settings, avatarPath: defaultAvatarPath })
}
```

---

## 9. セッション・ログ仕様

### 9.1 セッションタイトル形式

```typescript
function makeSessionTitle(): string {
  // 例: "2026/03/01 14:30"
  return `${YYYY}/${MM}/${DD} ${HH}:${mm}`
}
```

### 9.2 JSONLバックアップ

メッセージ保存時に `%APPDATA%\learning-assistant\logs\YYYY-MM\session_{id}.jsonl` にも追記保存。

### 9.3 評価記録フロー

```
ユーザーが👍/👎を押す
  → setMessages（UI更新）
  → api.rateMessage(msgId, 'good' | 'bad' | null)
    → IPC: LOGS_RATE_MESSAGE
      → store.rateMessage(): UPDATE messages SET rating = ? WHERE id = ?
```

同じボタンを再押しすると `rating = null`（評価取り消し）。

---

## 10. アバター仕様

### 10.1 PNG静止画モード

- フォルダ内の `{motionName}.png` を直接参照
- 5種類のモーション: `neutral`, `think`, `explain`, `praise`, `ask`
- 推奨画像サイズ: 400×600px（縦長2:3比率）
- アバターペイン幅: 220px

### 10.2 toneTag仕様

LLMのレスポンス末尾に付与されるXMLタグ：

```
<toneTag name="neutral|explain|praise|ask|think" />
```

- パイプ区切りで複数指定可能（`name="neutral|explain"`）
- 最初に一致したMotionNameを採用
- `parseTone.ts` の `parseToneTagged(content)` で解析
  - 戻り値: `{ tone: MotionName, clean: string }`
  - `clean`: toneTagを除去したテキスト

### 10.3 モーション遷移タイミング

| タイミング | モーション |
|-----------|-----------|
| ユーザーが送信 | `think` |
| ストリーミング中 | `think` のまま |
| レスポンス完了 | toneTagに従う（なければ `neutral`） |
| 完了から3秒後 | `neutral` に戻る |
| エラー発生 | `neutral` |
| チャットクリア | `neutral` |

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
- 不明点は確認質問を返し、推測で断定しない。
```

`{distance}` はセッション開始時の設定値に動的置換される。

---

## 12. 非機能要件

### 12.1 セキュリティ

| 設定 | 値 | 理由 |
|------|-----|------|
| `contextIsolation` | `true` | Renderer/Mainの隔離 |
| `nodeIntegration` | `false` | RendererからのNode.js直接アクセス禁止 |
| `sandbox` | `false` | preloadスクリプトの実行に必要 |
| CSP | file:// 制限のため Base64でアバター/背景を渡す | XSS対策 |

### 12.2 パフォーマンス

- 非アクティブタブは `display: none` でマウント維持（再レンダリングなし）
- ストリーミングデルタは `accumulatedContent` Refに直接蓄積（setState非同期問題回避）
- `persistDb()` はDB操作のたびに呼び出す（データ損失防止）

### 12.3 DevTools

- 開発時も自動起動しない（`openDevTools()` を削除）
- 手動起動: `Ctrl+Shift+I`

---

## 13. ビルド・配布仕様

### 13.1 ビルドフロー

```
npm run build
  └─► vite build         → dist/（Renderer成果物）
  └─► tsc -p tsconfig.electron.json → dist-electron/（Main成果物）

npm run dist:win
  └─► electron-builder --win → release/*.exe（NSISインストーラー）
```

### 13.2 tsconfig.electron.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "lib": ["ES2020", "DOM"],
    "strict": false,
    "allowJs": true,
    "outDir": "dist-electron"
  },
  "include": ["main/**/*", "scripts/**/*"]
}
```

### 13.3 同梱リソース

```json
// electron-builder設定
"extraResources": [
  { "from": "assets", "to": "assets", "filter": ["**/*"] }
]
```

### 13.4 開発時クリーンビルド

`scripts/dev-electron.js` により `dist-electron/` を毎回削除してからビルド（古いファイルの混入防止）。

---

## 14. SDD開発ガイド（Claude向け）

このセクションは、Claude（AI）がこの仕様書をもとに開発・改修を行う際のガイドラインです。

### 14.1 開発の前提

1. **この仕様書を先に読む**: 変更前に必ず関連セクションを確認する
2. **型安全を守る**: `main/types.ts` の型定義を変更した場合は、`preload.ts`・`electronAPI.ts`・使用箇所をすべて更新する
3. **IPC定数を使う**: `'chat:stream:start'` のような文字列リテラルを直接書かず、必ず `IPC.CHAT_START` を使う

### 14.2 よくある実装パターン

#### 新しいIPC機能の追加手順

```
1. main/types.ts の IPC オブジェクトに定数追加
2. main/main.ts に ipcMain.handle() または ipcMain.on() を追加
3. main/preload.ts の contextBridge に公開メソッドを追加
4. renderer/src/utils/electronAPI.ts に型・フォールバックを追加
5. 使用するコンポーネントから api.newMethod() として呼ぶ
```

#### 設定項目の追加手順

```
1. main/types.ts の AppSettings インターフェースに項目追加
2. main/types.ts の DEFAULT_SETTINGS にデフォルト値追加
3. renderer/src/components/SettingsModal.tsx に UIセクションを追加
4. 使用箇所で settings.newProp として参照
```

#### DBスキーマ変更時の注意

- 既存ユーザーのDBにカラムが存在しない場合を考慮し、`ALTER TABLE` マイグレーションを `initStore()` 内に追加する
- `try { db.run('ALTER TABLE ...') } catch {}` で既存カラムのエラーを無視する

### 14.3 React非同期の注意点（既知のバグパターン）

**問題**: `setState` のコールバック内で変数を設定し、その直後に非同期処理で使おうとしても値が空になる

**解決策**: `useRef` に値を蓄積し、IPC呼び出し時はRefから読み取る

```typescript
// ❌ 誤り: setMessages内の変数は非同期で確定しない
setMessages(prev => {
  finalContent = prev[prev.length-1].content  // ← 直後のawaitでは空になる
})
await api.appendMessage({ content: finalContent })  // 空！

// ✅ 正しい: Refに直接蓄積する
const accumulatedContent = useRef('')
// デルタ受信時:
accumulatedContent.current += delta
// 完了時:
await api.appendMessage({ content: accumulatedContent.current })  // 確実
```

### 14.4 バージョン管理規則

| 変更種別 | バージョン例 | 内容 |
|---------|------------|------|
| 機能追加 | v1.25 → v1.26 | 新機能・UI変更 |
| バグ修正 | v1.26 → v1.26b | 同一機能の不具合修正 |
| 小さな修正 | v1.26b → v1.26c | 1〜2ファイルの局所修正 |

アーカイブは `learning-assistant-v{version}.zip`（`node_modules`・`dist-electron`・`dist` を除外）として保存する。

### 14.5 次バージョン候補機能（バックログ）

| 優先度 | 機能 | 概要 |
|-------|------|------|
| High | Markdownレンダリング | `react-markdown` + `remark-gfm`（ネット接続時に導入） |
| High | 本番ビルド検証 | `npm run dist:win` でのパッケージ動作確認 |
| Medium | キーボードショートカット | `Ctrl+L`でチャットクリア など |
| Medium | セッション検索 | セッション履歴モーダルにキーワード検索 |
| Low | モデル自動更新 | 起動時にOllamaのモデル一覧を自動再取得 |
| Low | アバター2:3比率対応 | アバターペイン幅を300pxに拡張（画像準備次第） |

---
