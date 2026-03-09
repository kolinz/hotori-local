# 学習アシスタントツール兼マルチ教師蒸留ツール Hotori

Hotori は Electron + React で作られたデスクトップ学習アシスタントです。
ローカル LLM（Ollama）・OpenAI API・Gemini API・Dify API の 4 モードに対応し、AIアバターやチャットUIの背景画像のカスタマイズにより、AIを使った学習をサポートします。

- オフライン動作対応：Ollama モードではインターネット不要
  - 個人情報や機密情報が関わることに生成AIを使いたい場合向け
- プライバシー重視：会話はすべてローカルに保存
- RAG-to-SFTの学習データ作成：Dify RAG の応答を学習データセットに変換してローカルモデルに蒸留することに役立つ
- 学習コレクション機能：チャット中の良いQ&Aペアを科目・テーマ別に仕分け・蓄積し、コレクション単位でCSVエクスポート


> 📌RAG-to-SFT（Knowledge Distillation from RAG）とは？ RAG システム（Dify）が生成した高品質な応答を、そのまま SFT（教師あり微調整）用の 学習データセットとして活用する手法です。RAG の知識をモデル自体に内在化することで、 推論時の検索コストなしに同等の出力を目指します。 学術的には「Distilling RAG」として 2024〜2025年に研究が出始めた新しい領域です。

---

## 特長

