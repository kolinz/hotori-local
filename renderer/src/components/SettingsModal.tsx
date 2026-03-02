import { useState } from 'react'
import { api, AppSettings } from '../utils/electronAPI'
import type { Distance, MotionName, ConnectionMode } from '../../../main/types'
import { ALL_MOTIONS, DEFAULT_UNDERSTANDING_WORDS } from '../../../main/types'
import styles from './Modal.module.css'

interface Props {
  settings: AppSettings
  onSave: (settings: AppSettings) => void
  onClose: () => void
}

const DISTANCES: { value: Distance; label: string; desc: string }[] = [
  { value: 'friend',   label: '友だち',   desc: 'フレンドリーで親しみやすい' },
  { value: 'tutor',    label: '先生',     desc: '丁寧・的確な指導スタイル' },
  { value: 'buddy',    label: 'バディ',   desc: '対等な仲間として一緒に考える' },
  { value: 'calm',     label: '穏やか',   desc: '落ち着いたサポートスタイル' },
  { value: 'cheerful', label: '元気',     desc: '明るく励ましてくれる' },
]

const MOTION_LABELS: Record<MotionName, string> = {
  neutral: '😊 neutral',
  think:   '🤔 think',
  explain: '💡 explain',
  praise:  '🎉 praise',
  ask:     '❓ ask',
}

const CONNECTION_MODES: { value: ConnectionMode; label: string; desc: string }[] = [
  { value: 'ollama', label: 'Ollama', desc: 'ローカルLLM（現在利用可能）' },
  // 将来追加予定:
  // { value: 'dify',             label: 'Dify',             desc: 'Dify API連携' },
  // { value: 'openai-compatible', label: 'OpenAI互換',      desc: 'OpenAI互換エンドポイント' },
]

