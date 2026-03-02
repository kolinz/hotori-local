# 学習アシスタント Hotori

Electron + React + Vite + TypeScript + Ollama による学習支援デスクトップアプリ

## 特長

- AIモデルとの会話をCSVファイルとしてダウンロードする機能。ChatGPTやGeminiに課金してもない機能
- 親近感を持つ画像設定。アバター画像と背景画像は任意のものに変更可能。
- 会話（レスポンス）の評価機能。Good or Bad
- セルフホスト型およびPC内運用のローカルLLMおよびSLM向け

## 必要環境

- Node.js 20+
- [Ollama](https://ollama.com/) (起動済み)
- 動作確認済みモデル: `llama3.2:3b`, `gemma3:1b`, `qwen3:0.6b`, `qwen3:1.7b`, `qwen3:4b`

## セットアップ

```bash
npm install
npm audit fix --force
npm run dev
```

## ビルド・配布 (Windows)

```bash
npm run dist:win
```

## モデル別動作メモ

| モデル | 評価 | 備考 |
|--------|------|------|
| llama3.2:3b | ⭐ 推奨 | バランス良好、日本語安定、TTFT約2.6秒 |
| gemma3:1b | ⭐ 推奨 | 内容充実、高速（TTFT約860ms）、Markdown出力あり |
| qwen3:0.6b | △ | 軽量だが回答が薄め |
| qwen3:1.7b | △ | システムプロンプト追従が弱い場合あり |
| qwen3:4b | △ | 応答に時間がかかる（TTFT約23秒） |

## ディレクトリ構成

```
main/
  main.ts        # Electron Main
  preload.ts     # contextBridge API定義
  ollama.ts      # Ollama ストリーミングクライアント
  store.ts       # SQLite + JSONL ログ
  settings.ts    # 設定ファイル管理
  types.ts       # 共有型定義

renderer/src/
  App.tsx
  components/
    Chat.tsx           # メインチャットUI
    AvatarLayer.tsx    # アバター背景レイヤ
    SettingsModal.tsx  # 設定画面（アバター設定含む）
    SessionsModal.tsx  # 履歴・エクスポート
    OllamaGuide.tsx    # Ollama未起動ガイド
  utils/
    electronAPI.ts     # window.electronAPI ラッパー
    parseTone.ts       # toneTagパーサ
    systemPrompt.ts    # システムプロンプト生成

assets/avatar/
  manifest.json       # アバターマニフェストのサンプル
```

## アバター設定

設定画面からアバターフォルダを指定できます。  
フォルダ構成は `assets/avatar/manifest.json` を参考にしてください。

```
my-avatar/
  manifest.json
  webm/
    neutral.webm
    think.webm
    explain.webm
    praise.webm
    ask.webm
  png/
    neutral/0001.png, 0002.png ...
    think/...
```

アバターが未設定の場合は、組み込みのCSSアニメーションプレースホルダーが表示されます。****