- SDD（仕様駆動開発）で開発のため、[仕様書](https://github.com/kolinz/hotori-local/blob/main/docs/hotori-specification-SDD-v0.2.3.md)付き
- 上記を用いた再現実装は、[再現実装プロンプト集](https://github.com/kolinz/hotori-local/blob/main/docs/hotori-v0.2.3-implementation-prompts.md)を参照のこと
- セルフホスト型およびPC内運用のローカル LLM / SLM（Ollama）・OpenAI API・Gemini API・Dify API に対応
- 親近感を持つ画像設定
- 会話（レスポンス）の評価機能。Good or Bad
- AI モデルとの会話を CSV ファイルとしてダウンロードする機能。ChatGPT や Gemini の有料プランにもない機能
  - ダウンロードした CSV ファイルは
    - NotebookLM・OneNote・Notion にアップロードして学習に活かす
    - **マルチ教師蒸留（multi-teacher distillation）**：DeepSeek 開発などでも使われている手法。CSV データとして取得した AI との会話を、SFT（教師あり微調整）や継続事前学習のための学習データセットとして活用する
    - **RAG-to-SFT**：Dify の RAG システムが生成した高品質応答を学習データ化し、ローカルモデルに知識を内在化する（実装例の少ない手法）

> ⚠️ **注意**：ファインチューニング・継続事前学習では、人間が作成した生データを必ず混ぜること。生成 AI のみで作った学習データセットはモデル崩壊（model collapse）を引き起こす可能性がある。

<img src="https://github.com/kolinz/hotori-local/blob/main/docs/images/top_image.png" width="100%" />

---

## 機能

| 機能 | 説明 |
|------|------|
| **4 モード接続** | 🦙 Ollama（ローカル）/ 🤖 OpenAI API / ✨ Gemini API / ⚡ Dify API を設定から切り替え |
| **マルチタブ** | 最大 5 タブの並列セッション管理 |
| **アバター表情** | 応答の感情トーンに連動した PNG 切り替え（neutral / think / explain / praise / ask）|
| **理解ワード検知** | 「なるほど」などの設定ワードでアバターが praise モーションで即反応 |
| **セッションログ** | 会話履歴の永続化・履歴モーダルから閲覧 |
| **CSV エクスポート** | セッション単位でエクスポート（session_id・model・評価付き） |
| **応答評価** | 👍 / 👎 の 2 値評価をログに記録 |
| **カスタマイズ** | アバター画像・背景・距離感・テーマ・理解ワード・モーション有効/無効 |
| **背景画像** | PNG / JPG / WebP / GIF をチャット画面の背景に設定可能。アバターとの組み合わせで学習空間をカスタマイズ |
| **学習コレクション** | チャット中のQ&Aペアを任意の名前で仕分け・蓄積。コレクション単位でCSVエクスポート |
| **右ペイン切り替え** | アバタービューとコレクションパネルをタブで切り替え。幅はドラッグで調整可能 |

---

## バックエンド対応

### 🦙 Ollama（ローカル LLM）
完全オフライン動作。Ollamaを起動し、AIモデル（LLM/SLM）をダウンロード済みであれば使用可能。

**推奨モデル:**
| モデル | 特徴 |
|--------|------|
| `gemma3:1b` | 軽量・高速。内容品質・日本語・速度のバランスが良好（**推奨**） |
| `gemma3:4b` | PCのメモリが16GB以上の環境向け |
| `gemma3:12b` | VRAMが6GB以上のゲーミングPC向け |
| `llama3.2:3b` | 安定した日本語出力 |

### 🤖 OpenAI API
API キーを設定するだけで使用可能。カスタムベース URL により OpenAI 互換 API にも対応。

**プリセットモデル:** `gpt-5-nano-2025-08-07`, `gpt-4.1-nano-2025-04-14`, `gpt-4o`, `gpt-4o-mini`

### ✨ Gemini API
APIキーを設定するだけで使用可能。[Google AI Studio](https://aistudio.google.com/app/apikey) で無料取得できる。

**プリセットモデル:** `gemini-2.5-flash`, `gemini-2.5-flash-lite`

### ⚡ Dify API
RAG・Agent・ワークフロー対応。Dify Cloud および セルフホスト両対応。  
Chatbot アプリタイプ・Agent アプリタイプのどちらにも対応。

---

## 必要環境

### Windows 向けアプリを使う場合
- `release-learning-assistant-horori-win-0.2.3.zip` をダウンロードし、Zip ファイルを展開してください。その後、`学習アシスタント Hotori Setup 0.2.3.exe` を実行してください。
- [Ollama](https://ollama.com/)（起動済み）
- Ollama 動作確認済みモデル: `llama3.2:3b`, `gemma3:1b`, `gemma3:4b`, `qwen3:0.6b`, `qwen3:1.7b`, 
- OpenAI API キー（OpenAI のモデルを使いたい場合のみ）
- Gemini API キー（Gemini のモデルを使いたい場合のみ。[Google AI Studio](https://aistudio.google.com/app/apikey) で取得）
- Dify環境（RAG-to-SFT の学習データ作成を行う場合に必須 , DifyのSaas版もしくはセルフホスト）

### ソースコードを使って動かす場合
- Node.js 20+
- [Ollama](https://ollama.com/)（起動済み）
- Ollama 動作確認済みモデル: `llama3.2:3b`, `gemma3:1b`, `qwen3:0.6b`, `qwen3:1.7b`, `gemma3:4b`
- OpenAI API キー（OpenAI のモデルを使いたい場合のみ）
- Gemini API キー（Gemini のモデルを使いたい場合のみ。[Google AI Studio](https://aistudio.google.com/app/apikey) で取得）
- Dify環境（RAG-to-SFT の学習データ作成を行う場合に必須 , DifyのSaas版もしくはセルフホスト）

## ソースコードを使って動かす場合のセットアップ

```bash
git clone https://github.com/kolinz/hotori-local.git
cd hotori-local
npm install
npm audit fix --force
npm run dev
```

## ビルド・配布 (Windows)

Windows 環境では、ターミナルアプリを「管理者として実行」を行ってください。
```bash
npm run dist:win
```

## Ollama で使う AI モデル（LLM・SLM）別動作メモ

学生や会社員、公務員にありがちな外部 GPU のないノート PC やデスクトップ PC を想定した場合

| モデル | 評価 | 備考 |
|--------|------|------|
| gemma3:4b | ⭐ 推奨 | 内容充実、若干遅め（TTFT 約 6350ms）、Markdown 出力あり |
| gemma3:1b | ⭐ 推奨 | 内容充実、高速（TTFT 約 860ms）、Markdown 出力あり |
| llama3.2:3b | ⭐ 推奨 | 日本語安定、TTFT 約 2.6 秒 |
| qwen3:0.6b | △ | 軽量だが回答が薄め |
| qwen3:1.7b | △ | システムプロンプト追従が弱い場合あり |
| qwen3:4b | △ | 応答に時間がかかる（TTFT 約 23 秒） |

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

アバターが未設定の場合は、組み込みの CSS アニメーションプレースホルダーが表示されます。
