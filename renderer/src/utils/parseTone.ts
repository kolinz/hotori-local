import type { MotionName } from '../../../main/types'
export type { MotionName }

/**
 * qwen3系が出力するtoneTag全パターンを除去する。
 *
 * 観測されたパターン:
 *   <toneTag name="neutral" />
 *   <toneTag name="neutral">
 *   <toneTag name="neutral|explain">   ← パイプ区切り複数値
 *   **<toneTag name="neutral" />**     ← Markdown太字
 *   **<toneTag name="neutral">**
 *   **<toneTag name="neutral|explain">**
 *
 * 戦略: <toneTag で始まり > で終わる全体を除去。
 * その前後の ** も除去。行ごと空になった行も除去。
 */

// toneTag 本体（どんな内容でも <toneTag ... > にマッチ）
const TONE_TAG = /\*{0,2}\s*<toneTag\b[^>]*>\s*\*{0,2}/g

// tone値の抽出用（最初に出てくる有効なモーション名を取得）
const TONE_VALUE = /name="([^"|>]+)/

// toneTag除去後に空行だけになった行を削除
const EMPTY_LINE = /^\s*\n/gm

const VALID_MOTIONS = new Set<string>(['neutral', 'think', 'explain', 'praise', 'ask'])

export function parseToneTagged(text: string): { tone: MotionName; clean: string } {
  // tone 抽出: name="neutral|explain" → "neutral" (先頭値)
  let tone: MotionName = 'neutral'
  const tagMatch = text.match(TONE_TAG)
  if (tagMatch) {
    for (const tag of tagMatch) {
      const valMatch = tag.match(TONE_VALUE)
      if (valMatch) {
        // パイプ区切りの場合は先頭を使用
        const candidates = valMatch[1].split('|').map(s => s.trim())
        const found = candidates.find(c => VALID_MOTIONS.has(c))
        if (found) { tone = found as MotionName; break }
      }
    }
  }

  const clean = text
    .replace(TONE_TAG, '')       // toneTag 本体を除去
    .replace(EMPTY_LINE, '')     // 空行化した行を除去
    .trimEnd()

  return { tone, clean }
}

export function hasToneTag(text: string): boolean {
  return TONE_TAG.test(text)
}
