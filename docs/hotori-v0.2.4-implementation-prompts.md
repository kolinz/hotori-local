# Hotori v0.2.4 再現実装プロンプト集

仕様書 `hotori-specification-SDD-v0.2.4.md` を渡した上で、**①〜⑪の順番に実行**してください。  
各プロンプトは Claude（claude.ai）・Claude Code のどちらでも使用できます。

---

## 事前準備

- `hotori-specification-SDD-v0.2.4.md` を用意する
- **Claude.ai の場合**: プロジェクト知識に SDD を追加しておくと、毎回貼り付けなくて済む
- **Claude Code の場合**: リポジトリの `docs/` に SDD を置き、`@docs/hotori-specification-SDD-v0.2.4.md` で参照する

---

## ① プロジェクト初期化・型定義・IPC定数

```
添付の仕様書（hotori-specification-SDD-v0.2.4.md）をもとに、
Electron + React + TypeScript + Vite のプロジェクトを初期構築してください。

【作成するもの】
1. package.json（§2.1 依存パッケージ、§2.3 開発コマンド）
   - electron: ^40.8.0、electron-builder: ^26.8.1
   - npm overrides は不要（削除済み）
2. vite.config.ts / tsconfig.json（Electron + React 構成）
3. main/types.ts
   - §6.1 IPC定数（COLLECTION_REVIEW_PAIR を含む）
   - §8.1 全AppSettings型（distanceEnabled: boolean を含む）
   - §5.1 の Session/Message/MixingCollection/MixingPair 型
     （MixingPair に needs_review: number を含む）
   - ConnectionMode/Distance/MotionName/Rating 型
   - DEFAULT_SETTINGS（distanceEnabled: false、toneTagEnabled: false、enabledMotions: []）
   - OPENAI_PRESET_MODELS、GEMINI_PRESET_MODELS
4. §4 ディレクトリ構成のフォルダ・空ファイルをすべて作成

【制約】
- contextIsolation: true、nodeIntegration: false を厳守（§3.3）
- IPC名は文字列リテラルでなく必ず IPC.XXX 定数を使う（§18.1）
```

---

## ② Mainプロセス基盤（設定・DB・preload）

```
添付の仕様書（hotori-specification-SDD-v0.2.4.md）をもとに、
Electron Mainプロセスの基盤ファイルを実装してください。

【作成するもの】
1. main/settings.ts
   - §5.3: loadSettings() / saveSettings()
   - 保存先: %APPDATA%/learning-assistant/settings.json
   - DEFAULT_SETTINGS でフォールバック

2. main/store.ts
   - §5.1: SQLスキーマ（sessions / messages / mixing_collections / mixing_pairs テーブル）
   - §5.2: マイグレーション（ALTER TABLE を try/catch で囲む）
     - mixing_pairs に needs_review INTEGER NOT NULL DEFAULT 1 を追加
   - §9.2: createSession / appendMessage / listSessions / getSession / getSessionMessages
   - §5.4: exportSessionCsv（BOM付きUTF-8）
   - §15: listCollections / createCollection / renameCollection / deleteCollection
         / listPairs / addPair / removePair / reorderPairs / exportCollectionCsv
   - reviewPair(pairId: string, needsReview: boolean)（v0.2.4追加）
     - needs_review を 0/1 でDB更新
   - addPair は常に needs_review=1 で挿入
   - exportCollectionCsv のヘッダーに needs_review カラムを追加
     （collection_name, order, needs_review, session_title, session_date, model, rating, user_content, assistant_content）
   - rateMessage / deleteSession / clearAllSessions

3. main/preload.ts
   - contextBridge で §6.1 の全IPC定数をラップして expose
   - reviewPair: (pairId: string, needsReview: boolean): Promise<void>
     → ipcRenderer.invoke(IPC.COLLECTION_REVIEW_PAIR, pairId, needsReview) を追加
   - §3.3: contextIsolation 厳守
```

---

## ③ ストリーミングクライアント（4モード）

