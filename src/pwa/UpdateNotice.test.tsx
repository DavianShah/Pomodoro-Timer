import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UpdateNotice from './UpdateNotice'
import { useSwUpdate } from './update'

beforeEach(() => {
  useSwUpdate.setState({ ready: false, reload: () => {} })
})

describe('UpdateNotice (F15)', () => {
  it('tanpa pembaruan: tidak ada baris', () => {
    render(<UpdateNotice running={false} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('timer berjalan: baris ditahan sampai timer berhenti', () => {
    useSwUpdate.setState({ ready: true })
    render(<UpdateNotice running />)
    expect(screen.queryByRole('status')).toBeNull()

    render(<UpdateNotice running={false} />)
    expect(screen.getByRole('status')).toHaveTextContent('Versi baru tersedia.')
  })

  it('muat ulang diputuskan user lewat tombol, tanpa reload otomatis', async () => {
    const reload = vi.fn()
    useSwUpdate.setState({ ready: true, reload })
    render(<UpdateNotice running={false} />)

    expect(screen.getByRole('status')).toHaveTextContent('Versi baru tersedia.')
    await userEvent.click(screen.getByRole('button', { name: 'Muat ulang' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
