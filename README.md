# 学習アシスタント Hotori

Electron + React + Vite + TypeScript + Ollama による学習支援デスクトップアプリ

## 必要環境

- Node.js 20+
- [Ollama](https://ollama.com/) (起動済み)
- 推奨モデル: `qwen3:4B`
- 動作確認済み最小モデル: `qwen3:0.6B`

## セットアップ

```bash
npm install
npm run dev
```

## ビルド・配布 (Windows)

```bash
npm run dist:win
```

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

アバターが未設定の場合は、組み込みのCSSアニメーションプレースホルダーが表示されます。
