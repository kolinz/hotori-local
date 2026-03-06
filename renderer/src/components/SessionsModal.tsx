import { useEffect, useState } from 'react'
import { api, Session, Message } from '../utils/electronAPI'
import styles from './Modal.module.css'

interface Props {
  onClose: () => void
  onDeleteSession?: (sessionId: string) => void  // v0.2.1追加
}

// ─── ビュー状態 ───────────────────────────────────────────────────────────────
type ModalView =
  | { mode: 'list' }
  | { mode: 'detail'; session: Session; messages: Message[] }

// ─── メッセージ行コンポーネント ───────────────────────────────────────────────
function MessageRow({ msg }: { msg: Message }) {
  const [expanded, setExpanded] = useState(false)

  const time = (() => {
    try {
      const d = new Date(msg.created_at)
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    } catch { return '—' }
  })()

  const roleIcon   = msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : '⚙️'
  const ratingIcon = msg.rating === 'good' ? '👍' : msg.rating === 'bad' ? '👎' : '—'
  const modelName  = msg.model ?? '—'
  const content    = (msg.content_clean ?? msg.content ?? '').trim()

  return (
    <tr
      className={`${styles.msgRow} ${msg.role === 'user' ? styles.msgRowUser : msg.role === 'assistant' ? styles.msgRowAssistant : styles.msgRowSystem}`}
      onClick={() => setExpanded(v => !v)}
      title="クリックで全文展開"
    >
      <td className={styles.msgTime}>{time}</td>
      <td className={styles.msgRole}>{roleIcon}</td>
      <td className={styles.msgRating}>{ratingIcon}</td>
      <td className={styles.msgModel}>{modelName}</td>
      <td className={styles.msgContent}>
        <span className={expanded ? styles.msgContentFull : styles.msgContentClamp}>
          {content}
        </span>
      </td>
    </tr>
  )
}

// ─── メインコンポーネント ─────────────────────────────────────────────────────
export function SessionsModal({ onClose, onDeleteSession }: Props) {
  const [sessions, setSessions]         = useState<Session[]>([])
  const [exporting, setExporting]       = useState<string | null>(null)
  const [deleting, setDeleting]         = useState<string | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [feedback, setFeedback]         = useState<{ msg: string; ok: boolean } | null>(null)
  const [view, setView]                 = useState<ModalView>({ mode: 'list' })  // v0.2.1追加
  const [loadingDetail, setLoadingDetail] = useState(false)  // v0.2.1追加

  useEffect(() => { api.listSessions().then(setSessions) }, [])

  const showMsg = (msg: string, ok = true) => {
    setFeedback({ msg, ok })
    setTimeout(() => setFeedback(null), 3000)
  }

  // ─── 詳細ビューを開く（v0.2.1追加） ──────────────────────────────────────
  const openDetail = async (s: Session) => {
    setLoadingDetail(true)
    try {
      const messages = await api.getSessionMessages(s.id)
      setView({ mode: 'detail', session: s, messages })
    } catch (e) {
      showMsg(`⚠️ 読み込みに失敗: ${String(e)}`, false)
    }
    setLoadingDetail(false)
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
      if (view.mode === 'detail' && view.session.id === s.id) setView({ mode: 'list' })  // v0.2.1追加
      onDeleteSession?.(s.id)  // v0.2.1追加
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
      setView({ mode: 'list' })  // v0.2.1追加
      showMsg('🗑️ すべてのセッションを削除しました')
    } catch (e) {
      showMsg(`⚠️ クリアに失敗: ${String(e)}`, false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {view.mode === 'detail' && (
              <button className={styles.backBtn} onClick={() => setView({ mode: 'list' })} title="一覧に戻る">←</button>
            )}
            <h2 className={styles.title} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {view.mode === 'detail' ? `📄 ${view.session.title || '新しいセッション'}` : '📋 セッション履歴'}
            </h2>
          </div>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          {/* フィードバック */}
          {feedback && (
            <div className={`${styles.feedback} ${feedback.ok ? styles.feedbackOk : styles.feedbackErr}`}>
              {feedback.msg}
            </div>
          )}

          {/* ─── 一覧ビュー ─── */}
          {view.mode === 'list' && (sessions.length === 0 ? (
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
                      className={styles.viewBtn}
                      onClick={() => openDetail(s)}
                      disabled={loadingDetail}
                      title="内容を見る"
                    >
                      {loadingDetail ? '…' : '👁'}
                    </button>
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
          ))}

          {/* ─── 詳細ビュー（v0.2.1追加） ─── */}
          {view.mode === 'detail' && (
            <div className={styles.detailView}>
              <div className={styles.detailMeta}>
                <span>{new Date(view.session.started_at).toLocaleString('ja-JP')}</span>
                {view.session.model && <span>· {view.session.model}</span>}
                <span>· {view.messages.filter(m => m.role !== 'system').length} メッセージ</span>
              </div>
              {view.messages.filter(m => m.role !== 'system').length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>メッセージがありません</p>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.msgTable}>
                    <thead>
                      <tr>
                        <th className={styles.thTime}>時刻</th>
                        <th className={styles.thRole}>役割</th>
                        <th className={styles.thRating}>評価</th>
                        <th className={styles.thModel}>モデル</th>
                        <th className={styles.thContent}>内容</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.messages.filter(m => m.role !== 'system').map(msg => (
                        <MessageRow key={msg.id} msg={msg} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          {view.mode === 'detail' ? (
            // 詳細ビューのフッター（v0.2.1追加）
            <>
              <button
                className={styles.exportBtn}
                onClick={() => handleExport(view.session)}
                disabled={exporting === view.session.id}
                style={{ marginRight: 'auto' }}
              >
                {exporting === view.session.id ? '…' : '⬇ CSV'}
              </button>
              <button
                className={styles.deleteBtn}
                onClick={() => handleDelete(view.session)}
                disabled={deleting === view.session.id}
              >
                {deleting === view.session.id ? '…' : '🗑️ 削除'}
              </button>
              <button className={styles.saveBtn} onClick={() => setView({ mode: 'list' })}>← 一覧</button>
            </>
          ) : showClearConfirm ? (
            <div className={styles.confirmRow}>
              <span className={styles.confirmText}>{sessions.length}件のセッションをすべて削除します。この操作は取り消せません。</span>
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
