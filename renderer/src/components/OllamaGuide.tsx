import styles from './OllamaGuide.module.css'

export function OllamaGuide() {
  return (
    <div className={styles.guide}>
      <div className={styles.icon}>⚠️</div>
      <h3 className={styles.title}>Ollama が起動していません</h3>
      <p className={styles.text}>以下の手順でOllamaを起動してください：</p>
      <ol className={styles.steps}>
        <li><a href="https://ollama.com" target="_blank" rel="noreferrer">https://ollama.com</a> からインストール</li>
        <li>ターミナルで <code>ollama serve</code> を実行</li>
        <li>モデルがなければ <code>ollama pull qwen2.5:7b-instruct</code> を実行</li>
        <li>このアプリを再起動</li>
      </ol>
    </div>
  )
}
