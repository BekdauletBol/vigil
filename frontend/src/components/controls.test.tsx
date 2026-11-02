import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { SearchField, SegmentedControl, Switch } from './controls'

function Harness() {
  const [v, setV] = useState<'a' | 'b' | 'c'>('a')
  return (
    <SegmentedControl
      label="Фильтр"
      value={v}
      onChange={setV}
      options={[
        { value: 'a', label: 'Все' },
        { value: 'b', label: 'Флаги', count: 4 },
        { value: 'c', label: 'Алерты' },
      ]}
    />
  )
}

describe('SegmentedControl', () => {
  it('exposes a radiogroup and selects on click', async () => {
    render(<Harness />)
    expect(screen.getByRole('radiogroup', { name: 'Фильтр' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /Флаги/ }))
    expect(screen.getByRole('radio', { name: /Флаги/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('supports arrow-key navigation with wrap-around (roving tabindex)', async () => {
    render(<Harness />)
    screen.getByRole('radio', { name: 'Все' }).focus()
    await userEvent.keyboard('{ArrowLeft}')
    const last = screen.getByRole('radio', { name: 'Алерты' })
    expect(last).toHaveAttribute('aria-checked', 'true')
    expect(last).toHaveFocus()
    expect(last).toHaveAttribute('tabindex', '0')
  })
})

describe('Switch', () => {
  it('toggles aria-checked', async () => {
    function S() {
      const [on, setOn] = useState(false)
      return <Switch label="Уведомления" checked={on} onChange={setOn} />
    }
    render(<S />)
    const sw = screen.getByRole('switch', { name: 'Уведомления' })
    await userEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'true')
  })
})

describe('SearchField', () => {
  it('clears with the button and Escape', async () => {
    function F() {
      const [q, setQ] = useState('')
      return <SearchField value={q} onChange={setQ} placeholder="Поиск" />
    }
    render(<F />)
    const input = screen.getByRole('searchbox')
    await userEvent.type(input, 'офшор')
    await userEvent.click(screen.getByRole('button', { name: 'Очистить' }))
    expect(input).toHaveValue('')
    await userEvent.type(input, 'abc{Escape}')
    expect(input).toHaveValue('')
  })
})