```
添付の仕様書（hotori-specification-SDD-v0.2.4.md）をもとに、
4種のストリーミングクライアントを実装してください。

【作成するもの】
1. main/ollama.ts
   - streamChat(ollamaUrl, model, messages, callbacks, signal, timeoutMs)
   - listModels(ollamaUrl): string[] を返す

2. main/openai.ts
   - streamChatOpenAI(baseUrl, apiKey, model, messages, callbacks, signal, timeoutMs)
   - fetch で SSEストリーミング、data: [DONE] で終了

3. main/gemini.ts
   - openai.ts のコピーベースで作成
   - 関数名: streamChatGemini(baseUrl, apiKey, model, messages, callbacks, signal, timeoutMs)
   - URLパスは ${normalizedBase}chat/completions（baseUrl末尾スラッシュを正規化して結合）
   - /v1/ は含まない（baseUrl が既に v1beta/ を含むため）

4. main/dify.ts
   - streamDifyChat(difyUrl, apiKey, userQuery, callbacks, signal, timeoutMs)
   - Chatbot / Agent アプリタイプ両対応
   - messages 引数は受け取らない（§6.4: Dify は会話管理を Dify 側が担う）

【共通仕様】
- callbacks: { onDelta, onDone, onError }
- AbortSignal 対応（CHAT_ABORT IPC から中断）
- タイムアウトは setTimeout + callbacks.onError で実装
```

---

## ④ Main IPC ハブ（main.ts）

```
添付の仕様書（hotori-specification-SDD-v0.2.4.md）をもとに、
main/main.ts を実装してください。

【実装すべきIPC】
- §3.2 CHAT_START: 4方向分岐（openai / gemini / dify / ollama）
- CHAT_ABORT: activeStreams Map で AbortController 管理
- §6.5 MODELS_LIST: openai→openaiModels / gemini→geminiModels / dify→[] / ollama→listModels()
- §6.1 全IPC定数に対応するハンドラ（Logs / Settings / Avatar / Dialog / Collections）
- COLLECTION_REVIEW_PAIR ハンドラを追加（v0.2.4追加）
  → store.reviewPair(pairId, needsReview) を呼び出す
- BrowserWindow 生成時に loadSettings() でテーマ適用
- アプリ起動時にデフォルトアバターパスを自動設定（avatarPath が空の場合のみ）

【制約】
- §18.1: IPC名は IPC.XXX 定数のみ使う
```

---

## ⑤ Renderer基盤（electronAPI・CSS変数）

```
添付の仕様書（hotori-specification-SDD-v0.2.4.md）をもとに、
Rendererプロセスの基盤を実装してください。

【作成するもの】
1. renderer/src/utils/electronAPI.ts
   - ElectronAPI インターフェース定義（§6.1 全IPC対応）
   - reviewPair: (pairId: string, needsReview: boolean) => Promise<void> を追加（v0.2.4）
   - window.electronAPI が存在しない場合のフォールバック実装
   - フォールバックの getSettings は §8.1 DEFAULT_SETTINGS と同じ値を返す
     - distanceEnabled: false を含める（v0.2.4追加）
     - geminiApiKey: '' / geminiModels: [] / geminiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/'

2. renderer/src/index.css（CSS変数）
   - --bg-primary / --bg-panel / --bg-input
   - --text-primary / --text-secondary / --text-muted
   - --border / --border-hover
   - --accent（#7c3aed）/ --accent-soft / --accent-glow
   - --radius-sm / --radius-md / --radius-lg
   - --font-size-sm / --font-size-base
   - ダーク / ライト / auto の3テーマ対応
```

---

## ⑥ toneTagパーサー・systemPrompt

```
添付の仕様書（hotori-specification-SDD-v0.2.4.md）をもとに、以下を実装してください。

1. renderer/src/utils/parseTone.ts（§12）
   - parseTone(text: string): { clean: string; tone: MotionName }
   - 対応フォーマット: [tone:xxx] / <tone>xxx</tone> / **[TONE: xxx]** / (tone: xxx)
   - LLM がtoneタグを出力に模倣しないよう clean からタグを除去する

2. renderer/src/utils/systemPrompt.ts（§11）
   - buildSystemPrompt(distance: Distance, toneTagEnabled: boolean, distanceEnabled: boolean): string
   - distanceEnabled が false のとき、距離感の指示を除外する（v0.2.4追加）
   - toneTagEnabled が true のとき [tone:xxx] 指示を自然言語で付加
   - Dify モードでは呼び出さない（§6.4）
```

---

## ⑦ Chat.tsx（コアUI）

