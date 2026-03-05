# 学習アシスタントツール兼マルチ教師蒸留ツール Hotori

Hotori は Electron + React で作られたデスクトップ学習アシスタントです。
ローカル LLM（Ollama）・OpenAI API・Dify API の 3 モードに対応し、AI アバターとのインタラクティブなチャットで学習をサポートします。

- オフライン動作対応：Ollama モードではインターネット不要
- プライバシー重視：会話はすべてローカルに保存
- 蒸留ワークフロー：会話をCSV 出力してファインチューニングデータに活用可能

## 特長

- SDDで開発のため、[仕様書](https://github.com/kolinz/hotori-local/blob/main/docs/hotori-specification-SDD-v0.2.0.md)付き
- セルフホスト型およびPC内運用のローカルLLMおよびSLM、OpenAI API向けUI
- 親近感を持つ画像設定。アバター画像と背景画像は任意のものに変更可能。
- 会話（レスポンス）の評価機能。Good or Bad
- AIモデルとの会話をCSVファイルとしてダウンロードする機能。ChatGPTやGeminiに課金してもない機能
  - ダウンロードしたCSVファイルは
    - NotebookLMやOneNote、Notionにアップロードして学習に活かす
    - マルチ教師蒸留（multi‑teacher distillation）：DeepSeek開発などでも使われている。CSVデータとして取得したAIとの会話モデルを、ファインチューニングや継続事前学習のためのAIモデル用学習データセットとして活用する <-- ただし、ファインチューニングや継続事前学習では、人間が作った生データを必ず混ぜること。生成AIでつくった学習データセットだけでは、AIモデルが劣化するモデル崩壊を起こす。

<img src="https://github.com/kolinz/hotori-local/blob/main/docs/images/top_image.png" width="100%" />

---

## 機能

| 機能 | 説明 |
|------|------|
| **3 モード接続** | 🦙 Ollama（ローカル）/ 🤖 OpenAI API / ⚡ Dify API を設定から切り替え |
| **マルチタブ** | 最大 5 タブの並列セッション管理 |
| **アバター表情** | 応答の感情トーンに連動した PNG 切り替え（neutral / think / explain / praise / ask）|
| **理解ワード検知** | 「なるほど」などの設定ワードでアバターが praise モーションで即反応 |
| **セッションログ** | 会話履歴の永続化・履歴モーダルから閲覧 |
| **CSV エクスポート** | セッション単位でエクスポート（session_id・model・評価付き） |
| **応答評価** | 👍 / 👎 の 2 値評価をログに記録 |
| **カスタマイズ** | アバター画像・背景・距離感・テーマ・理解ワード・モーション有効/無効 |

---

## バックエンド対応

### 🦙 Ollama（ローカル LLM）
完全オフライン動作。Ollama が起動していれば即使用可能。

**推奨モデル:**
| モデル | 特徴 |
|--------|------|
| `gemma3:1b` | 内容品質・日本語・速度のバランスが良好（**推奨**） |
| `gemma3:4b` | より高品質な回答。PCに余裕がある環境向け |
| `llama3.2:3b` | 安定した日本語出力 |

### 🤖 OpenAI API
API キーを設定するだけで使用可能。カスタムベース URL により OpenAI 互換 API にも対応。

**プリセットモデル:** `gpt-5-nano-2025-08-07`, `gpt-4.1-nano-2025-04-14`, `gpt-4o`, `gpt-4o-mini`

### ⚡ Dify API
RAG・Agent・ワークフロー対応。Dify Cloud および セルフホスト両対応。  
Chatbot アプリタイプ・Agent アプリタイプのどちらにも対応。

---

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

## Ollamaで使うAIモデル（LLM・SLM）別動作メモ

学生や会社員、公務員にありがちな外部GPUのないノートPCやデスクトップPCを想定した場合

| モデル | 評価 | 備考 |
|--------|------|------|
| gemma3:4b | ⭐ 推奨 | 内容充実、若干遅め（TTFT約6350ms）、Markdown出力あり |
| gemma3:1b | ⭐ 推奨 | 内容充実、高速（TTFT約860ms）、Markdown出力あり |
| llama3.2:3b | ⭐ 推奨 | 日本語安定、TTFT約2.6秒 |
| qwen3:0.6b | △ | 軽量だが回答が薄め |
| qwen3:1.7b | △ | システムプロンプト追従が弱い場合あり |
| qwen3:4b | △ | 応答に時間がかかる（TTFT約23秒） |

## アバター設定

設定画面からアバターフォルダを指定できます。  
フォルダ構成は `assets/avatar/default-static/` を参考にしてください。

```
  neutral.png
  think.png
  explain.png
  praise.png
  ask.png
```

アバターが未設定の場合は、組み込みのCSSアニメーションプレースホルダーが表示されます。****
