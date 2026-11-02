import { describe, expect, it } from 'vitest'
import { authHeaders, authQuery, setAuth } from './store'

describe('session store', () => {
  it('builds headers and query params from the current session', () => {
    setAuth({ token: null, workspaceId: null })
    expect(authHeaders()).toEqual({})
    expect(authQuery()).toBe('')

    setAuth({ token: 'jwt.token', workspaceId: 7 })
    expect(authHeaders()).toEqual({ Authorization: 'Bearer jwt.token', 'X-Workspace-Id': '7' })
    expect(authQuery()).toBe('?workspace=7&token=jwt.token')
  })

  it('persists to localStorage', () => {
    setAuth({ token: 't', workspaceId: 3 })
    expect(JSON.parse(localStorage.getItem('vigil.session')!)).toEqual({ token: 't', workspaceId: 3 })
  })
})
