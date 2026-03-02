import type { ConnectionMode } from '../../../main/types'
import styles from './OllamaGuide.module.css'

interface Props {
  connectionMode?: ConnectionMode
}

export function OllamaGuide({ connectionMode = 'ollama' }: Props) {
  if (connectionMode === 'openai') {
    return (
      <div className={styles.guide}>
        <div className={styles.icon}>⚠️</div>
        <h3 className={styles.title}>OpenAI の設定が完了していません</h3>
        <p className={styles.text}>設定画面（⚙️）から以下を設定してください：</p>
        <ol className={styles.steps}>
          <li>APIキーを入力（<code>sk-...</code> 形式）</li>
          <li>使用するモデルを1つ以上登録（例: <code>gpt-4o</code>）</li>
          <li>保存ボタンを押す</li>
        </ol>
      </div>
    )
  }

  return (
    <div className={styles.guide}>
      <div className={styles.icon}>⚠️</div>
      <h3 className={styles.title}>Ollama が起動していません</h3>
      <p className={styles.text}>以下の手順でOllamaを起動してください：</p>
      <ol className={styles.steps}>
        <li><a href="https://ollama.com" target="_blank" rel="noreferrer">https://ollama.com</a> からインストール</li>
        <li>ターミナルで <code>ollama serve</code> を実行</li>
        <li>モデルがなければ <code>ollama pull llama3.2:3b</code> を実行</li>
        <li>このアプリを再起動</li>
      </ol>
    </div>
  )
}
