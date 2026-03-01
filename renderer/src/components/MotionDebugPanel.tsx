import type { MotionName } from '../../../main/types'
import styles from './MotionDebugPanel.module.css'

const MOTIONS: { name: MotionName; emoji: string; label: string }[] = [
  { name: 'neutral', emoji: '😊', label: 'neutral' },
  { name: 'think',   emoji: '🤔', label: 'think'   },
  { name: 'explain', emoji: '💡', label: 'explain'  },
  { name: 'praise',  emoji: '🎉', label: 'praise'   },
  { name: 'ask',     emoji: '❓', label: 'ask'      },
]

interface Props {
  current: MotionName
  onChange: (m: MotionName) => void
  onClose: () => void
}

export function MotionDebugPanel({ current, onChange, onClose }: Props) {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>🎭 モーションテスト</span>
        <button className={styles.closeBtn} onClick={onClose} title="閉じる">✕</button>
      </div>
      <div className={styles.buttons}>
        {MOTIONS.map(m => (
          <button
            key={m.name}
            className={`${styles.btn} ${current === m.name ? styles.active : ''}`}
            onClick={() => onChange(m.name)}
          >
            <span className={styles.emoji}>{m.emoji}</span>
            <span className={styles.label}>{m.label}</span>
          </button>
        ))}
      </div>
      <div className={styles.hint}>アバターのモーション切替を確認できます</div>
    </div>
  )
}
