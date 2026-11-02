export interface SSEEvent {
  event: string
  data: string
}

/**
 * Incremental Server-Sent Events parser (WHATWG spec subset).
 * `EventSource` only supports GET, so POST streams (LLM chat) are read with
 * fetch + ReadableStream and fed through this parser chunk by chunk.
 */
export function createSSEParser(onEvent: (e: SSEEvent) => void) {
  let buffer = ''
  let event = ''
  let data: string[] = []

  const dispatch = () => {
    if (data.length) onEvent({ event: event || 'message', data: data.join('\n') })
    event = ''
    data = []
  }

  return {
    feed(chunk: string) {
      buffer += chunk
      const lines = buffer.split(/\r\n|\r|\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line === '') dispatch()
        else if (line.startsWith(':')) continue // comment / keep-alive
        else {
          const idx = line.indexOf(':')
          const field = idx === -1 ? line : line.slice(0, idx)
          let value = idx === -1 ? '' : line.slice(idx + 1)
          if (value.startsWith(' ')) value = value.slice(1)
          if (field === 'event') event = value
          else if (field === 'data') data.push(value)
        }
      }
    },
    flush() {
      if (buffer) this.feed('\n')
      dispatch()
    },
  }
}

/** POST a JSON body and stream back parsed SSE events. Abort with the signal. */
export async function streamSSE(
  url: string,
  body: unknown,
  onEvent: (e: SSEEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`Ошибка ${res.status}`)
  const parser = createSSEParser(onEvent)
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    parser.feed(value)
  }
  parser.flush()
}
