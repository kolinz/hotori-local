# 学習アシスタント Hotori

Electron + React + Vite + TypeScript + Ollama による学習支援デスクトップアプリ

## 必要環境

- Node.js 20+
- [Ollama](https://ollama.com/) (起動済み)
- 推奨モデル: `ollama pull qwen2.5:7b-instruct`

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

### 画像仕様

| 項目 | 推奨サイズ | 対応形式 | 備考 |
|------|-----------|---------|------|
| アバター画像 | 400 × 600 px | PNG のみ | 縦長2:3比率。表示エリア幅220px |
| 背景画像 | 1280 × 800 px | PNG / JPG / WebP / GIF | アプリウィンドウ比率に合わせてトリミングされます |

### アバターフォルダ構成

フォルダ内に以下の5ファイルを用意してください。

```
assets/avatar/default-static/ 
  neutral.png   # 通常
  think.png     # 考え中
  explain.png   # 説明
  praise.png    # 褒める
  ask.png       # 質問
```

アバターが未設定の場合は、組み込みのCSSアニメーションプレースホルダーが表示されます。
