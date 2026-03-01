import { useEffect, useState } from 'react'
import { api, Session } from '../utils/electronAPI'
import styles from './Modal.module.css'

interface Props { onClose: () => void }

export function SessionsModal({ onClose }: Props) {
  const [sessions, setSessions]         = useState<Session[]>([])
  const [exporting, setExporting]       = useState<string | null>(null)
  const [deleting, setDeleting]         = useState<string | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [feedback, setFeedback]         = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => { api.listSessions().then(setSessions) }, [])

  const showMsg = (msg: string, ok = true) => {
    setFeedback({ msg, ok })
    setTimeout(() => setFeedback(null), 3000)
  }

  const handleExport = async (s: Session) => {
    setExporting(s.id)
    try {
      const dt = new Date(s.started_at)
      const pad = (n: number) => String(n).padStart(2, '0')
      const date = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}-${pad(dt.getHours())}-${pad(dt.getMinutes())}`
      const model = (s.model ?? 'unknown').replace(/[:/]/g, '-')
      const defaultName = `session_${date}_${model}.csv`
      const result = await api.exportCsv(s.id, defaultName)
      if (result.ok) {
        showMsg(`✅ 保存しました`)
      } else if (result.canceled) {
        // キャンセルは何もしない
      } else {
        showMsg(`⚠️ 保存に失敗: ${result.error ?? '不明なエラー'}`, false)
      }
    } catch (e) {
      showMsg(`⚠️ エラー: ${String(e)}`, false)
    }
    setExporting(null)
  }

  const handleDelete = async (s: Session) => {
    if (!confirm(`このセッションを削除しますか？`)) return
    setDeleting(s.id)
    try {
      await api.deleteSession(s.id)
      setSessions(prev => prev.filter(x => x.id !== s.id))
      showMsg('🗑️ セッションを削除しました')
    } catch (e) {
      showMsg(`⚠️ 削除に失敗: ${String(e)}`, false)
    }
    setDeleting(null)
  }

  const handleClearAll = async () => {
    try {
      await api.clearAllSessions()
      setSessions([])
      setShowClearConfirm(false)
      showMsg('🗑️ すべてのセッションを削除しました')
    } catch (e) {
      showMsg(`⚠️ クリアに失敗: ${String(e)}`, false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>📋 セッション履歴</h2>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {/* フィードバック */}
          {feedback && (
            <div className={`${styles.feedback} ${feedback.ok ? styles.feedbackOk : styles.feedbackErr}`}>
              {feedback.msg}
            </div>
          )}

          {sessions.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
              まだセッションがありません
            </p>
          ) : (
            <div className={styles.sessionList}>
              {sessions.map(s => (
                <div key={s.id} className={styles.sessionItem}>
                  <div className={styles.sessionInfo}>
                    <div className={styles.sessionTitle}>{s.title || '新しいセッション'}</div>
                    <div className={styles.sessionMeta}>
                      {new Date(s.started_at).toLocaleString('ja-JP')} · {s.model}
                    </div>
                  </div>
                  <div className={styles.sessionActions}>
                    <button
                      className={styles.exportBtn}
                      onClick={() => handleExport(s)}
                      disabled={exporting === s.id}
                      title="CSVとして保存"
                    >
                      {exporting === s.id ? '…' : '⬇ CSV'}
                    </button>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => handleDelete(s)}
                      disabled={deleting === s.id}
                      title="このセッションを削除"
                    >
                      {deleting === s.id ? '…' : '🗑️'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          {showClearConfirm ? (
            <div className={styles.confirmRow}>
              <span className={styles.confirmText}>本当にすべて削除しますか？</span>
              <button className={styles.cancelBtn} onClick={() => setShowClearConfirm(false)}>
                キャンセル
              </button>
              <button className={styles.dangerBtn} onClick={handleClearAll}>
                すべて削除
              </button>
            </div>
          ) : (
            <>
              {sessions.length > 0 && (
                <button className={styles.clearBtn2} onClick={() => setShowClearConfirm(true)}>
                  🗑️ すべてクリア
                </button>
              )}
              <button className={styles.saveBtn} onClick={onClose}>閉じる</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
