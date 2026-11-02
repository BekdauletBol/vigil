import { Fragment, type ReactNode } from 'react'

/**
 * Tiny, safe Markdown renderer for LLM output: headings, lists, bold, italic,
 * inline code and [n] citations. Builds React elements — never uses innerHTML.
 */
export function Markdown({ text, onCite }: { text: string; onCite?: (n: number) => void }) {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []

  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(' '), onCite)}</p>)
    para = []
  }
  const flushList = () => {
    if (!list) return
    const items = list.items.map((it, i) => <li key={i}>{inline(it, onCite)}</li>)
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>)
    list = null
  }

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const heading = /^#{1,4}\s+(.*)$/.exec(line)
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (heading) {
      flushPara()
      flushList()
      blocks.push(<h3 key={blocks.length}>{inline(heading[1]!, onCite)}</h3>)
    } else if (bullet || numbered) {
      flushPara()
      const ordered = Boolean(numbered)
      if (list && list.ordered !== ordered) flushList()
      list ??= { ordered, items: [] }
      list.items.push((bullet ?? numbered)![1]!)
    } else if (!line.trim()) {
      flushPara()
      flushList()
    } else {
      flushList()
      para.push(line.trim())
    }
  }
  flushPara()
  flushList()
  return <div className="md">{blocks}</div>
}

const TOKEN = /(\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*|`[^`]+`|\[\d+\])/g

export function inline(text: string, onCite?: (n: number) => void): ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    if (!part) return null
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    if (/^\[\d+\]$/.test(part)) {
      const n = Number(part.slice(1, -1))
      return (
        <button key={i} type="button" className="cite" onClick={() => onCite?.(n)} aria-label={`Источник ${n}`}>
          {n}
        </button>
      )
    }
    if (part.length > 2 && ((part.startsWith('_') && part.endsWith('_')) || (part.startsWith('*') && part.endsWith('*'))))
      return <em key={i}>{part.slice(1, -1)}</em>
    return <Fragment key={i}>{part}</Fragment>
  })
}
