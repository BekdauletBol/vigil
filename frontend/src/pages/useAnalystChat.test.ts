import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAnalystChat } from './useAnalystChat'

function sseResponse(chunks: string[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder()
      chunks.forEach((c) => controller.enqueue(enc.encode(c)))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

afterEach(() => vi.restoreAllMocks())

describe('useAnalystChat', () => {
  it('streams deltas into the assistant message and keeps sources', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      sseResponse([
        'event: meta\ndata: {"provider":"mock","sources":[{"id":"d#0","doc":"Дробление","section":"Признаки","text":"…","score":0.4}]}\n\n',
        'event: delta\ndata: {"text":"Признаки "}\n\n',
        'event: delta\ndata: {"text":"дробления [1]"}\n\nevent: done\ndata: {}\n\n',
      ]),
    )
    const { result } = renderHook(() => useAnalystChat(42))
    await act(() => result.current.send('Что это?'))

    await waitFor(() => expect(result.current.streaming).toBe(false))
    const [user, assistant] = result.current.messages
    expect(user).toMatchObject({ role: 'user', content: 'Что это?' })
    expect(assistant).toMatchObject({ role: 'assistant', content: 'Признаки дробления [1]' })
    expect(assistant!.sources?.[0]?.doc).toBe('Дробление')
    expect(result.current.provider).toBe('mock')

    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
    expect(body).toEqual({ alert_id: 42, messages: [{ role: 'user', content: 'Что это?' }] })
  })

  it('surfaces server errors on the message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }))
    const { result } = renderHook(() => useAnalystChat(null))
    await act(() => result.current.send('Привет'))
    await waitFor(() => expect(result.current.messages[1]?.error).toMatch(/500/))
  })
})
