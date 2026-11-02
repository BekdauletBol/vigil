import { describe, expect, it } from 'vitest'
import { createSSEParser, type SSEEvent } from './sse'

function parse(chunks: string[]) {
  const events: SSEEvent[] = []
  const p = createSSEParser((e) => events.push(e))
  chunks.forEach((c) => p.feed(c))
  p.flush()
  return events
}

describe('createSSEParser', () => {
  it('parses named events with JSON data', () => {
    expect(parse(['event: delta\ndata: {"text":"Привет"}\n\n'])).toEqual([{ event: 'delta', data: '{"text":"Привет"}' }])
  })

  it('handles events split across arbitrary chunk boundaries', () => {
    const events = parse(['event: me', 'ta\nda', 'ta: {"a":1}\n', '\nevent: done\ndata: {}\n\n'])
    expect(events.map((e) => e.event)).toEqual(['meta', 'done'])
    expect(events[0]!.data).toBe('{"a":1}')
  })

  it('ignores comments / keep-alives and defaults the event name', () => {
    expect(parse([': keep-alive\n\ndata: x\n\n'])).toEqual([{ event: 'message', data: 'x' }])
  })

  it('joins multi-line data and supports CRLF', () => {
    expect(parse(['data: a\r\ndata: b\r\n\r\n'])).toEqual([{ event: 'message', data: 'a\nb' }])
  })

  it('flushes a trailing event without blank line', () => {
    expect(parse(['event: done\ndata: {}'])).toEqual([{ event: 'done', data: '{}' }])
  })
})
