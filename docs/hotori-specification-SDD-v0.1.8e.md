# 学習アシスタント Hotori — ソフトウェア設計仕様書 (SDD)

**バージョン**: 0.1.8e  
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
12. [toneTagパーサー仕様](#12-tonetagパーサー仕様)
13. [アバター吹き出し仕様](#13-アバター吹き出し仕様)
14. [理解・納得ワード検知仕様](#14-理解納得ワード検知仕様)
15. [非機能要件](#15-非機能要件)
16. [ビルド・配布仕様](#16-ビルド配布仕様)
17. [SDD開発ガイド（Claude向け）](#17-sdd開発ガイドclaude向け)

---

## 1. プロジェクト概要

### 1.1 アプリケーション概要

| 項目 | 内容 |
|------|------|
| アプリ名 | 学習アシスタント Hotori |
| 目的 | ローカルLLM（Ollama）を使った学習支援デスクトップアプリ |
| 対象OS | Windows（主）、macOS、Linux |
| 配布形式 | NSIS インストーラー（Win）、DMG（Mac）、AppImage（Linux） |
| ネットワーク | 完全オフライン動作（Ollamaがローカルまたはリモートで稼働していること） |
| ライセンス | MIT License |

### 1.2 主要機能

- **マルチタブチャット**: 最大5タブの並列セッション管理
- **ストリーミング応答**: Ollama API経由のリアルタイムトークン表示
- **アバター表情制御**: 応答の感情モーションに連動したPNG切り替え
- **インタラクティブ吹き出し**: セッション開始・理解ワード検知時のUI演出（DB保存なし）
- **理解・納得ワード検知**: 設定可能なキーワードでLLM送信をスキップしpraiseモーション発動
- **セッションログ**: SQLite（sql.js）による会話履歴の永続化
- **CSV エクスポート**: セッション単位でのデータエクスポート（評価付き）
- **応答評価**: Good/Not Good の2値評価とログへの記録
- **カスタマイズ設定**: アバター・背景・距離感・テーマ・タイムアウト・理解ワード

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
│                   Electron Main Process                 │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌────────┐  │
│  │ main.ts  │  │ollama.ts  │  │ store.ts │  │settings│  │
│  │ IPC Hub  │  │HTTP Client│  │sql.js DB │  │  .ts   │  │
│  └────┬─────┘  └───────────┘  └──────────┘  └────────┘  │
│       │ contextBridge (preload.ts)                      │
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
┌───────┼──────────────────────────┐
│  Ollama HTTP API                 │
│  http://localhost:11434 (変更可)　│
└──────────────────────────────────┘
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
│       ├── App.tsx                  # ルート・タブ管理・吹き出し制御
│       ├── App.module.css
│       ├── components/
│       │   ├── Chat.tsx             # チャットUI・ストリーミング・理解ワード検知
│       │   ├── Chat.module.css
│       │   ├── AvatarLayer.tsx      # アバター表示
│       │   ├── AvatarLayer.module.css
│       │   ├── SettingsModal.tsx    # 設定画面（理解ワード設定含む）
│       │   ├── SessionsModal.tsx    # セッション履歴
│       │   ├── MotionDebugPanel.tsx # モーションテスト（開発用）
│       │   ├── OllamaGuide.tsx      # Ollama未起動時のガイド
│       │   └── Modal.module.css     # モーダル共通スタイル
│       ├── utils/
│       │   ├── electronAPI.ts       # IPC型定義・フォールバック
│       │   ├── parseTone.ts         # toneTagパーサー（多形式対応）
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
  avatarPath: string            // アバターPNGフォルダパス（'' = デフォルト）
  backgroundImagePath: string   // 背景画像ファイルパス（'' = なし）
  ollamaUrl: string             // Ollama APIエンドポイント
  theme: 'light' | 'dark' | 'auto'
  distance: Distance            // AIのトーン・距離感
  reducedMotion: boolean        // アニメーション軽減
  defaultModel: string          // デフォルト使用モデル名
  streamTimeout: number         // ストリームタイムアウト（秒）
  understandingWords: string[]  // 理解・納得ワード一覧（設定画面で編集可）
}

const DEFAULT_SETTINGS: AppSettings = {
  avatarPath: '',
  backgroundImagePath: '',
  ollamaUrl: 'http://localhost:11434',
  theme: 'auto',
  distance: 'tutor',
  reducedMotion: false,
  defaultModel: 'qwen3:0.6b',
  streamTimeout: 60,
  understandingWords: [
    'なるほど', 'わかりました', '了解', '理解しました', 'わかった',
    'ok', 'okay', 'そうか', 'なるほどね', 'そうですか', 'そうなんですね'
  ],
}
```

#### Session / Message

```typescript
type Distance  = 'friend' | 'tutor' | 'buddy' | 'calm' | 'cheerful'
type MotionName = 'neutral' | 'think' | 'explain' | 'praise' | 'ask'
type Rating    = 'good' | 'bad' | null

interface Session {
  id: string          // UUID（タイムスタンプ+乱数）
  title: string       // 日時文字列 "YYYY/MM/DD HH:mm"
  model: string
  started_at: string  // ISO8601
  ended_at?: string
}

interface Message {
  id: string
  session_id: string
  role: 'user' | 'assistant' | 'system'
  content: string         // 生テキスト（toneTag含む）
  content_clean?: string  // toneTag除去済みテキスト
  tone?: string
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
  model         TEXT,
  latency_ms    INTEGER,
  ttft_ms       INTEGER,
  tokens_in     INTEGER,
  tokens_out    INTEGER,
  safety_flags  TEXT,
  error         TEXT,
  rating        TEXT,     -- 'good' | 'bad' | NULL
  created_at    TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);
```

**マイグレーション**: 既存DBへの `rating` カラム追加は `ALTER TABLE messages ADD COLUMN rating TEXT` で対応（エラーを無視して実行）。

### 5.3 設定ファイル

- **場所**: `%APPDATA%\learning-assistant\settings.json`（Windows）
- **形式**: JSON（`AppSettings` 型）
- **I/O**: `main/settings.ts` の `loadSettings()` / `saveSettings()`

### 5.4 CSVエクスポート形式

```
created_at,role,distance,ttft_ms,rating,content
2026-03-01T11:55:08.617Z,user,,0,,"質問テキスト"
2026-03-01T11:55:11.969Z,assistant,tutor,2313,good,"回答テキスト"
```

- `distance`: assistant行のみ記録、user行は空
- `content`: ダブルクォート囲み、内部の `"` は `""` エスケープ
- BOM付きUTF-8（Excelでの文字化け防止）
- ファイル名: `session_YYYY-MM-DD-HH-mm_モデル名.csv`

---

## 6. IPC通信仕様

### 6.1 IPC定数一覧（`main/types.ts`）

```typescript
export const IPC = {
  // チャット（send/on方式 = 双方向ストリーミング）
  CHAT_START:  'chat:stream:start',
  CHAT_ABORT:  'chat:stream:abort',
  CHAT_DELTA:  'chat:stream:delta',
  CHAT_DONE:   'chat:stream:done',
  CHAT_ERROR:  'chat:stream:error',

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
} as const
```

### 6.2 チャットストリーミングフロー

```
Renderer                          Main                        Ollama
   │                               │                            │
   │── CHAT_START(payload) ──────► │                            │
   │                               │── POST /api/chat ─────────►│
   │                               │◄─ chunk(delta) ────────────│
   │◄── CHAT_DELTA(delta) ───────  │                            │
   │◄── CHAT_DELTA(delta) ───────  │   （繰り返し）              │
   │                               │◄─ done ────────────────────│
   │◄── CHAT_DONE(ttft_ms) ──────  │                            │
   │                               │                            │
   │── CHAT_ABORT（任意）─────────► │  AbortController.abort()   │
```

### 6.3 新しいIPC機能の追加手順

```
1. main/types.ts の IPC オブジェクトに定数追加
2. main/main.ts に ipcMain.handle() または ipcMain.on() を追加
3. main/preload.ts の contextBridge に公開メソッドを追加
4. renderer/src/utils/electronAPI.ts に型・フォールバックを追加
5. 使用するコンポーネントから api.newMethod() として呼ぶ
```

---

## 7. コンポーネント仕様

### 7.1 App.tsx（ルートコンポーネント）

**責務**: 全体レイアウト、タブ管理、グローバル状態保持、アバター吹き出し制御

**状態**:

| 状態 | 型 | 説明 |
|------|-----|------|
| `motion` | `MotionName` | アクティブタブのアバターモーション |
| `settings` | `AppSettings \| null` | アプリ設定（初期ロード中はnull） |
| `bgDataUrl` | `string` | 背景画像のBase64 data URL |
| `models` | `string[]` | Ollamaから取得したモデル一覧 |
| `ollamaOnline` | `boolean \| null` | Ollama接続状態 |
| `avatarMessage` | `string \| null` | 吹き出しテキスト（null=非表示） |
| `tabs` | `TabInfo[]` | タブ一覧（最大5件） |
| `activeTabId` | `string` | アクティブタブID |

**Ref**:

| Ref | 型 | 用途 |
|-----|-----|------|
| `avatarMsgTimerRef` | `ReturnType<typeof setTimeout> \| null` | 吹き出し遅延タイマー |
| `isFirstResponse` | `boolean` | 初回レスポンス判定（最初のneutralでタイマーを起動しない） |
| `isPraiseRoute` | `boolean` | praiseルート中はneutral→タイマーをスキップ |

**吹き出し制御ロジック**:

```typescript
// 初期値
avatarMessage = '私に何を聞きたいの？'
isFirstResponse.current = true
isPraiseRoute.current = false

// handleMotionChange(m)
if m === 'think':
  avatarMessage = null
  isPraiseRoute = false
  タイマークリア
else if m === 'neutral':
  if isPraiseRoute: isPraiseRoute = false; return  // スキップ
  if isFirstResponse: isFirstResponse = false; return  // 初回はタイマー起動しない
  else: 10秒後に avatarMessage = 'まだ聞きたいことはあるかしら？' + motion = 'ask'

// handlePraiseReaction()
isPraiseRoute = true
avatarMessage = 'まだ聞きたいことはあるかしら？'
motion = 'ask'

// resetAvatarMessage()（タブ切替・クリア・新規タブ時）
タイマークリア
isFirstResponse = true
isPraiseRoute = false
motion = 'neutral'
avatarMessage = '私に何を聞きたいの？'
```

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
- タブ切替・新規タブ・タブ閉じ時に `resetAvatarMessage()` を呼ぶ

### 7.2 Chat.tsx

**責務**: メッセージ送受信、ストリーミング表示、セッション管理、評価、理解ワード検知、吹き出し表示

**Props**:

```typescript
interface Props {
  tabId: string
  settings: AppSettings
  models: string[]
  onMotionChange: (motion: MotionName) => void
  onSessionTitleChange: (tabId: string, title: string) => void
  onClearChat?: () => void         // チャットクリア時にApp.tsxへ通知
  onPraiseReaction?: () => void    // 理解ワード検知後のコールバック
  avatarMessage?: string | null    // App.tsxから受け取る吹き出しテキスト
}
```

**重要なRef**:

| Ref | 型 | 用途 |
|-----|-----|------|
| `currentRequestId` | `string \| null` | 進行中ストリームのID |
| `accumulatedContent` | `string` | ストリーム中の全文蓄積（非同期問題回避） |
| `assistantMsgId` | `string` | UIとDBで同一IDを使うための保持 |
| `motionTimerRef` | `ReturnType<typeof setTimeout> \| null` | neutral遷移タイマー |

**吹き出し表示条件**:

```typescript
const showAvatarMsg = !!avatarMessage && !isStreaming
// ストリーミング中は非表示。ユーザーメッセージ直後でも表示する（理解ワード検知後など）
```

**モーション遷移**:

```
ユーザー送信（通常）  → think
レスポンス完了        → toneTagに従う（なければ neutral）→ 3秒後 → neutral
理解ワード送信        → praise → 2秒後 → neutral → onPraiseReaction()
エラー発生            → neutral
チャットクリア        → neutral + onClearChat()
```

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
1. `{avatarPath}/{motion}.png` をBase64で読み込み
2. 読み込み失敗 → CSSプレースホルダーアバター

**画像読み込み**: `api.readAvatarFile(filePath)` → Base64 data URL → `<img src>` に設定  
**フェードイン**: `visible` フラグで `opacity: 0 → 1` のトランジション

### 7.4 SettingsModal.tsx

**セクション一覧**:

| セクション | 設定項目 | 型 |
|-----------|---------|-----|
| 🔗 Ollama URL | 接続先URL | string |
| 🎭 アバター | フォルダパス | string（フォルダ選択ダイアログ） |
| 🖼️ 背景画像 | 画像ファイルパス | string（PNG/JPG/WebP/GIF） |
| 💬 距離感 | friend/tutor/buddy/calm/cheerful | Distance |
| 💡 理解・納得ワード | ワード一覧（タグUI） | string[] |
| 🎨 テーマ | auto/dark/light | string |
| ♿ アクセシビリティ | reducedMotion | boolean |
| ⏱ タイムアウト | streamTimeout (秒, 10〜300) | number |

**理解ワードUI仕様**:
- 登録済みワードをタグ形式で表示（✕ボタンで削除）
- テキストフィールドにワードを入力してEnterキーまたは「追加」ボタンで追加
- 重複チェックあり（同一ワードは追加しない）

---

## 8. 設定仕様

### 8.1 設定の永続化

```typescript
// main/settings.ts
function loadSettings(): AppSettings   // JSONファイル読み込み + DEFAULT_SETTINGSでデフォルト補完
function saveSettings(s: AppSettings)  // JSONファイル書き込み
```

### 8.2 設定項目の追加手順

```
1. main/types.ts の AppSettings インターフェースに項目追加
2. main/types.ts の DEFAULT_SETTINGS にデフォルト値追加
3. renderer/src/utils/electronAPI.ts の fallback オブジェクトにも追加
4. renderer/src/components/SettingsModal.tsx に UIセクションを追加
5. 使用箇所で settings.newProp として参照
```

### 8.3 アバターパスの自動設定

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
// 例: "2026/03/01 14:30"
`${YYYY}/${MM}/${DD} ${HH}:${mm}`
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

- フォルダ内の `{motionName}.png` を直接参照（IPC経由でBase64読み込み）
- 5種類のモーション: `neutral`, `think`, `explain`, `praise`, `ask`
- 推奨画像サイズ: 400×600px（縦長2:3比率）
- アバターペイン幅: 220px

### 10.2 CSSプレースホルダー

アバター未設定または読み込み失敗時に表示されるCSS製キャラクター。  
各モーションに対応したポーズ・表情・オーラアニメーションあり。

### 10.3 モーション一覧

| MotionName | 用途 | アバター挙動 |
|-----------|------|------------|
| `neutral` | 待機・デフォルト | 通常立ち |
| `think` | LLM処理中 | 考えるポーズ |
| `explain` | 説明・回答 | 解説ポーズ |
| `praise` | 理解・納得ワード検知時 | 称賛ポーズ |
| `ask` | 質問・確認 | 問いかけポーズ |

---

## 11. システムプロンプト仕様

`renderer/src/utils/systemPrompt.ts` の `buildSystemPrompt(distance)` が生成。

```
あなたは"学習支援に特化したAIコーチ"です。以下を厳守してください：
- 宗教・文化・価値観・恋愛について中立で、押し付けない。
- 親しみは示すが、依存を助長しない。学習行動につながる具体的提案を優先する。
- セクシャル/不適切表現は行わず、教育目的に集中する。
- 距離感（トーン）={distance} を保つ（friend/tutor/buddy/calm/cheerful）。
- 回答は簡潔→必要なら箇条書き→最後に次アクション（小さな一歩）を示す。
- 不明点は確認質問を返し、推測で断定しない。

【toneTag ルール — 必ず守ること】
応答テキストの最後の行に、以下の形式で toneTag を1つだけ出力すること。

正しい形式（このフォーマット以外は絶対に使わないこと）:
<toneTag name="neutral" />
<toneTag name="explain" />
<toneTag name="praise" />
<toneTag name="ask" />
<toneTag name="think" />

禁止（使ってはいけない形式の例）:
**neutral** / （neutral） / [neutral] / <neutral> / ```neutral``` など上記以外の形式はすべて禁止。

name の値の選び方:
- neutral : 挨拶・雑談・一般的な受け答え
- explain : 概念・手順・理由を説明するとき
- praise  : ユーザーが「なるほど」「わかりました」など理解・納得を示したとき
- ask     : ユーザーに確認や質問を返すとき
- think   : システムが自動設定するため、自分では使わないこと
```

**重要**: `think` はユーザー送信時にシステムが自動設定するため、LLMには使わせない。

---

## 12. toneTagパーサー仕様

`renderer/src/utils/parseTone.ts` の `parseToneTagged(text)` が処理。

### 12.1 対応パターン

モデルによってtoneTagの出力形式が異なるため、4パターンすべてを吸収する：

| パターン | 例 | 対応正規表現 |
|---------|-----|------------|
| 正規形 | `<toneTag name="neutral" />` | `TONE_TAG` |
| パイプ区切り複数値 | `<toneTag name="neutral\|explain">` | `TONE_TAG` |
| Markdown太字 | `**<toneTag name="neutral" />**` | `TONE_TAG` |
| XML省略形 | `**<neutral>**` / `<neutral />` | `TONE_SHORT` |
| タグなし太字 | `**neutral**` | `TONE_BARE` |
| 括弧付き太字 | `(**neutral**)` / `（**neutral**）` | `TONE_BARE` |

### 12.2 抽出優先順位

```
1. TONE_TAG （正規形・パイプ区切り対応）
2. TONE_SHORT （XML省略形）
3. TONE_BARE （タグなし太字・括弧付き）
4. デフォルト: 'neutral'
```

### 12.3 戻り値

```typescript
function parseToneTagged(text: string): { tone: MotionName; clean: string }
// tone:  抽出されたMotionName
// clean: toneTag全パターンを除去したテキスト（表示用）
```

### 12.4 既知のモデル別出力形式

| モデル | 観測された形式 |
|--------|-------------|
| qwen3系 | `<toneTag name="neutral" />` / `**<neutral>**` |
| qwen3:1.7b | `**neutral**` / `(**neutral**)` |
| granite3.3:2b | `**explain**` / `(**explain**)` |

新しいモデルで未対応の形式が出た場合は `parseTone.ts` に正規表現を追加する。

---

## 13. アバター吹き出し仕様

### 13.1 概要

チャットエリア内にアバターからのセリフをUI演出として表示する機能。  
**DBへの保存は行わない**（純粋なUI演出）。

### 13.2 表示タイミングと内容

| タイミング | 表示テキスト | モーション |
|-----------|------------|-----------|
| セッション開始時（初期値） | 「私に何を聞きたいの？」 | neutral |
| 通常レスポンス完了から10秒後 | 「まだ聞きたいことはあるかしら？」 | ask |
| 理解ワード検知後 | 「まだ聞きたいことはあるかしら？」 | ask |

### 13.3 非表示タイミング

- ユーザーがメッセージ送信した瞬間（`think` モーション時）
- ストリーミング中（`isStreaming === true`）

### 13.4 リセットタイミング

`resetAvatarMessage()` が呼ばれ「私に何を聞きたいの？」に戻る：
- タブ切替時
- 新規タブ追加時
- タブ閉じ時
- チャットクリア時

### 13.5 吹き出しのスタイル

```css
/* ライトモード: 濃い紫がかった黒 */
color: #1a1730;

/* ダークモード: 薄い紫白 */
@media (prefers-color-scheme: dark) {
  color: #e2d9ff;
}

background: rgba(167, 139, 250, 0.15);
border: 1px dashed rgba(167, 139, 250, 0.5);
```

---

## 14. 理解・納得ワード検知仕様

### 14.1 概要

ユーザーが理解・納得を示すワードだけを送信した場合、LLMに送信せずにpraiseモーションで応答する機能。

### 14.2 検知ロジック（`Chat.tsx`）

```typescript
function buildUnderstandingRegex(words: string[]): RegExp {
  if (words.length === 0) return /(?!)/  // マッチしない正規表現
  const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^(${escaped.join('|')})[。、！!…\\s]*$`, 'i')
}
```

- 入力テキスト全体が理解ワード（＋句読点・感嘆符・空白）のみで構成される場合にマッチ
- 大文字小文字を無視（`'i'` フラグ）

### 14.3 検知時の動作フロー

```
1. ユーザーメッセージをUIに表示
2. DBにユーザーメッセージを保存（tone: 'neutral'）
3. onMotionChange('praise')
4. 2秒後: onMotionChange('neutral') → onPraiseReaction()
   ├─ App.tsx: isPraiseRoute = true
   ├─ avatarMessage = 'まだ聞きたいことはあるかしら？'
   └─ motion = 'ask'
5. App.tsx の handleMotionChange('neutral') は isPraiseRoute = true のためタイマーをスキップ
```

**LLMへは送信しない** — アシスタントメッセージはUIにもDBにも生成されない。

### 14.4 デフォルト理解ワード一覧

```
なるほど / わかりました / 了解 / 理解しました / わかった /
ok / okay / そうか / なるほどね / そうですか / そうなんですね
```

ユーザーは設定画面の「💡 理解・納得ワード」セクションで追加・削除可能。

---

## 15. 非機能要件

### 15.1 セキュリティ

| 設定 | 値 | 理由 |
|------|-----|------|
| `contextIsolation` | `true` | Renderer/Mainの隔離 |
| `nodeIntegration` | `false` | RendererからのNode.js直接アクセス禁止 |
| `sandbox` | `false` | preloadスクリプトの実行に必要 |
| CSP | file:// 制限のためアバター/背景をBase64で渡す | XSS対策 |

### 15.2 パフォーマンス

- 非アクティブタブは `display: none` でマウント維持（再レンダリングなし）
- ストリーミングデルタは `accumulatedContent` Refに直接蓄積（setState非同期問題回避）
- `persistDb()` はDB操作のたびに呼び出す（データ損失防止）

### 15.3 DevTools

- 開発時も自動起動しない（`openDevTools()` を削除済み）
- 手動起動: `Ctrl+Shift+I`

---

## 16. ビルド・配布仕様

### 16.1 ビルドフロー

```
npm run build
  └─► vite build         → dist/（Renderer成果物）
  └─► tsc -p tsconfig.electron.json → dist-electron/（Main成果物）

npm run dist:win
  └─► electron-builder --win → release/*.exe（NSISインストーラー）
```

### 16.2 同梱リソース

```json
"extraResources": [
  { "from": "assets", "to": "assets", "filter": ["**/*"] }
]
```

### 16.3 開発時クリーンビルド

`scripts/dev-electron.js` により `dist-electron/` を毎回削除してからビルド（古いファイルの混入防止）。

---

## 17. SDD開発ガイド（Claude向け）

### 17.1 開発の前提

1. **この仕様書を先に読む**: 変更前に必ず関連セクションを確認する
2. **型安全を守る**: `main/types.ts` の型定義を変更した場合は、`preload.ts`・`electronAPI.ts`・使用箇所をすべて更新する
3. **IPC定数を使う**: 文字列リテラルを直接書かず、必ず `IPC.CHAT_START` のような定数を使う

### 17.2 React非同期の注意点（既知のバグパターン）

**問題**: `setState` のコールバック内で変数を設定し、その直後に非同期処理で使おうとしても値が空になる

```typescript
// ❌ 誤り: setMessages内の変数は非同期で確定しない
setMessages(prev => {
  finalContent = prev[prev.length-1].content
})
await api.appendMessage({ content: finalContent })  // 空！

// ✅ 正しい: Refに直接蓄積する
accumulatedContent.current += delta
await api.appendMessage({ content: accumulatedContent.current })  // 確実
```

### 17.3 吹き出し制御の注意点

**問題**: `handleMotionChange('neutral')` が複数のルート（通常レスポンス完了・praiseルート）から呼ばれるため、どのルートか区別が必要。

**解決策**: `isPraiseRoute` Refフラグで制御する。

```typescript
// praiseルートではフラグを立ててからonPraiseReactionを呼ぶ
isPraiseRoute.current = true
setAvatarMessage('まだ聞きたいことはあるかしら？')
setMotion('ask')

// handleMotionChange内でフラグをチェック
if (m === 'neutral' && isPraiseRoute.current) {
  isPraiseRoute.current = false
  return  // タイマーを起動しない
}
```

### 17.4 toneTagパーサーの拡張方法

新しいモデルで未対応の形式が出た場合：

```typescript
// parseTone.ts に新しいパターンを追加する
const TONE_NEW = /新しいパターンの正規表現/g

// parseToneTagged内で優先順位に応じて追加
// cleanのreplace chainにも追加する
const clean = text
  .replace(TONE_TAG, '')
  .replace(TONE_SHORT, '')
  .replace(TONE_BARE, '')
  .replace(TONE_NEW, '')   // ← 追加
  .replace(EMPTY_LINE, '')
  .trimEnd()
```

### 17.5 DBスキーマ変更時の注意

既存ユーザーのDBにカラムが存在しない場合を考慮し、`initStore()` 内に `ALTER TABLE` マイグレーションを追加する：

```typescript
try { db.run('ALTER TABLE messages ADD COLUMN new_col TEXT') } catch {}
// 既存カラムのエラーを無視してOK
```

### 17.6 バージョン管理規則

| 変更種別 | バージョン例 | 内容 |
|---------|------------|------|
| 機能追加 | v0.1.8 → v0.1.9 | 新機能・UI変更 |
| バグ修正 | v0.1.9 → v0.1.9b | 同一機能の不具合修正 |
| 小さな修正 | v0.1.9b → v0.1.9c | 1〜2ファイルの局所修正 |

アーカイブは `learning-assistant-v{version}.zip`（`node_modules`・`dist-electron`・`dist` を除外）として保存する。

### 17.7 次バージョン候補機能（バックログ）

| 優先度 | 機能 | 概要 |
|-------|------|------|
| High | Markdownレンダリング | `react-markdown` + `remark-gfm`（ネット接続時に導入） |
| High | 本番ビルド検証 | `npm run dist:win` でのパッケージ動作確認 |
| Medium | キーボードショートカット | `Ctrl+L` でチャットクリアなど |
| Medium | セッション検索 | セッション履歴モーダルにキーワード検索 |
| Medium | 吹き出しメッセージのカスタマイズ | 設定画面でテキストを変更可能に |
| Low | モデル自動更新 | 起動時にOllamaのモデル一覧を自動再取得 |
| Low | アバター2:3比率対応 | アバターペイン幅を300pxに拡張 |
