import { useState } from 'react'
import { api, AppSettings } from '../utils/electronAPI'
import type { Distance, MotionName, ConnectionMode } from '../../../main/types'
import { ALL_MOTIONS, DEFAULT_UNDERSTANDING_WORDS, OPENAI_PRESET_MODELS } from '../../../main/types'
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
  neutral: '😊 neutral', think: '🤔 think', explain: '💡 explain',
  praise: '🎉 praise', ask: '❓ ask',
}

const CONNECTION_MODES: { value: ConnectionMode; label: string; desc: string }[] = [
  { value: 'ollama', label: '🦙 Ollama', desc: 'ローカルLLM（オフライン動作）' },
  { value: 'openai', label: '🤖 OpenAI', desc: 'ChatGPT API / OpenAI互換API' },
  { value: 'dify',   label: '⚡ Dify',   desc: 'Dify API（RAG・Agent対応）' },
]

export function SettingsModal({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<AppSettings>({
    difyUrl: 'https://api.dify.ai/v1',
    difyApiKey: '',
    maxCollections: 10,
    ...settings,
  })
  const [newWord, setNewWord]         = useState('')
  const [newModel, setNewModel]       = useState('')
  const [showApiKey, setShowApiKey]   = useState(false)
  const [showDifyKey, setShowDifyKey] = useState(false)

  // ── 理解・納得ワード ──
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

  // ── OpenAI モデル管理 ──
  const handleAddModel = () => {
    const m = newModel.trim()
    if (!m) return
    const current = draft.openaiModels ?? []
    if (current.includes(m)) { setNewModel(''); return }
    setDraft(d => ({ ...d, openaiModels: [...current, m] }))
    setNewModel('')
  }
  const handleRemoveModel = (model: string) => {
    setDraft(d => ({ ...d, openaiModels: (d.openaiModels ?? []).filter(m => m !== model) }))
  }
  const handleAddPresetModel = (model: string) => {
    const current = draft.openaiModels ?? []
    if (current.includes(model)) return
    setDraft(d => ({ ...d, openaiModels: [...current, model] }))
  }

  // ── アバター ──
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
      if (motion === 'neutral') return d
      const next = current.includes(motion)
        ? current.filter(m => m !== motion)
        : [...current, motion]
      return { ...d, enabledMotions: next.length > 0 ? next : current }
    })
  }

  const handleSave = () => { onSave({ ...draft }) }

  const enabledMotions = draft.enabledMotions ?? [...ALL_MOTIONS]
  const openaiModels   = draft.openaiModels ?? []
  const isOllama = draft.connectionMode === 'ollama' || !draft.connectionMode
  const isOpenAI = draft.connectionMode === 'openai'
  const isDify   = draft.connectionMode === 'dify'

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
              <select
                className={styles.select}
                value={draft.connectionMode}
                onChange={e => setDraft(d => ({ ...d, connectionMode: e.target.value as ConnectionMode }))}
              >
                {CONNECTION_MODES.map(m => (
                  <option key={m.value} value={m.value}>{m.label} — {m.desc}</option>
                ))}
              </select>
            </div>

            {isOllama && (
              <div className={styles.row}>
                <span className={styles.label}>Ollama URL</span>
                <input
                  className={styles.textInput}
                  value={draft.ollamaUrl}
                  onChange={e => setDraft(d => ({ ...d, ollamaUrl: e.target.value }))}
                  placeholder="http://localhost:11434"
                  spellCheck={false}
                />
              </div>
            )}

            {isOpenAI && (
              <>
                <div className={styles.row}>
                  <span className={styles.label}>エンドポイント</span>
                  <input
                    className={styles.textInput}
                    value={draft.openaiBaseUrl}
                    onChange={e => setDraft(d => ({ ...d, openaiBaseUrl: e.target.value }))}
                    placeholder="https://api.openai.com"
                    spellCheck={false}
                  />
                </div>
                <p className={styles.hint}>OpenAI互換APIを使う場合はエンドポイントを変更してください。</p>
                <div className={styles.row}>
                  <span className={styles.label}>API キー</span>
                  <div className={styles.apiKeyRow}>
                    <input
                      className={styles.textInput}
                      type={showApiKey ? 'text' : 'password'}
                      value={draft.openaiApiKey}
                      onChange={e => setDraft(d => ({ ...d, openaiApiKey: e.target.value }))}
                      placeholder="sk-..."
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <button className={styles.toggleVisBtn} onClick={() => setShowApiKey(v => !v)}>
                      {showApiKey ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                <div className={styles.label} style={{ marginTop: 12, marginBottom: 8 }}>使用するモデル</div>
                <div className={styles.wordChips}>
                  {openaiModels.length === 0 && (
                    <span className={styles.hint}>モデルが登録されていません</span>
                  )}
                  {openaiModels.map(m => (
                    <span key={m} className={styles.wordChip}>
                      {m}
                      <button className={styles.wordChipRemove} onClick={() => handleRemoveModel(m)} title="削除">✕</button>
                    </span>
                  ))}
                </div>
                <div className={styles.presetRow}>
                  <span className={styles.hint} style={{ marginRight: 4 }}>プリセット:</span>
                  {OPENAI_PRESET_MODELS.map(m => (
                    <button
                      key={m}
                      className={`${styles.presetBtn} ${openaiModels.includes(m) ? styles.presetBtnAdded : ''}`}
                      onClick={() => handleAddPresetModel(m)}
                      disabled={openaiModels.includes(m)}
                      title={openaiModels.includes(m) ? '追加済み' : m}
                    >{m}</button>
                  ))}
                </div>
                <div className={styles.wordAddRow} style={{ marginTop: 8 }}>
                  <input
                    className={styles.wordInput}
                    type="text"
                    placeholder="モデル名を追加（例: gpt-4o）"
                    value={newModel}
                    onChange={e => setNewModel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddModel() } }}
                    spellCheck={false}
                  />
                  <button className={styles.wordAddBtn} onClick={handleAddModel}>追加</button>
                </div>
              </>
            )}

            {isDify && (
              <>
                <div className={styles.row}>
                  <span className={styles.label}>エンドポイント URL</span>
                  <input
                    className={styles.textInput}
                    value={draft.difyUrl ?? ''}
                    onChange={e => setDraft(d => ({ ...d, difyUrl: e.target.value }))}
                    placeholder="https://api.dify.ai/v1"
                    spellCheck={false}
                  />
                </div>
                <div className={styles.row}>
                  <span className={styles.label}>API キー</span>
                  <div className={styles.apiKeyRow}>
                    <input
                      className={styles.textInput}
                      type={showDifyKey ? 'text' : 'password'}
                      value={draft.difyApiKey ?? ''}
                      onChange={e => setDraft(d => ({ ...d, difyApiKey: e.target.value }))}
                      placeholder="app-xxxxxxxxxxxxxxxxxxxx"
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <button className={styles.toggleVisBtn} onClick={() => setShowDifyKey(v => !v)}>
                      {showDifyKey ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                <p className={styles.hint}>Dify アプリの「API アクセス」からAPIキーを取得してください。</p>
              </>
            )}
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
                <button className={styles.pickBtn} onClick={handleAvatarPick}>📁 選択</button>
                {draft.avatarPath && (
                  <button className={styles.clearBtn} onClick={() => setDraft(d => ({ ...d, avatarPath: '' }))}>✕</button>
                )}
              </div>
            </div>
            {draft.avatarPath && <p className={styles.pathDebug}>📂 {draft.avatarPath}</p>}
            <p className={styles.hint}>フォルダに neutral / think / explain / praise / ask .png を配置してください。</p>

            <div className={styles.row} style={{ marginTop: 10 }}>
              <span className={styles.label}>背景画像</span>
              <div className={styles.avatarPicker}>
                <input
                  className={styles.pathInput}
                  value={draft.backgroundImagePath || '（未設定）'}
                  readOnly
                  title={draft.backgroundImagePath}
                />
                <button className={styles.pickBtn} onClick={handleBgPick}>📁 選択</button>
                {draft.backgroundImagePath && (
                  <button className={styles.clearBtn} onClick={() => setDraft(d => ({ ...d, backgroundImagePath: '' }))}>✕</button>
                )}
              </div>
            </div>
            <p className={styles.hint}>PNG / JPG / WebP / GIF に対応。チャット画面の背景に表示されます。</p>
          </Section>

          {/* ── toneTag / モーション ── */}
          <Section title="🎬 toneTag / モーション">
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={draft.toneTagEnabled ?? true}
                onChange={e => setDraft(d => ({ ...d, toneTagEnabled: e.target.checked }))}
              />
              <span>toneTag → アバターモーション連携を有効にする</span>
            </label>
            <p className={styles.hint} style={{ marginTop: 6, marginBottom: 14 }}>
              オンにすると、LLMの返答に含まれる [tone:xxx] タグでアバターのモーションが変わります。
            </p>
            <div className={styles.label} style={{ marginBottom: 8 }}>使用するモーション</div>
            <div className={styles.motionGrid}>
              {ALL_MOTIONS.map(m => (
                <button
                  key={m}
                  className={`${styles.motionBtn} ${enabledMotions.includes(m) ? styles.motionBtnOn : ''} ${m === 'neutral' ? styles.motionBtnLocked : ''}`}
                  onClick={() => toggleMotion(m)}
                  disabled={m === 'neutral'}
                  title={m === 'neutral' ? '常時有効（変更不可）' : enabledMotions.includes(m) ? '無効にする' : '有効にする'}
                >
                  {MOTION_LABELS[m]}
                </button>
              ))}
            </div>
          </Section>

          {/* ── 理解・納得ワード ── */}
          <Section title="💡 理解・納得ワード">
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
            <div className={styles.wordChips}>
              {(draft.understandingWords ?? []).map(w => (
                <span key={w} className={styles.wordChip}>
                  {w}
                  <button className={styles.wordChipRemove} onClick={() => handleRemoveWord(w)} title="削除">✕</button>
                </span>
              ))}
            </div>
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
                >{d.label}</button>
              ))}
            </div>
            <p className={styles.hint}>現在: {DISTANCES.find(d => d.value === draft.distance)?.desc}</p>
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
                min={10} max={300}
                onChange={e => setDraft(d => ({ ...d, streamTimeout: Number(e.target.value) }))}
              />
            </div>
          </Section>

          {/* ── 学習コレクション (v0.2.2追加) ── */}
          <Section title="📚 学習コレクション">
            <div className={styles.row}>
              <span className={styles.label}>コレクション最大件数</span>
              <input
                type="number"
                className={styles.numInput}
                value={draft.maxCollections ?? 10}
                min={1}
                onChange={e => setDraft(d => ({ ...d, maxCollections: Math.max(1, Number(e.target.value)) }))}
              />
            </div>
            <p className={styles.hint}>目安は20程度です。コレクションが上限に達すると、新規作成がブロックされます。</p>
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
