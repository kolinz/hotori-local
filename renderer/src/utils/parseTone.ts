import type { MotionName } from '../../../main/types'
export type { MotionName }

/**
 * LLMが出力するtoneTag全パターンを解析・除去する。
 *
 * 対応パターン:
 *   <toneTag name="neutral" />           ← 正規形
 *   <toneTag name="neutral">             ← 閉じタグなし
 *   <toneTag name="neutral|explain">     ← パイプ区切り複数値
 *   **<toneTag name="neutral" />**       ← Markdown太字ラップ
 *   **<neutral|think|praise|ask>**       ← パイプ区切りリスト（システムプロンプトの誤模倣）
 *   **neutral**                          ← 太字単体
 *   (neutral)                            ← 括弧付き
 */

// <toneTag ...> 全パターン（Markdown太字ラップ含む）
const TONE_TAG = /\*{0,2}\s*<toneTag\b[^>]*>\s*\*{0,2}/g
const TONE_VALUE = /name="([^"|>]+)/

// **<neutral|think|...>** 形式（システムプロンプトのサンプルをそのまま出力するモデル対策）
const TONE_LIST_BOLD = /\*{1,2}<(?:neutral|think|explain|praise|ask)(?:\|(?:neutral|think|explain|praise|ask))*>\*{1,2}/gi

// <neutral/> または <neutral> 単体XML形式
const TONE_SHORT = /<(neutral|explain|praise|ask|think)\s*\/?>/gi

// **neutral** 太字形式
const TONE_BARE = /\*\*(neutral|explain|praise|ask|think)\*\*/gi

// (neutral) 括弧付き形式
const TONE_PAREN = /\((neutral|explain|praise|ask|think)\)/gi

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

  // 優先順位1: <toneTag name="..."> 形式
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

  // 優先順位2: <neutral/> 単体XML形式
  if (tone === 'neutral' && !tagMatch) {
    const shortMatch = text.match(TONE_SHORT)
    if (shortMatch) {
      const val = shortMatch[0].replace(/<|>|\//g, '').trim()
      if (VALID_MOTIONS.has(val)) tone = val as MotionName
    }
  }

  // 優先順位3: **neutral** 太字形式
  if (tone === 'neutral' && !tagMatch) {
    const bareMatch = text.match(TONE_BARE)
    if (bareMatch) {
      const val = bareMatch[0].replace(/\*/g, '').trim()
      if (VALID_MOTIONS.has(val)) tone = val as MotionName
    }
  }

  // 優先順位4: (neutral) 括弧付き形式
  if (tone === 'neutral' && !tagMatch) {
    const parenMatch = text.match(TONE_PAREN)
    if (parenMatch) {
      const val = parenMatch[0].replace(/[()]/g, '').trim()
      if (VALID_MOTIONS.has(val)) tone = val as MotionName
    }
  }

  // enabledMotions が指定されていて、解析したtoneが含まれない場合は neutral にフォールバック
  if (enabledMotions && enabledMotions.length > 0 && !enabledMotions.includes(tone)) {
    tone = 'neutral'
  }

  // 全パターンを除去してクリーンテキストを生成
  const clean = text
    .replace(TONE_TAG, '')
    .replace(TONE_LIST_BOLD, '')
    .replace(TONE_SHORT, '')
    .replace(TONE_BARE, '')
    .replace(TONE_PAREN, '')
    .replace(EMPTY_LINE, '')
    .trimEnd()

  return { tone, clean }
}

export function hasToneTag(text: string): boolean {
  return TONE_TAG.test(text) || TONE_LIST_BOLD.test(text)
}
