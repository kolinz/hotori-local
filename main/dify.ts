export interface DifyStreamCallbacks {
  onDelta: (delta: string) => void
  onDone: (full: string, ttft_ms: number) => void
  onError: (message: string) => void
}

/**
 * Dify チャットメッセージストリーミング
 * Chatbot アプリ: message イベント
 * Agent アプリ:   agent_message イベント
 * 両方とも POST /chat-messages (response_mode=streaming) を使用
 *
 * conversation_id = '' → Dify側で毎回新規会話として扱う
 */
export async function streamDifyChat(
  baseUrl: string,
  apiKey: string,
  query: string,
  callbacks: DifyStreamCallbacks,
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

  const url = baseUrl.replace(/\/$/, '') + '/chat-messages'

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        inputs: {},
        query,
        response_mode: 'streaming',
        conversation_id: '',   // 毎回新規会話
        user: 'hotori-user',
      }),
      signal,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
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
        if (!trimmed || trimmed.startsWith(':')) continue

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6).trim()
          if (jsonStr === '[DONE]') {
            clearTimeout(timeoutId)
            callbacks.onDone(full, ttft_ms)
            return
          }

          try {
            const chunk = JSON.parse(jsonStr)
            const event = chunk.event as string | undefined

            // Chatbot: message / Agent: agent_message
            if (event === 'message' || event === 'agent_message') {
              const delta: string = chunk.answer ?? ''
              if (delta) {
                if (firstDelta) {
                  ttft_ms = Date.now() - startTime
                  firstDelta = false
                }
                full += delta
                callbacks.onDelta(delta)
              }
            }

            if (event === 'message_end') {
              clearTimeout(timeoutId)
              callbacks.onDone(full, ttft_ms)
              return
            }

            if (event === 'error') {
              throw new Error(chunk.message ?? 'Dify error')
            }
          } catch {
            // JSON パース失敗は無視して続行
          }
        }
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
