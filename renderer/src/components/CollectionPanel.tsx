import { useState, useEffect, useCallback, useRef } from 'react'
import { api, MixingCollection, MixingPair, Session, Message } from '../utils/electronAPI'
import styles from './CollectionPanel.module.css'

interface Props {
  maxCollections: number
}

// ─── コレクション追加ポップアップ（Chat.tsx から使う外部コンポーネント） ───────
interface AddToCollectionPopupProps {
  collections: MixingCollection[]
  maxCollections: number
  onSelect: (collectionId: string) => void
  onCreateAndSelect: (name: string) => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement>
}

export function AddToCollectionPopup({
  collections, maxCollections, onSelect, onCreateAndSelect, onClose, anchorRef,
}: AddToCollectionPopupProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName]   = useState('')
  const popupRef = useRef<HTMLDivElement>(null)

  // 外側クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) { onClose() }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  const handleCreate = () => {
    const name = newName.trim()
    if (!name) return
    onCreateAndSelect(name)
    setNewName('')
    setCreating(false)
  }

  const atMax = collections.length >= maxCollections

  return (
    <div ref={popupRef} className={styles.popup}>
      <div className={styles.popupTitle}>📚 コレクションに追加</div>
      {collections.length === 0 && !creating && (
        <div className={styles.popupEmpty}>コレクションがありません</div>
      )}
      {collections.map(c => (
        <button key={c.id} className={styles.popupItem} onClick={() => onSelect(c.id)}>
          📚 {c.name}
        </button>
      ))}
      {creating ? (
        <div className={styles.popupCreateRow}>
          <input
            autoFocus
            className={styles.popupInput}
            placeholder="例: 数学、英語、React基礎"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false) }}
          />
          <button className={styles.popupCreateBtn} onClick={handleCreate}>追加</button>
        </div>
      ) : (
        <button
          className={styles.popupNewBtn}
          onClick={() => setCreating(true)}
          disabled={atMax}
          title={atMax ? `コレクションは最大${maxCollections}件です` : '新しいコレクションを作成'}
        >
          ＋ 新規コレクション
        </button>
      )}
    </div>
  )
}

// ─── セッション/ペア選択サブビュー ─────────────────────────────────────────────
interface PairPickerProps {
  collectionId: string
  onDone: () => void
}