export function SettingsModal({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<AppSettings>({ ...settings })
  const [newWord, setNewWord] = useState('')

  const handleAddWord = () => {
    const w = newWord.trim()
    if (!w) return
    const current = draft.understandingWords ?? []
    if (current.includes(w)) { setNewWord(''); return }
    setDraft(d => ({ ...d, understandingWords: [...current, w] }))
    setNewWord('')
  }

  const handleRemoveWord = (word: string) => {
    setDraft(d => ({ ...d, understandingWords: (d.understandingWords ?? []).filter(w => w !== word) }))
  }

  const handleResetWords = () => {
    setDraft(d => ({ ...d, understandingWords: [...DEFAULT_UNDERSTANDING_WORDS] }))
  }

  const handleAvatarPick = async () => {
    const folder = await api.openFolderDialog()
    if (folder) setDraft(d => ({ ...d, avatarPath: folder }))
  }

  const handleBgPick = async () => {
    const file = await api.openFileDialog(['png', 'jpg', 'jpeg', 'webp', 'gif'])
    if (file) setDraft(d => ({ ...d, backgroundImagePath: file }))
  }

  const toggleMotion = (motion: MotionName) => {
    setDraft(d => {
      const current = d.enabledMotions ?? [...ALL_MOTIONS]
      // neutral は必ず有効（フォールバック先）
      if (motion === 'neutral') return d
      const next = current.includes(motion)
        ? current.filter(m => m !== motion)
        : [...current, motion]
      // 最低1つは有効にする（neutralは常に含まれる）
      return { ...d, enabledMotions: next.length > 0 ? next : current }
    })
  }

  const handleSave = () => {
    onSave({ ...draft })
  }

  const enabledMotions = draft.enabledMotions ?? [...ALL_MOTIONS]

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>⚙️ 設定</h2>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>

          {/* ── 接続設定 ── */}
          <Section title="🔗 接続設定">
            <div className={styles.row}>
              <span className={styles.label}>接続モード</span>
              <div className={styles.distanceGrid}>
                {CONNECTION_MODES.map(m => (
                  <button
                    key={m.value}
                    className={`${styles.distanceBtn} ${draft.connectionMode === m.value ? styles.selected : ''}`}
                    onClick={() => setDraft(d => ({ ...d, connectionMode: m.value }))}
                    title={m.desc}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>Ollama URL</span>
              <input
                className={styles.textInput}
                type="text"
                placeholder="http://localhost:11434"
                value={draft.ollamaUrl ?? 'http://localhost:11434'}
                onChange={e => setDraft(d => ({ ...d, ollamaUrl: e.target.value }))}
                spellCheck={false}
              />
            </div>
            <p className={styles.hint}>Ollamaのエンドポイント。リモートサーバーに接続する場合は変更してください。</p>
          </Section>

          {/* ── アバター ── */}
          <Section title="🎭 アバター">
            <div className={styles.row}>
              <span className={styles.label}>フォルダ</span>
              <div className={styles.avatarPicker}>
                <input
                  className={styles.pathInput}
                  value={draft.avatarPath || '（未設定）'}
                  readOnly
                  title={draft.avatarPath}
                />
                <button className={styles.pickBtn} onClick={handleAvatarPick}>
                  📁 選択
                </button>
                {draft.avatarPath && (
                  <button className={styles.clearBtn} onClick={() => setDraft(d => ({ ...d, avatarPath: '' }))}>
                    ✕
                  </button>
                )}
              </div>
            </div>
            {draft.avatarPath && (
              <p className={styles.pathDebug}>
                📂 {draft.avatarPath}
              </p>
            )}
            <p className={styles.hint}>
              フォルダに neutral / think / explain / praise / ask .png を配置してください。
            </p>
          </Section>

          {/* ── アバター動作 ── */}
          <Section title="🎬 アバター動作">
            {/* toneTag連携 */}
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={draft.toneTagEnabled ?? true}
                onChange={e => setDraft(d => ({ ...d, toneTagEnabled: e.target.checked }))}
              />
              <span>toneTag連携（AIの応答に応じてモーションを切り替える）</span>
            </label>
            <p className={styles.hint} style={{ marginTop: 6, marginBottom: 14 }}>
              オフにすると、アバターはモーションを変化させず neutral のまま維持します。
            </p>

            {/* 使用するモーション */}
            <div className={styles.label} style={{ marginBottom: 8 }}>使用するモーション</div>
            <div className={styles.motionCheckList}>
              {ALL_MOTIONS.map(m => {
                const isNeutral = m === 'neutral'
                const checked = enabledMotions.includes(m)
                return (
                  <label
                    key={m}
                    className={`${styles.motionCheckItem} ${isNeutral ? styles.motionCheckDisabled : ''}`}
                    title={isNeutral ? 'neutral は常に有効です（フォールバック）' : ''}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isNeutral}
                      onChange={() => toggleMotion(m)}
                    />
                    <span>{MOTION_LABELS[m]}</span>
                  </label>
                )
              })}
            </div>
            <p className={styles.hint}>
              オフにしたモーションが指定された場合、neutral にフォールバックします。
            </p>
          </Section>

          {/* ── 背景画像 ── */}
          <Section title="🖼️ 背景画像">
            <div className={styles.row}>
              <span className={styles.label}>画像ファイル</span>
              <div className={styles.avatarPicker}>
                <input
                  className={styles.pathInput}
                  value={draft.backgroundImagePath || '（未設定）'}
                  readOnly
                  title={draft.backgroundImagePath}
                />
                <button className={styles.pickBtn} onClick={handleBgPick}>
                  📁 選択
                </button>
                {draft.backgroundImagePath && (
                  <button className={styles.clearBtn} onClick={() => setDraft(d => ({ ...d, backgroundImagePath: '' }))}>
                    ✕
                  </button>
                )}
              </div>
            </div>
            {draft.backgroundImagePath && (
              <p className={styles.pathDebug}>📂 {draft.backgroundImagePath}</p>
            )}
            <p className={styles.hint}>PNG / JPG / WebP / GIF に対応。チャット画面の背景に表示されます。</p>
          </Section>

          {/* ── 理解・納得ワード ── */}
          <Section title="🧠 理解・納得ワード">
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={draft.understandingWordsEnabled ?? true}
                onChange={e => setDraft(d => ({ ...d, understandingWordsEnabled: e.target.checked }))}
              />
              <span>理解・納得ワード機能を有効にする</span>
            </label>
            <p className={styles.hint} style={{ marginTop: 6, marginBottom: 14 }}>
              オンにすると、ユーザーが登録ワードを入力したとき、LLMに送信せず praise モーションで反応します。
            </p>

            {/* ワード一覧 */}
            <div className={styles.wordChips}>
              {(draft.understandingWords ?? []).map(w => (
                <span key={w} className={styles.wordChip}>
                  {w}
                  <button
                    className={styles.wordChipRemove}
                    onClick={() => handleRemoveWord(w)}
                    title="削除"
                  >✕</button>
                </span>
              ))}
            </div>

            {/* ワード追加 */}
            <div className={styles.wordAddRow}>
              <input
                className={styles.wordInput}
                type="text"
                placeholder="ワードを追加…"
                value={newWord}
                onChange={e => setNewWord(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddWord() } }}
              />
              <button className={styles.wordAddBtn} onClick={handleAddWord}>追加</button>
              <button className={styles.wordResetBtn} onClick={handleResetWords} title="デフォルトに戻す">↩ リセット</button>
            </div>
          </Section>

          {/* ── 距離感 ── */}
          <Section title="💬 距離感（AIのトーン）">
            <div className={styles.distanceGrid}>
              {DISTANCES.map(d => (
                <button
                  key={d.value}
                  className={`${styles.distanceBtn} ${draft.distance === d.value ? styles.selected : ''}`}
                  onClick={() => setDraft(prev => ({ ...prev, distance: d.value }))}
                  title={d.desc}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className={styles.hint}>
              現在: {DISTANCES.find(d => d.value === draft.distance)?.desc}
            </p>
          </Section>

          {/* ── テーマ ── */}
          <Section title="🎨 テーマ">
            <div className={styles.themeGrid}>
              {(['auto', 'dark', 'light'] as const).map(t => (
                <button
                  key={t}
                  className={`${styles.distanceBtn} ${draft.theme === t ? styles.selected : ''}`}
                  onClick={() => setDraft(d => ({ ...d, theme: t }))}
                >
                  {t === 'auto' ? '🌗 自動' : t === 'dark' ? '🌙 ダーク' : '☀️ ライト'}
                </button>
              ))}
            </div>
          </Section>

          {/* ── アクセシビリティ ── */}
          <Section title="♿ アクセシビリティ">
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={draft.reducedMotion}
                onChange={e => setDraft(d => ({ ...d, reducedMotion: e.target.checked }))}
              />
              <span>アニメーションを軽減する</span>
            </label>
          </Section>

          {/* ── タイムアウト ── */}
          <Section title="⏱ タイムアウト">
            <div className={styles.row}>
              <span className={styles.label}>ストリームタイムアウト (秒)</span>
              <input
                type="number"
                className={styles.numInput}
                value={draft.streamTimeout}
                min={10}
                max={300}
                onChange={e => setDraft(d => ({ ...d, streamTimeout: Number(e.target.value) }))}
              />
            </div>
          </Section>

        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
          <button className={styles.saveBtn} onClick={handleSave}>保存</button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  )
}
