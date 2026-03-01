import { ChatMessage } from './types'

export interface OllamaStreamCallbacks {
  onDelta: (delta: string) => void
  onDone: (full: string, ttft_ms: number, stats?: Record<string, unknown>) => void
  onError: (message: string) => void
}

export async function listModels(baseUrl: string): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return []
    const data = await res.json() as { models?: { name: string }[] }
    return (data.models ?? []).map((m: { name: string }) => m.name)
  } catch {
    return []
  }
}

export async function streamChat(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  callbacks: OllamaStreamCallbacks,
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
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
      signal,
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`)
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
        if (!trimmed) continue
        try {
          const chunk = JSON.parse(trimmed)
          const delta = chunk?.message?.content ?? ''
          if (delta) {
            if (firstDelta) {
              ttft_ms = Date.now() - startTime
              firstDelta = false
            }
            full += delta
            callbacks.onDelta(delta)
          }
          if (chunk.done) {
            clearTimeout(timeoutId)
            callbacks.onDone(full, ttft_ms, chunk)
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