```
添付の仕様書（hotori-specification-SDD-v0.2.4.md）をもとに、
renderer/src/components/Chat.tsx を実装してください。

【仕様の参照箇所】
- §7.2: props / 状態 / selectedModel追従useEffect / 理解ワード検知 / ストリーミングフロー
- §9.2: メッセージ保存フロー
- §13: showAvatarMsg 条件
- §14: buildUnderstandingRegex でユーザー入力を判定

【v0.2.4追加: セッション中接続モード・モデルリスト固定】
- sessionModeRef: useRef<ConnectionMode | null>(null) を追加
- sessionModelsRef: useRef<string[]>([]) を追加
- 初回送信時に sessionModeRef.current = settings.connectionMode と
  sessionModelsRef.current = models を記録
- セッション中はすべての分岐で sessionModeRef.current を使用
- クリア時に sessionModeRef.current = null / sessionModelsRef.current = [] をリセット

【v0.2.4追加: モデルバーUI】
- セッション開始後（sessionCreated）、modelSelect クラスで接続モード名を読み取り専用表示
  （cursor: default / opacity: 0.75）
- セッション中のモデルリストは sessionModelsRef.current を使用（設定変更の影響を受けない）
- モデルセレクタは disabled={isStreaming} のみ（セッション中も変更可能）

【v0.2.4追加: エラーメッセージ改善】
- onChatError 時、sessionModeRef.current !== settings.connectionMode の場合は
  「接続モードがセッション開始時から変更されています。チャットをクリアして新しいセッションを開始してください。」
- 通常エラーの場合は「接続モードやAPIキー・モデル名の設定をご確認ください。」
  をエラーメッセージ末尾に付加

【重要】§18.4
accumulatedContent は必ず useRef で管理する。
setMessages 内の変数は非同期で確定しないため、
Ref に直接蓄積してから api.appendMessage に渡すこと。
```

---

## ⑧ AvatarLayer.tsx・OllamaGuide.tsx

```
添付の仕様書（hotori-specification-SDD-v0.2.4.md）をもとに、以下を実装してください。

1. renderer/src/components/AvatarLayer.tsx（§10）
   - props: { motion: MotionName, avatarPath: string, reducedMotion: boolean }
   - 静止画モード: avatarPath/neutral.png など5枚を motion に応じて切り替え（フェードアニメーション）
   - 未設定時: CSSアニメーションのプレースホルダーキャラクター表示
   - reducedMotion: true のときアニメーション無効

2. renderer/src/components/OllamaGuide.tsx
   - props: { connectionMode: ConnectionMode }
   - ollama: Ollama インストール・起動手順
   - openai: APIキー・モデル設定手順
   - gemini: Google AI Studio（https://aistudio.google.com/app/apikey）でAPIキー取得手順
   - dify: （isOffline 判定は difyApiKey が空の場合のみなので表示不要）
```

---

## ⑨ SettingsModal.tsx

```
添付の仕様書（hotori-specification-SDD-v0.2.4.md）をもとに、
renderer/src/components/SettingsModal.tsx を実装してください。

【§7.3 の仕様に厳密に従うこと】

接続モード選択:
- <select> は使用しない
- distanceBtn / distanceGrid CSS クラスを流用したボタングリッド

4モード別設定UI:
- Ollama: ollamaUrl テキスト入力
- OpenAI: openaiBaseUrl / openaiApiKey（パスワード+表示切替）
         / モデル管理（チップ + OPENAI_PRESET_MODELS + 手動追加）
- Gemini: geminiBaseUrl / geminiApiKey（パスワード+表示切替）
         / モデル管理（チップ + GEMINI_PRESET_MODELS + 手動追加）
         / Google AI Studio へのリンク
- Dify: difyUrl / difyApiKey（パスワード+表示切替）

その他セクション:
- アバターフォルダ / 背景画像（ファイルダイアログ）
- toneTag / モーション on/off
- 距離感有効化チェックボックス（v0.2.4追加）
  - チェックONのときのみ距離感ボタングリッドを表示（toneTagと同じパターン）
- 理解・納得ワード管理
- テーマ・アクセシビリティ・タイムアウト
- 学習コレクション最大件数

draft 初期化（§7.3）:
- difyUrl / difyApiKey / geminiApiKey / geminiModels / geminiBaseUrl / maxCollections
  / distanceEnabled のフォールバック値を ...settings の前に設定する
```

---

## ⑩ SessionsModal・CollectionPanel・App.tsx 統合

