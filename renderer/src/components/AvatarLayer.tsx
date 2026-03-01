import { useEffect, useState, useCallback } from 'react'
import type { MotionName } from '../../../main/types'
import { api } from '../utils/electronAPI'
import styles from './AvatarLayer.module.css'

interface Props {
  motion: MotionName
  avatarPath: string
  reducedMotion: boolean
}

type RenderMode = 'loading' | 'static' | 'placeholder'

export function AvatarLayer({ motion, avatarPath, reducedMotion }: Props) {
  const [mode, setMode]       = useState<RenderMode>(avatarPath ? 'loading' : 'placeholder')
  const [imgSrc, setImgSrc]   = useState('')   // base64 data URL
  const [visible, setVisible] = useState(false)

  // avatarPath が変わったら neutral.png の存在確認
  useEffect(() => {
    if (!avatarPath) { setMode('placeholder'); return }
    setMode('loading')
    api.checkAvatarStatic(avatarPath).then(ok => {
      console.log('[AvatarLayer] checkAvatarStatic:', ok, avatarPath)
      setMode(ok ? 'static' : 'placeholder')
    })
  }, [avatarPath])

  // motion または mode が変わったら IPC でファイルをBase64読み込み
  useEffect(() => {
    if (mode !== 'static' || !avatarPath) return

    setVisible(false)
    // Windows: C:\foo\bar\neutral.png
    const filePath = avatarPath.replace(/\//g, '\\') + '\\' + motion + '.png'
    console.log('[AvatarLayer] reading via IPC:', filePath)

    api.readAvatarFile(filePath).then(dataUrl => {
      if (dataUrl) {
        setImgSrc(dataUrl)
        requestAnimationFrame(() => setVisible(true))
      } else {
        console.warn('[AvatarLayer] readAvatarFile returned null:', filePath)
        setMode('placeholder')
      }
    })
  }, [mode, avatarPath, motion])

  const handleImgError = useCallback(() => {
    console.warn('[AvatarLayer] img error, using placeholder')
    setMode('placeholder')
  }, [])

  return (
    <div className={styles.layer}>
      <div className={`${styles.atmosphere} ${styles[`atm_${motion}`]}`} />

      {/* Base64 PNG */}
      {mode === 'static' && imgSrc && (
        <img
          key={motion}
          className={`${styles.avatar} ${styles.staticImg} ${visible ? styles.staticVisible : ''}`}
          src={imgSrc}
          alt={motion}
          onError={handleImgError}
        />
      )}

      {/* CSS プレースホルダー */}
      {(mode === 'placeholder' || mode === 'loading') && (
        <PlaceholderAvatar motion={motion} reducedMotion={reducedMotion} />
      )}

      <div className={styles.vignette} />
    </div>
  )
}

function PlaceholderAvatar({ motion, reducedMotion }: { motion: MotionName; reducedMotion: boolean }) {
  return (
    <div className={`${styles.placeholder} ${reducedMotion ? styles.reducedMotion : ''}`}>
      <div className={`${styles.orb} ${styles.orb1}`} />
      <div className={`${styles.orb} ${styles.orb2}`} />
      <div className={`${styles.figure} ${styles[`fig_${motion}`]}`}>
        <div className={styles.hair} />
        <div className={styles.head}>
          <div className={styles.eye} style={{ left: '28%' }} />
          <div className={styles.eye} style={{ left: '58%' }} />
          <div className={`${styles.mouth} ${styles[`mouth_${motion}`]}`} />
        </div>
        <div className={styles.neck} />
        <div className={styles.body}><div className={styles.collar} /></div>
        <div className={`${styles.arm} ${styles.armLeft} ${styles[`arm_${motion}`]}`} />
        <div className={`${styles.arm} ${styles.armRight} ${styles[`arm_${motion}`]}`} />
        <div className={styles.aura} />
      </div>
      <div className={styles.motionBadge}>
        <span className={styles.motionEmoji}>{motionEmoji(motion)}</span>
        <span className={styles.motionText}>{motionLabel(motion)}</span>
      </div>
    </div>
  )
}

function motionEmoji(m: MotionName) {
  return ({ neutral: '😊', think: '🤔', explain: '💡', praise: '🎉', ask: '❓' })[m]
}
function motionLabel(m: MotionName) {
  return ({ neutral: 'お話しましょう', think: '考え中…', explain: '説明するね！', praise: 'よくできました！', ask: '教えてください' })[m]
}
