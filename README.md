# 学習アシスタント Hotori

Electron + React + Vite + TypeScript + Ollama による学習支援デスクトップアプリ

## 特長

- SDDで開発のため、[仕様書](https://github.com/kolinz/hotori-local/blob/main/docs/hotori-specification-SDD-v0.1.9b.md)付き
- セルフホスト型およびPC内運用のローカルLLMおよびSLM、OpenAI API向けUI
- AIモデルとの会話をCSVファイルとしてダウンロードする機能。ChatGPTやGeminiに課金してもない機能
- 親近感を持つ画像設定。アバター画像と背景画像は任意のものに変更可能。
- 会話（レスポンス）の評価機能。Good or Bad
- マルチ教師蒸留（multi‑teacher distillation）

## 必要環境

- Node.js 20+
- [Ollama](https://ollama.com/) (起動済み)
- Ollama 動作確認済みモデル: `llama3.2:3b`, `gemma3:1b`, `qwen3:0.6b`, `qwen3:1.7b`, `qwen3:4b`
- OpenAI APIキー（OpenAIのモデルを使いたい場合のみ）

## セットアップ

```bash
npm install
npm audit fix --force
npm run dev
```

## ビルド・配布 (Windows)

Windows環境では、ターミナルアプリを「管理者として実行」を行ってください。
```bash
npm run dist:win
```

## モデル別動作メモ

学生や会社員、公務員にありがちな外部GPUのないノートPCやデスクトップPCを想定した場合

| モデル | 評価 | 備考 |
|--------|------|------|
| llama3.2:3b | ⭐ 推奨 | バランス良好、日本語安定、TTFT約2.6秒 |
| gemma3:1b | ⭐ 推奨 | 内容充実、高速（TTFT約860ms）、Markdown出力あり |
| qwen3:0.6b | △ | 軽量だが回答が薄め |
| qwen3:1.7b | △ | システムプロンプト追従が弱い場合あり |
| qwen3:4b | △ | 応答に時間がかかる（TTFT約23秒） |

## アバター設定

設定画面からアバターフォルダを指定できます。  
フォルダ構成は `assets/avatar/default-static/manifest.json` を参考にしてください。

```
  manifest.json
  neutral.png
  think.png
  explain.png
  praise.png
  ask.png
```

アバターが未設定の場合は、組み込みのCSSアニメーションプレースホルダーが表示されます。****
