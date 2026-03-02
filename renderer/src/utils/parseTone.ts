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
 */

const TONE_TAG = /\*{0,2}\s*<toneTag\b[^>]*>\s*\*{0,2}/g
const TONE_VALUE = /name="([^"|>]+)/
const EMPTY_LINE = /^\s*\n/gm

const VALID_MOTIONS = new Set<string>(['neutral', 'think', 'explain', 'praise', 'ask'])

/**
 * toneTagを解析してモーション名とクリーンテキストを返す。
 *
 * @param text - LLMの生レスポンステキスト
 * @param enabledMotions - 使用を許可するモーション一覧。省略時は全モーション有効。
 *                         指定したモーションに含まれない場合は 'neutral' にフォールバック。
 */
export function parseToneTagged(
  text: string,
  enabledMotions?: MotionName[]
): { tone: MotionName; clean: string } {
  let tone: MotionName = 'neutral'
  const tagMatch = text.match(TONE_TAG)
  if (tagMatch) {
    for (const tag of tagMatch) {
      const valMatch = tag.match(TONE_VALUE)
      if (valMatch) {
        const candidates = valMatch[1].split('|').map(s => s.trim())
        const found = candidates.find(c => VALID_MOTIONS.has(c))
        if (found) { tone = found as MotionName; break }
      }
    }
  }

  // enabledMotions が指定されていて、解析したtoneが含まれない場合は neutral にフォールバック
  if (enabledMotions && enabledMotions.length > 0 && !enabledMotions.includes(tone)) {
    tone = 'neutral'
  }

  const clean = text
    .replace(TONE_TAG, '')
    .replace(EMPTY_LINE, '')
    .trimEnd()

  return { tone, clean }
}

export function hasToneTag(text: string): boolean {
  return TONE_TAG.test(text)
}
