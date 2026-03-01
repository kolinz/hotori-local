import { useState } from 'react'
import { api, AppSettings } from '../utils/electronAPI'
import type { Distance } from '../../../main/types'
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

export function SettingsModal({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<AppSettings>({ ...settings })

  const handleAvatarPick = async () => {
    const folder = await api.openFolderDialog()
    if (folder) setDraft(d => ({ ...d, avatarPath: folder }))
  }

  const handleBgPick = async () => {
    const file = await api.openFileDialog(['png', 'jpg', 'jpeg', 'webp', 'gif'])
    if (file) setDraft(d => ({ ...d, backgroundImagePath: file }))
  }

  const handleSave = () => {
    onSave({ ...draft })
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>⚙️ 設定</h2>
          <button className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>

          {/* ── モデル ── */}
          {/* ── Ollama URL ── */}
          <Section title="🔗 Ollama URL">
            <div className={styles.row}>
              <span className={styles.label}>接続先 URL</span>
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
