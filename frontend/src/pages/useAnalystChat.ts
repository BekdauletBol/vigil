import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE } from '../api/client'
import type { ChatMessage, Source } from '../api/types'
import { streamSSE } from '../lib/sse'
import { authHeaders } from '../session/store'

export interface UIMessage extends ChatMessage {
  id: number
  sources?: Source[]
  streaming?: boolean
  error?: string
}

/** Chat state machine over a streaming SSE endpoint, with cancellation. */
export function useAnalystChat(alertId: number | null) {
  const [messages, setMessages] = useState<UIMessage[]>([])
  const [provider, setProvider] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const seq = useRef(0)
  const streaming = messages.some((m) => m.streaming)

  // Patch by id: a cancelled stream can never touch the message of a newer one.
  const patch = (id: number, fn: (m: UIMessage) => UIMessage) =>
    setMessages((list) => list.map((m) => (m.id === id ? fn(m) : m)))

  const stop = useCallback(() => controller.current?.abort(), [])

  const reset = useCallback(() => {
    controller.current?.abort()
    setMessages([])
  }, [])

  const send = useCallback(
    async (text: string, history: UIMessage[]) => {
      const content = text.trim()
      if (!content) return
      controller.current?.abort()
      const ac = new AbortController()
      controller.current = ac

      const user: UIMessage = { id: ++seq.current, role: 'user', content }
      const assistant: UIMessage = { id: ++seq.current, role: 'assistant', content: '', streaming: true }
      const payload = [...history, user].map(({ role, content }) => ({ role, content }))
      setMessages([...history, user, assistant])

      try {
        await streamSSE(
          `${API_BASE}/analyst/chat`,
          { alert_id: alertId, messages: payload },
          ({ event, data }) => {
            const body = JSON.parse(data)
            if (event === 'meta') {
              setProvider(body.provider)
              patch(assistant.id, (m) => ({ ...m, sources: body.sources }))
            } else if (event === 'delta') patch(assistant.id, (m) => ({ ...m, content: m.content + body.text }))
            else if (event === 'error') patch(assistant.id, (m) => ({ ...m, error: body.message }))
          },
          ac.signal,
          authHeaders(),
        )
      } catch (e) {
        if (!ac.signal.aborted) patch(assistant.id, (m) => ({ ...m, error: e instanceof Error ? e.message : String(e) }))
      } finally {
        patch(assistant.id, (m) => ({ ...m, streaming: false }))
      }
    },
    [alertId],
  )

  useEffect(() => () => controller.current?.abort(), [])

  return {
    messages,
    provider,
    streaming,
    /** Continue the conversation. */
    send: (text: string) => send(text, messages.filter((m) => !m.error)),
    /** Start a new conversation (ignores current history). */
    start: (text: string) => send(text, []),
    stop,
    reset,
  }
}
