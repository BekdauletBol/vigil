import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Markdown } from './markdown'

describe('Markdown', () => {
  it('renders headings, lists and emphasis', () => {
    const { container } = render(<Markdown text={'## Итог\n\n**Важно**: проверить\n\n- первый\n- второй'} />)
    expect(screen.getByRole('heading', { name: 'Итог' })).toBeInTheDocument()
    expect(container.querySelector('strong')).toHaveTextContent('Важно')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('never injects raw HTML', () => {
    const { container } = render(<Markdown text={'<img src=x onerror=alert(1)>'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('<img src=x onerror=alert(1)>')
  })

  it('turns [n] into clickable citations', async () => {
    const onCite = vi.fn()
    render(<Markdown text="См. материалы [2]." onCite={onCite} />)
    await userEvent.click(screen.getByRole('button', { name: 'Источник 2' }))
    expect(onCite).toHaveBeenCalledWith(2)
  })
})