function PairPicker({ collectionId, onDone }: PairPickerProps) {
  const [sessions, setSessions]   = useState<Session[]>([])
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [messages, setMessages]   = useState<Record<string, Message[]>>({})
  const [selected, setSelected]   = useState<Set<string>>(new Set()) // assistantMsgId
  const [userMap, setUserMap]     = useState<Record<string, string>>({}) // assistantMsgId -> userMsgId
  const [sessionMap, setSessionMap] = useState<Record<string, string>>({}) // assistantMsgId -> sessionId
  const [saving, setSaving]       = useState(false)

  useEffect(() => { api.listSessions().then(setSessions) }, [])

  const toggleSession = async (s: Session) => {
    if (expanded === s.id) { setExpanded(null); return }
    setExpanded(s.id)
    if (!messages[s.id]) {
      const msgs = await api.getSessionMessages(s.id)
      setMessages(prev => ({ ...prev, [s.id]: msgs }))
    }
  }

  const buildPairs = (msgs: Message[]) => {
    const pairs: Array<{ user: Message; assistant: Message }> = []
    for (let i = 0; i < msgs.length - 1; i++) {
      if (msgs[i].role === 'user' && msgs[i + 1].role === 'assistant') {
        pairs.push({ user: msgs[i], assistant: msgs[i + 1] })
        i++
      }
    }
    return pairs
  }

  const togglePair = (assistantId: string, userId: string, sessionId: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(assistantId)) { next.delete(assistantId) }
      else { next.add(assistantId) }
      return next
    })
    setUserMap(prev => ({ ...prev, [assistantId]: userId }))
    setSessionMap(prev => ({ ...prev, [assistantId]: sessionId }))
  }

  const handleAdd = async () => {
    if (selected.size === 0 || saving) return
    setSaving(true)
    for (const assistantId of selected) {
      const userId    = userMap[assistantId]
      const sessionId = sessionMap[assistantId]
      if (userId && sessionId) {
        try { await api.addPair(collectionId, sessionId, userId, assistantId) } catch {}
      }
    }
    setSaving(false)
    onDone()
  }

  return (
    <div className={styles.picker}>
      <div className={styles.pickerHeader}>
        <button className={styles.pickerBack} onClick={onDone}>← 戻る</button>
        <span className={styles.pickerTitle}>ペアを選択</span>
        <button
          className={styles.pickerAdd}
          onClick={handleAdd}
          disabled={selected.size === 0 || saving}
        >
          {saving ? '追加中…' : `追加 (${selected.size}件)`}
        </button>
      </div>
      <div className={styles.pickerList}>
        {sessions.length === 0 && <div className={styles.pickerEmpty}>セッションがありません</div>}
        {sessions.map(s => (
          <div key={s.id} className={styles.pickerSession}>
            <button className={styles.pickerSessionBtn} onClick={() => toggleSession(s)}>
              <span className={styles.pickerChevron}>{expanded === s.id ? '▼' : '▶'}</span>
              <span className={styles.pickerSessionTitle}>{s.title}</span>
            </button>
            {expanded === s.id && (
              <div className={styles.pickerPairs}>
                {!messages[s.id] && <div className={styles.pickerLoading}>読込中…</div>}
                {messages[s.id] && buildPairs(messages[s.id]).length === 0 && (
                  <div className={styles.pickerEmpty}>Q&Aペアがありません</div>
                )}
                {messages[s.id] && buildPairs(messages[s.id]).map(({ user, assistant }) => (
                  <label key={assistant.id} className={styles.pickerPairRow}>
                    <input
                      type="checkbox"
                      checked={selected.has(assistant.id)}
                      onChange={() => togglePair(assistant.id, user.id, s.id)}
                    />
                    <div className={styles.pickerPairText}>
                      <div className={styles.pickerQ}>Q: {(user.content_clean ?? user.content ?? '').slice(0, 80)}{(user.content ?? '').length > 80 ? '…' : ''}</div>
                      <div className={styles.pickerA}>A: {(assistant.content_clean ?? assistant.content ?? '').slice(0, 80)}{(assistant.content ?? '').length > 80 ? '…' : ''}</div>
                    </div>
                    {assistant.rating === 'good' && <span className={styles.pickerRating}>👍</span>}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── ペア1行 ─────────────────────────────────────────────────────────────────
interface PairRowProps {
  pair: MixingPair
  dragHandleProps: {
    draggable: boolean
    onDragStart: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
    onDragEnd: () => void
  }
  onRemove: () => void
}

function PairRow({ pair, dragHandleProps, onRemove }: PairRowProps) {
  const [expanded, setExpanded] = useState(false)
  const preview = (pair.user_content ?? '').slice(0, 60)
  const full    = pair.user_content ?? ''

  return (
    <div className={styles.pairRow} {...dragHandleProps}>
      <span className={styles.dragHandle} title="ドラッグで並び替え">≡</span>
      <div className={styles.pairContent} onClick={() => setExpanded(v => !v)}>
        <div className={styles.pairQ}>
          Q: {expanded ? full : preview}{!expanded && full.length > 60 ? '…' : ''}
        </div>
        {expanded && (
          <div className={styles.pairA}>
            A: {(pair.assistant_content ?? '').slice(0, 200)}{(pair.assistant_content ?? '').length > 200 ? '…' : ''}
          </div>
        )}
      </div>
      {pair.rating === 'good' && <span className={styles.pairRating}>👍</span>}
      <button className={styles.pairRemove} onClick={onRemove} title="削除">🗑️</button>
    </div>
  )
}

// ─── メインパネル ──────────────────────────────────────────────────────────────
export function CollectionPanel({ maxCollections }: Props) {
  const [collections, setCollections]     = useState<MixingCollection[]>([])
  const [pairs, setPairs]                 = useState<Record<string, MixingPair[]>>({})
  const [expanded, setExpanded]           = useState<Set<string>>(new Set())
  const [pickerFor, setPickerFor]         = useState<string | null>(null)
  const [renaming, setRenaming]           = useState<string | null>(null)
  const [renameValue, setRenameValue]     = useState('')
  const [creating, setCreating]           = useState(false)
  const [newName, setNewName]             = useState('')
  const [feedback, setFeedback]           = useState<{ msg: string; ok: boolean } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [dragOver, setDragOver]           = useState<string | null>(null)
  const [reloading, setReloading]         = useState(false)
  const [previewFor, setPreviewFor]       = useState<{ id: string; name: string } | null>(null)
  const draggingId = useRef<string | null>(null)
  const draggingColId = useRef<string | null>(null)

  const showMsg = (msg: string, ok = true) => {
    setFeedback({ msg, ok })
    setTimeout(() => setFeedback(null), 2500)
  }

  const reload = useCallback(async () => {
    const cols = await api.listCollections()
    setCollections(cols)
  }, [])

  const handleReload = useCallback(async () => {
    setReloading(true)
    const cols = await api.listCollections()
    setCollections(cols)
    // 展開中のコレクションのペアも再取得
    const expandedIds = Array.from(expanded)
    const updated: Record<string, MixingPair[]> = {}
    await Promise.all(expandedIds.map(async id => {
      updated[id] = await api.listPairs(id)
    }))
    setPairs(prev => ({ ...prev, ...updated }))
    setReloading(false)
  }, [expanded])

  useEffect(() => { reload() }, [reload])

  const loadPairs = useCallback(async (collectionId: string) => {
    const p = await api.listPairs(collectionId)
    setPairs(prev => ({ ...prev, [collectionId]: p }))
  }, [])

  const toggleExpand = useCallback(async (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) }
      else { next.add(id); loadPairs(id) }
      return next
    })
  }, [loadPairs])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    if (collections.length >= maxCollections) {
      showMsg(`コレクションは最大${maxCollections}件です（設定で変更可能）`, false)
      return
    }
    await api.createCollection(name)
    setNewName('')
    setCreating(false)
    await reload()
    showMsg(`「${name}」を作成しました`)
  }

  const handleRename = async (id: string) => {
    const name = renameValue.trim()
    if (!name) return
    await api.renameCollection(id, name)
    setRenaming(null)
    await reload()
  }

  const handleDelete = async (id: string) => {
    await api.deleteCollection(id)
    setConfirmDelete(null)
    setPairs(prev => { const next = { ...prev }; delete next[id]; return next })
    await reload()
    showMsg('コレクションを削除しました')
  }

  const handleRemovePair = async (collectionId: string, pairId: string) => {
    await api.removePair(pairId)
    await loadPairs(collectionId)
    showMsg('ペアを削除しました')
  }

  const handleExport = async (c: MixingCollection) => {
    const result = await api.exportCollectionCsv(c.id, c.name)
    if (result.ok) showMsg(`✅ ${result.filePath?.split(/[/\\]/).pop() ?? 'CSV'} を保存しました`)
    else if (!result.canceled) showMsg(`⚠️ 保存に失敗: ${result.error ?? '不明'}`, false)
  }

  const handlePickerDone = async (collectionId: string) => {
    setPickerFor(null)
    await loadPairs(collectionId)
    showMsg('ペアを追加しました')
  }

  // ── ドラッグ&ドロップ並び替え ─────────────────────────────────────────────
  const handleDragStart = (colId: string, pairId: string) => {
    draggingId.current    = pairId
    draggingColId.current = colId
  }
  const handleDragOver = (e: React.DragEvent, pairId: string) => {
    e.preventDefault()
    setDragOver(pairId)
  }
  const handleDrop = async (e: React.DragEvent, colId: string, targetId: string) => {
    e.preventDefault()
    setDragOver(null)
    const fromId = draggingId.current
    if (!fromId || fromId === targetId || draggingColId.current !== colId) return
    const currentPairs = pairs[colId] ?? []
    const fromIdx  = currentPairs.findIndex(p => p.id === fromId)
    const toIdx    = currentPairs.findIndex(p => p.id === targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const reordered = [...currentPairs]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setPairs(prev => ({ ...prev, [colId]: reordered }))
    await api.reorderPairs(colId, reordered.map(p => p.id))
  }
  const handleDragEnd = () => {
    draggingId.current    = null
    draggingColId.current = null
    setDragOver(null)
  }

  const atMax = collections.length >= maxCollections

  // ── ペア選択ビュー表示中 ────────────────────────────────────────────────────
  if (pickerFor) {
    return (
      <div className={styles.panel}>
        <PairPicker
          collectionId={pickerFor}
          onDone={() => handlePickerDone(pickerFor)}
        />
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      {/* ヘッダー */}
      <div className={styles.header}>
        <span className={styles.headerTitle}>📚 コレクション</span>
        <span className={styles.headerCount}>
          {collections.length}/{maxCollections}
        </span>
        <button
          className={`${styles.reloadBtn} ${reloading ? styles.reloading : ''}`}
          onClick={handleReload}
          title="再読み込み"
          disabled={reloading}
        >↻</button>
      </div>

      {/* フィードバック */}
      {feedback && (
        <div className={`${styles.feedback} ${feedback.ok ? styles.feedbackOk : styles.feedbackErr}`}>
          {feedback.msg}
        </div>
      )}

      {/* コレクション一覧 */}
      <div className={styles.list}>
        {collections.length === 0 && !creating && (
          <div className={styles.empty}>
            コレクションがありません<br />
            ＋ ボタンで作成してください
          </div>
        )}

        {collections.map(c => (
          <div key={c.id} className={styles.collectionItem}>
            {/* コレクション行 */}
            <div className={styles.collectionHeader}>
              <button className={styles.expandBtn} onClick={() => toggleExpand(c.id)}>
                {expanded.has(c.id) ? '▼' : '▶'}
              </button>

              {renaming === c.id ? (
                <input
                  autoFocus
                  className={styles.renameInput}
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRename(c.id)
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                  onBlur={() => handleRename(c.id)}
                />
              ) : (
                <span
                  className={styles.collectionName}
                  onDoubleClick={() => { setRenaming(c.id); setRenameValue(c.name) }}
                  title="ダブルクリックで名前を変更"
                >
                  {c.name}
                </span>
              )}

              <span className={styles.pairCount}>
                {(pairs[c.id] ?? []).length > 0 ? `${pairs[c.id].length}件` : ''}
              </span>
              <button
                className={styles.actionBtn}
                onClick={() => setPreviewFor({ id: c.id, name: c.name })}
                title="詳細プレビュー"
              >👁</button>
              <button
                className={styles.actionBtn}
                onClick={() => handleExport(c)}
                title="CSVでエクスポート"
              >⬇</button>
              <button
                className={`${styles.actionBtn} ${styles.deleteBtn}`}
                onClick={() => setConfirmDelete(c.id)}
                title="削除"
              >🗑️</button>
            </div>

            {/* 確認ダイアログ */}
            {confirmDelete === c.id && (
              <div className={styles.confirmRow}>
                <span>「{c.name}」を削除しますか？</span>
                <button className={styles.confirmYes} onClick={() => handleDelete(c.id)}>削除</button>
                <button className={styles.confirmNo}  onClick={() => setConfirmDelete(null)}>キャンセル</button>
              </div>
            )}

            {/* ペア一覧 */}
            {expanded.has(c.id) && (
              <div className={styles.pairList}>
                {(pairs[c.id] ?? []).length === 0 && (
                  <div className={styles.pairEmpty}>ペアがありません</div>
                )}
                {(pairs[c.id] ?? []).map(pair => (
                  <div
                    key={pair.id}
                    className={`${styles.pairRowWrap} ${dragOver === pair.id ? styles.dragOver : ''}`}
                  >
                    <PairRow
                      pair={pair}
                      dragHandleProps={{
                        draggable: true,
                        onDragStart: () => handleDragStart(c.id, pair.id),
                        onDragOver:  (e) => handleDragOver(e, pair.id),
                        onDrop:      (e) => handleDrop(e, c.id, pair.id),
                        onDragEnd:   handleDragEnd,
                      }}
                      onRemove={() => handleRemovePair(c.id, pair.id)}
                    />
                  </div>
                ))}
                <button
                  className={styles.addPairBtn}
                  onClick={() => setPickerFor(c.id)}
                >＋ ペアを追加</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 新規コレクション作成 */}
      <div className={styles.footer}>
        {creating ? (
          <div className={styles.createRow}>
            <input
              autoFocus
              className={styles.createInput}
              placeholder="例: 数学、英語、React基礎、機械学習"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setCreating(false); setNewName('') }
              }}
            />
            <button className={styles.createConfirm} onClick={handleCreate}>作成</button>
            <button className={styles.createCancel} onClick={() => { setCreating(false); setNewName('') }}>✕</button>
          </div>
        ) : (
          <>
            <button
              className={styles.newBtn}
              onClick={() => setCreating(true)}
              disabled={atMax}
              title={atMax ? `最大${maxCollections}件です（設定で変更可能）` : '新しいコレクションを作成'}
            >
              ＋ 新規コレクション
            </button>
            {atMax && (
              <div className={styles.maxHint}>上限{maxCollections}件（設定で変更可能）</div>
            )}
          </>
        )}
      </div>

      {/* 詳細プレビューモーダル */}
      {previewFor && (
        <CollectionPreviewModal
          collectionId={previewFor.id}
          collectionName={previewFor.name}
          pairs={pairs[previewFor.id] ?? []}
          onClose={() => setPreviewFor(null)}
        />
      )}
    </div>
  )
}

// ─── 詳細プレビューモーダル ─────────────────────────────────────────────────────
interface PreviewModalProps {
  collectionId: string
  collectionName: string
  pairs: MixingPair[]
  onClose: () => void
}

function CollectionPreviewModal({ collectionId, collectionName, pairs, onClose }: PreviewModalProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  // オーバーレイクリックで閉じる
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className={styles.previewOverlay} onClick={handleOverlayClick}>
      <div className={styles.previewModal}>
        {/* ヘッダー */}
        <div className={styles.previewHeader}>
          <span className={styles.previewTitle}>📚 {collectionName}</span>
          <span className={styles.previewCount}>{pairs.length}件</span>
          <button className={styles.previewClose} onClick={onClose}>✕</button>
        </div>

        {/* テーブル */}
        <div className={styles.previewTableWrap}>
          {pairs.length === 0 ? (
            <div className={styles.previewEmpty}>ペアがありません</div>
          ) : (
            <table className={styles.previewTable}>
              <thead>
                <tr>
                  <th className={styles.thNo}>#</th>
                  <th className={styles.thSession}>セッション</th>
                  <th className={styles.thModel}>モデル</th>
                  <th className={styles.thRating}>評価</th>
                  <th className={styles.thQ}>Q（ユーザー）</th>
                  <th className={styles.thA}>A（アシスタント）</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((pair, idx) => {
                  const isExpanded = expandedRow === pair.id
                  return (
                    <tr
                      key={pair.id}
                      className={`${styles.previewRow} ${isExpanded ? styles.previewRowExpanded : ''}`}
                      onClick={() => setExpandedRow(isExpanded ? null : pair.id)}
                      title="クリックで全文表示"
                    >
                      <td className={styles.tdNo}>{idx + 1}</td>
                      <td className={styles.tdSession}>
                        <div className={styles.sessionTitle}>{pair.session_title ?? '—'}</div>
                        <div className={styles.sessionDate}>{pair.session_date ? pair.session_date.slice(0, 10) : ''}</div>
                      </td>
                      <td className={styles.tdModel}>{pair.model ?? '—'}</td>
                      <td className={styles.tdRating}>
                        {pair.rating === 'good' ? '👍' : pair.rating === 'bad' ? '👎' : '—'}
                      </td>
                      <td className={styles.tdQ}>
                        <div className={isExpanded ? styles.cellFull : styles.cellClamp}>
                          {pair.user_content ?? ''}
                        </div>
                      </td>
                      <td className={styles.tdA}>
                        <div className={isExpanded ? styles.cellFull : styles.cellClamp}>
                          {pair.assistant_content ?? ''}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
