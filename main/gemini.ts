import { ChatMessage } from './types'

export interface GeminiStreamCallbacks {
  onDelta: (delta: string) => void
  onDone: (full: string, ttft_ms: number) => void
  onError: (message: string) => void
}

/**
 * Gemini OpenAI互換エンドポイント専用ストリーミングクライアント。
 * openai.ts のコピーベース。
 * baseUrl は settings.geminiBaseUrl から受け取る。
 * デフォルト: https://generativelanguage.googleapis.com/v1beta/
 *
 * openai.ts との違い:
 *   - URL は `${baseUrl}chat/completions`（baseUrl末尾の / を正規化して結合、/v1/ は含まない）
 *   - インターフェース名が GeminiStreamCallbacks
 */
export async function streamChatGemini(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  callbacks: GeminiStreamCallbacks,
  signal: AbortSignal,
  timeoutMs = 60_000
): Promise<void> {
  const startTime = Date.now()
  let ttft_ms = 0
  let firstDelta = true
  let full = ''

  // baseUrl の末尾スラッシュを保証して chat/completions を結合
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`

  const timeoutId = setTimeout(() => {
    callbacks.onError(`タイムアウト（${timeoutMs / 1000}秒）`)
  }, timeoutMs)

  try {
    const res = await fetch(`${normalizedBase}chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
      signal,
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`HTTP ${res.status}: ${errText}`)
    }

    if (!res.body) throw new Error('No response body')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (!trimmed.startsWith('data: ')) continue

        try {
          const chunk = JSON.parse(trimmed.slice(6))
          const delta = chunk?.choices?.[0]?.delta?.content ?? ''
          if (delta) {
            if (firstDelta) {
              ttft_ms = Date.now() - startTime
              firstDelta = false
            }
            full += delta
            callbacks.onDelta(delta)
          }
          if (chunk?.choices?.[0]?.finish_reason === 'stop') {
            clearTimeout(timeoutId)
            callbacks.onDone(full, ttft_ms)
            return
          }
        } catch {}
      }
    }

    clearTimeout(timeoutId)
    callbacks.onDone(full, ttft_ms)
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    if (err instanceof Error && err.name === 'AbortError') return
    callbacks.onError(err instanceof Error ? err.message : String(err))
  }
}
