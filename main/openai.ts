import { ChatMessage } from './types'

export interface OpenAIStreamCallbacks {
  onDelta: (delta: string) => void
  onDone: (full: string, ttft_ms: number) => void
  onError: (message: string) => void
}

/**
 * OpenAI Chat Completions API（SSEストリーミング）クライアント。
 * openaiBaseUrl を変更することで互換APIエンドポイントにも対応。
 */
export async function streamChatOpenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  callbacks: OpenAIStreamCallbacks,
  signal: AbortSignal,
  timeoutMs = 60_000
): Promise<void> {
  const startTime = Date.now()
  let ttft_ms = 0
  let firstDelta = true
  let full = ''

  const timeoutId = setTimeout(() => {
    callbacks.onError(`タイムアウト（${timeoutMs / 1000}秒）`)
  }, timeoutMs)

  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
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
          // finish_reason が stop になったら完了
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
