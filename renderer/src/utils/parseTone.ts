import type { MotionName } from '../../../main/types'
export type { MotionName }

/**
 * qwen3系が出力するtoneTag全パターンを除去する。
 *
 * 観測されたパターン:
 *   <toneTag name="neutral" />          ← 正規形
 *   <toneTag name="neutral">
 *   <toneTag name="neutral|explain">    ← パイプ区切り複数値
 *   **<toneTag name="neutral" />**      ← Markdown太字
 *   **<neutral>**                       ← XML省略形
 *   <neutral />
 *   **neutral**                         ← タグなしMarkdown太字
 *   (**neutral**)                       ← 括弧付き
 */

// パターン1: <toneTag ... > 正規形（**囲み対応）
const TONE_TAG = /\*{0,2}\s*<toneTag\b[^>]*>\s*\*{0,2}/g

// パターン2: **<neutral>** / <neutral /> など XML省略形
const TONE_SHORT = /\*{0,2}\s*<(neutral|think|explain|praise|ask)\s*\/?>\s*\*{0,2}/g

// パターン3: **neutral** / (**neutral**) など タグなし形式
const TONE_BARE = /[（(]?\*{1,2}(neutral|think|explain|praise|ask)\*{1,2}[）)]?/g

// tone値の抽出用（正規形）
const TONE_VALUE = /name="([^"|>]+)/

// toneTag除去後に空行だけになった行を削除
const EMPTY_LINE = /^\s*\n/gm

const VALID_MOTIONS = new Set<string>(['neutral', 'think', 'explain', 'praise', 'ask'])

export function parseToneTagged(text: string): { tone: MotionName; clean: string } {
  let tone: MotionName = 'neutral'
  let found = false

  // パターン1: <toneTag name="...">
  const tagMatch = text.match(TONE_TAG)
  if (tagMatch) {
    for (const tag of tagMatch) {
      const valMatch = tag.match(TONE_VALUE)
      if (valMatch) {
        const candidates = valMatch[1].split('|').map(s => s.trim())
        const hit = candidates.find(c => VALID_MOTIONS.has(c))
        if (hit) { tone = hit as MotionName; found = true; break }
      }
    }
  }

  // パターン2: **<neutral>** など XML省略形
  if (!found) {
    const shortMatch = text.match(TONE_SHORT)
    if (shortMatch) {
      const m = shortMatch[0].match(/<(neutral|think|explain|praise|ask)/)
      if (m && VALID_MOTIONS.has(m[1])) { tone = m[1] as MotionName; found = true }
    }
  }

  // パターン3: **neutral** / (**neutral**) など タグなし形式
  if (!found) {
    const bareMatch = text.match(TONE_BARE)
    if (bareMatch) {
      const m = bareMatch[0].match(/(neutral|think|explain|praise|ask)/)
      if (m && VALID_MOTIONS.has(m[1])) { tone = m[1] as MotionName }
    }
  }

  const clean = text
    .replace(TONE_TAG, '')
    .replace(TONE_SHORT, '')
    .replace(TONE_BARE, '')
    .replace(EMPTY_LINE, '')
    .trimEnd()

  return { tone, clean }
}

export function hasToneTag(text: string): boolean {
  TONE_TAG.lastIndex = 0
  TONE_SHORT.lastIndex = 0
  TONE_BARE.lastIndex = 0
  return TONE_TAG.test(text) || TONE_SHORT.test(text) || TONE_BARE.test(text)
}
