import type { Distance } from '../../../main/types'

/**
 * システムプロンプトを生成する。
 *
 * @param distance - AIのトーン・距離感
 * @param toneTagEnabled - true のとき toneTag 出力の指示を含める（デフォルト: false）
 * @param distanceEnabled - true のとき距離感指示をシステムプロンプトに含める（デフォルト: false）
 */
export function buildSystemPrompt(distance: Distance, toneTagEnabled = false, distanceEnabled = false): string {
  const toneTagInstruction = toneTagEnabled
    ? `- 応答の最後に **必ず** 1つだけ toneTag を出力する。形式: <toneTag name="MOTION" /> （MOTION は neutral / think / explain / praise / ask のいずれか1つ）`
    : `- toneTag は出力しない。`

  const distanceInstruction = distanceEnabled
    ? `- 距離感（トーン）=${distance} を保つ（friend/tutor/buddy/calm/cheerful）。`
    : ''

  return `あなたは"学習支援に特化したAIコーチ"です。以下を厳守してください：
- 宗教・文化・価値観・恋愛について中立で、押し付けない。
- 親しみは示すが、依存を助長しない。学習行動につながる具体的提案を優先する。
- セクシャル/不適切表現は行わず、教育目的に集中する。${distanceInstruction ? '\n' + distanceInstruction : ''}
- 回答は簡潔→必要なら箇条書き→最後に次アクション（小さな一歩）を示す。
${toneTagInstruction}
- 不明点は確認質問を返し、推測で断定しない。`
}