```
添付の仕様書（hotori-specification-SDD-v0.2.4.md）をもとに、
残りのコンポーネントと App.tsx を実装してください。

1. SessionsModal.tsx（§7、§9）
   - セッション一覧表示・削除・全クリア・CSV エクスポート
   - 👁 ボタンでセッション詳細プレビュー（v0.2.1追加）
   - メッセージ行クリックで全文展開

2. CollectionPanel.tsx（§15）
   - コレクション一覧・作成・リネーム・削除
   - ペア一覧展開・削除・並び替え
   - ↻ ヘッダー再読み込みボタン（スピンアニメーション付き）
   - AddToCollectionPopup は Chat.tsx から呼び出す named export

   【v0.2.4追加: コレクションプレビューモーダル】
   - プレビューモーダルを開くたびに api.listPairs() でDBから最新データを取得（キャッシュ不使用）
   - 取得中は「読み込み中…」を表示
   - テーブルに「要確認フラグ」列を追加（チェックボックス）
   - チェックボックス操作はstateのみ変更（即時DB保存しない）
   - ヘッダーの「💾 保存」ボタンで変更分（changedIds: useRef<Set<string>>）をまとめてDB保存
   - 変更がない場合は保存ボタンを disabled 表示
   - 保存完了後2秒間「✅ 保存済み」と表示

3. App.tsx（§7.1）
   - 4モード別 isOffline 判定・resolvedSettings・モデル取得 useEffect
   - 右ペイン縦タブ（avatar / collection）+ リサイズハンドル
     （MIN: 180 / MAX: 400 / DEFAULT: 220）
   - localStorage 永続化キー: hotori.rightTab / hotori.rightWidth
   - isPraiseRoute / isFirstResponse フラグによる吹き出し制御（§13.4）
   - useEffect 依存配列:
     [settings?.connectionMode, settings?.openaiModels, settings?.ollamaUrl,
      settings?.difyApiKey, settings?.geminiApiKey, settings?.geminiModels]
```

---

## ⑪ ビルド確認・最終調整

```
添付の仕様書（hotori-specification-SDD-v0.2.4.md）の §17 ビルド・配布仕様と
§18.1 開発の前提をもとに、以下を確認・修正してください。

1. npm run dist:win で TypeScript エラーがないことを確認
2. main/types.ts の型定義と preload.ts / electronAPI.ts の整合性チェック
   - MixingPair.needs_review: number が全ファイルで一致しているか
   - reviewPair の引数型（pairId: string, needsReview: boolean）が一致しているか
3. package.json の version が "0.2.4" になっているか確認
4. electron-builder の設定（appId / productName / nsis設定）
5. assets/avatar/default-static/ に neutral.png 等5枚が配置されているか確認
6. npm audit で 0 vulnerabilities であることを確認

ビルドエラーが出た場合は §18.4 React非同期の注意点も確認してください。
```

---

## よくあるバグと対処プロンプト

### selectedModel が切り替え時に追従しない

```
§18.5 selectedModel 追従パターンをもとに、
接続モード切り替え時に selectedModel が古いモデル名のままになるバグを修正してください。
```

### TypeScript ビルドエラー

```
npm run dist:win で出た以下のビルドエラーを修正してください。

[エラーログを貼り付ける]

§18.1 の型安全ルールに従い、
main/types.ts の型定義と preload.ts / electronAPI.ts の整合性を確認してください。
```

### 新しい接続モードを追加したい

```
§18.2 接続モード追加手順の7ステップに従い、
ConnectionMode に '[モード名]' を追加してください。

変更対象ファイル:
1. main/types.ts
2. main/[newmode].ts（新規作成）
3. main/main.ts
4. SettingsModal.tsx
5. App.tsx
6. OllamaGuide.tsx
7. electronAPI.ts
```

### 要確認フラグが保存されない

```
コレクションプレビューモーダルで要確認フラグのチェックを変更しても
再度開くと元に戻る場合は、以下を確認してください。

1. preload.ts に reviewPair の IPC ブリッジが追加されているか
   → ipcRenderer.invoke(IPC.COLLECTION_REVIEW_PAIR, pairId, needsReview)
2. main.ts に COLLECTION_REVIEW_PAIR ハンドラが追加されているか
   → store.reviewPair(pairId, needsReview) を呼び出す
3. CollectionPreviewModal が開くたびに api.listPairs() でDBから最新データを取得しているか
   → initialPairs キャッシュを使っていないか確認
```

---

## 注意点

| 項目 | 内容 |
|------|------|
| **実装順序** | ①→②→③→...の順を守る。型定義（①）が揃う前に UI（⑦〜⑩）を実装しない |
| **最重要制約** | `accumulatedContent` は必ず `useRef` で管理（§18.4）。`setMessages` 内の変数は非同期で確定しない |
| **Gemini URL** | `${normalizedBase}chat/completions` と結合。`/v1/` を挟まない |
| **接続モードUI** | `<select>` は使用しない。`distanceBtn` ボタングリッドで実装（ダークモード文字色問題のため） |
| **IPC名** | 文字列リテラル禁止。必ず `IPC.XXX` 定数を使う（§18.1） |
| **needs_review** | addPair は常に `needs_review=1` で挿入。reviewPair でのみ更新する |
| **プレビューモーダル** | 開くたびに `api.listPairs()` でDB取得。キャッシュ（`pairs[id]`）は使わない |
| **sessionModeRef** | 初回送信時に固定、クリア時に `null` リセット。`sessionModelsRef` も同様 |
