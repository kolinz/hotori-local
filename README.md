# 学習アシスタントツール兼マルチ教師蒸留ツール Hotori

<img src="https://github.com/kolinz/hotori-local/blob/main/assets/bg/background-image-01.png" width="90%" />

## なぜ、Hotoriなのか
授業中の学生は、AIチャットで調べても記録を残さないため、少し時間が経つと内容を忘れてしまいます。翌週の授業で小テストを行うと、10点満点中1点や3点という結果が続出することも珍しくありません。

AIチャットは便利ですが、記録されない対話は学んだつもりになる「消費型学習」になりやすいという問題があります。

Hotoriは AIとの対話を記録・整理し、予習・復習に活かす仕組みを提供します。表形式のファイルとして出力できるため、Notion・OneNote・NotebookLM などのデジタルノートツールに蓄積して活用することもできます。

## 概要
Hotori は Electron + React で作られたデスクトップ学習アシスタントです。
ローカル LLM（Ollama）・OpenAI API・Gemini API・Dify API の 4 モードに対応し、チャットUIの背景画像のカスタマイズにより、AIを使った学習をサポートします。

- AI モデルとの会話ログを構造化された表形式のCSVデータセットとしてダウンロードする機能
- 会話（レスポンス）の評価機能。Good or Bad
- 学習コレクション機能：チャット中の良いQ&Aペアを科目・テーマ別に仕分け・蓄積し、コレクション単位でCSVエクスポート
- 要確認フラグ：AIの回答を原則要確認とし、内容確認による復習とデータとしての品質改善を行う
- 個人情報や機密情報が関わることに生成AIおよびHotoriを使いたい場合
  - 接続モードとして下記のどちらかを使ってください
    - お手軽に「Ollama」：ローカルLLMおよびSLMで動作
    > 💡 望む結果が出ないときは、Hotoriを使い、OpenAIやGemini、DifyによるRAGの出力をもとに知識蒸留を行い、AIモデルに対して、事後学習の一部であるSFT（教師あり微調整）や事前学習の一部である継続事前学習を行いましょう。AIモデルがより賢くなります。
    - 正確性重視でなら「Dify」：セルフホスト型のDifyをエンドポイントURLに指定してください
    > 💡 AIに業務情報や最新の情報を扱わせるなら、RAG（検索拡張生成）が向きます。
    > 
    > ⚠️ Agentic Search のようなアプローチをとる場合、現在のインターネット検索は生成AIによるノイズが多いため、正しくない情報を多く拾う可能性があります。インターネット上にある情報が正しいということは誰も保証していません。正確性を求める場合は、従来型RAGやグラフRAGを検討しましょう。

- マルチ教師蒸留（multi-teacher distillation）：DeepSeek 開発などでも使われている手法。CSV データとして取得した AI との会話を、事後学習の一部であるSFT（教師あり微調整）や事前学習の一部である継続事前学習のための学習データセットとして活用する

- RAG-to-SFTの学習データ作成：Dify RAG の応答を学習データセットに変換してローカルモデルに蒸留することに役立つ

