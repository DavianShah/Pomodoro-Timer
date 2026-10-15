import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UpdateNotice from './UpdateNotice'
import { useSwUpdate } from './update'

beforeEach(() => {
  useSwUpdate.setState({ ready: false, reload: () => {} })
})

describe('UpdateNotice (F15)', () => {
  it('without an update: no row', () => {
    render(<UpdateNotice running={false} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('timer running: the row is held back until the timer stops', () => {
    useSwUpdate.setState({ ready: true })
    render(<UpdateNotice running />)
    expect(screen.queryByRole('status')).toBeNull()

    render(<UpdateNotice running={false} />)
    expect(screen.getByRole('status')).toHaveTextContent('A new version is available.')
  })

  it('the user decides to reload via the button, no automatic reload', async () => {
    const reload = vi.fn()
    useSwUpdate.setState({ ready: true, reload })
    render(<UpdateNotice running={false} />)

    expect(screen.getByRole('status')).toHaveTextContent('A new version is available.')
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
