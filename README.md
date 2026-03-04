# 学習アシスタント Hotori

Electron + React + Vite + TypeScript + Ollama による学習支援デスクトップアプリ

## 特長

- SDDで開発のため、[仕様書](https://github.com/kolinz/hotori-local/blob/main/docs/hotori-specification-SDD-v0.1.9b.md)付き
- セルフホスト型およびPC内運用のローカルLLMおよびSLM、OpenAI API向けUI
- 親近感を持つ画像設定。アバター画像と背景画像は任意のものに変更可能。
- 会話（レスポンス）の評価機能。Good or Bad
- マルチ教師蒸留（multi‑teacher distillation）
- AIモデルとの会話をCSVファイルとしてダウンロードする機能。ChatGPTやGeminiに課金してもない機能
  - ダウンロードしたCSVファイルは
    - NotebookLMやOneNote、Notionにアップロードして学習に活かす
    - ファインチューニングや継続事前学習のためのAIモデル用学習データセットとして活用する <-- ただし、ファインチューニングや継続事前学習では、人間が作った生データを必ず混ぜること。生成AIでつくった学習データセットだけでは、AIモデルが劣化するモデル崩壊を起こす。

<img src="https://github.com/kolinz/hotori-local/blob/main/docs/images/top_image.png" width="100%" />


## 必要環境
### ソースコードを使って動かす場合
- Node.js 20+
- [Ollama](https://ollama.com/) (起動済み)
- Ollama 動作確認済みモデル: `llama3.2:3b`, `gemma3:1b`, `qwen3:0.6b`, `qwen3:1.7b`, `gemma3:4b`
- OpenAI APIキー（OpenAIのモデルを使いたい場合のみ）
### Windwos向けアプリを使う場合
- [release-win-0.1.9-b.zip](https://github.com/kolinz/hotori-local/releases/tag/0.1.9b)をダウンロードし、Zipファイル解凍後、「学習アシスタント Hotori Setup 0.1.9-b.exe」をダブルクリックしてインストール
- [Ollama](https://ollama.com/) (起動済み)
- Ollama 動作確認済みモデル: `llama3.2:3b`, `gemma3:1b`, `qwen3:0.6b`, `qwen3:1.7b`, `gemma3:4b`
- OpenAI APIキー（OpenAIのモデルを使いたい場合のみ）

## ソースコードを使って動かす場合のセットアップ

```bash
git clone https://github.com/kolinz/hotori-local.git
cd hotori-local
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
| gemma3:4b | ⭐ 推奨 | 内容充実、若干遅め（TTFT約6350ms）、Markdown出力あり |
| gemma3:1b | ⭐ 推奨 | 内容充実、高速（TTFT約860ms）、Markdown出力あり |
| llama3.2:3b | ⭐ 推奨 | バランス良好、日本語安定、TTFT約2.6秒 |
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