- SDD（仕様駆動開発）で開発のため、[仕様書](https://github.com/kolinz/hotori-local/blob/main/docs/hotori-specification-SDD-v0.2.4.md)付き
  - 再現実装する場合は、上記仕様書とともに、こちらの[プロンプト集](https://github.com/kolinz/hotori-local/blob/main/docs/hotori-v0.2.4-implementation-prompts.md)をご活用ください

> 📌RAG-to-SFT（Knowledge Distillation from RAG）とは？ RAG システム（Dify）が生成した高品質な応答を、そのまま SFT（教師あり微調整）用の 学習データセットとして活用する手法です。RAG の知識をモデル自体に内在化することで、 推論時の検索コストなしに同等の出力を目指します。 学術的には「Distilling RAG」として 2024〜2025年に研究が出始めた新しい領域です。

> ⚠️ **注意**：ファインチューニング・継続事前学習では、人間が作成した生データを必ず混ぜること。生成 AI のみで作った学習データセットはモデル崩壊（model collapse）を引き起こす可能性がある。

---

## 機能

| 機能 | 説明 |
|------|------|
| **4 モード接続** | 🦙 Ollama（ローカル）/ 🤖 OpenAI API / ✨ Gemini API / ⚡ Dify API を設定から切り替え |
| **マルチタブ** | 最大 5 タブの並列セッション管理 |
| **理解ワード検知** | 「なるほど」などの設定ワードでアバターが即反応 |
| **セッションログ** | 会話履歴の永続化・履歴モーダルから閲覧 |
| **CSV エクスポート** | セッション単位でエクスポート（session_id・model・評価付き） |
| **応答評価** | 👍 / 👎 の 2 値評価をログに記録 |
| **背景画像** | PNG / JPG / WebP / GIF をチャット画面の背景に設定可能 |
| **学習コレクション** | チャット中のQ&Aペアを任意の名前で仕分け・蓄積。コレクション単位でCSVエクスポート（`needs_review` カラム付き） |
| **要確認フラグ** | コレクションの各ペアに要確認フラグを付与。内容確認による復習とデータとしての品質改善を行う |
| **右ペイン切り替え** | アバタービューとコレクションパネルをタブで切り替え。幅はドラッグで調整可能 |
| **カスタマイズ** | 背景画像・距離感・理解ワード・モーション有効/無効 |

---

## 接続モード:生成AIの接続

### 🦙 Ollama（ローカル LLM）
完全オフライン動作。Ollamaを起動し、AIモデル（LLM/SLM）をダウンロード済みであれば使用可能。
個人情報や機密情報を扱う場合向け。

**推奨モデル:**
| AIモデル | 特徴 |
|--------|------|
| `gemma3:1b` | 軽量・高速。内容品質・日本語・速度のバランスが良好（**推奨**） |
| `gemma3:4b` | 上記に加え、PCのメモリが16GB以上の環境向け |
| `gemma3:12b` | 高品質な回答を重視する場合の選択肢。VRAM 6GB以上を搭載したゲーミングPC向け |
| `llama3.2:3b` | 安定した日本語出力 |
| `phi4-mini:latest` | 3.8B・高速（TTFT 439ms）。動かしやすいサイズで実用的 |

> ⚠️ AIモデルのサイズや使用中のPCのスペックによっては応答に時間がかかる場合があります。設定画面のタイムアウト時間を調整してください。

> 💡 望む結果が出ないときは、Hotoriを使い、OpenAIやGemini、DifyによるRAGの出力をもとに知識蒸留を行い、AIモデルに対して、事後学習の一部であるSFT（教師あり微調整）や事前学習の一部である継続事前学習を行いましょう。AIモデルがより賢くなります。

### 🤖 OpenAI API
API キーを設定するだけで使用可能。カスタムベース URL により OpenAI 互換 API にも対応。

**プリセットモデル:** `gpt-5-nano-2025-08-07`, `gpt-4.1-nano-2025-04-14`, `gpt-4o`, `gpt-4o-mini`

> 💡 高品質な応答を学習コレクションに蓄積し、ローカルモデルへの知識蒸留データとして活用できます。API利用には費用が発生します。

### ✨ Gemini API
APIキーを設定するだけで使用可能。[Google AI Studio](https://aistudio.google.com/app/apikey) で無料取得できる。

**プリセットモデル:** `gemini-2.5-flash`, `gemini-2.5-flash-lite`

> 💡 高品質な応答を学習コレクションに蓄積し、ローカルモデルへの知識蒸留データとして活用できます。無料枠があるため、知識蒸留データの作成コストを抑えられます。

### ⚡ Dify API
RAG・Agent・ワークフロー対応。Dify Cloud および セルフホスト両対応。  
Chatbot アプリタイプ・Agent アプリタイプのどちらにも対応。

> ⚠️ Agentic Search のようなアプローチをとる場合、現在のインターネット検索は生成AIによるノイズが多いため、正しくない情報を多く拾う可能性があります。インターネット上にある情報が正しいということは誰も保証していません。正確性を求める場合は、従来型RAGやグラフRAGを検討しましょう。

---

## 必要環境

### Windows 向けアプリを使う場合
- `release-learning-assistant-horori-win-0.2.4.zip` をダウンロードし、Zip ファイルを展開してください。その後、`学習アシスタント Hotori Setup 0.2.4.exe` を実行してください。
- [Ollama](https://ollama.com/)（インストール必須）
  - Ollama 動作確認済みモデル: `llama3.2:3b`, `gemma3:1b`, `gemma3:4b`, `qwen3:0.6b`, `qwen3:1.7b`, `phi4-mini:latest`
- OpenAI API キー（OpenAI のモデルを使いたい場合のみ）
- Gemini API キー（Gemini のモデルを使いたい場合のみ。[Google AI Studio](https://aistudio.google.com/app/apikey) で取得）
- Dify環境（RAG-to-SFT の学習データ作成を行う場合に必須 , DifyのSaas版もしくはセルフホスト）

### ソースコードを使って動かす場合
- Node.js 22+
- [Ollama](https://ollama.com/)（インストール必須）
  - Ollama 動作確認済みモデル: `llama3.2:3b`, `gemma3:1b`, `gemma3:4b`, `qwen3:0.6b`, `qwen3:1.7b`, `phi4-mini:latest`
- OpenAI API キー（OpenAI のモデルを使いたい場合のみ）
- Gemini API キー（Gemini のモデルを使いたい場合のみ。[Google AI Studio](https://aistudio.google.com/app/apikey) で取得）
- Dify環境（RAG-to-SFT の学習データ作成を行う場合に必須 , DifyのSaas版もしくはセルフホスト）

## ソースコードを使って動かす場合のセットアップ
ターミナルアプリやPowerShellを使って下記のコマンドを実行してください
```bash
git clone https://github.com/kolinz/hotori-local.git
cd hotori-local
npm install
npm run dev
```

## ビルド・配布 (Windows)
ターミナルアプリやPowerShellを使って下記のコマンドを実行してください
```bash
npm run dist:win
```

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
