/**
 * Wake Lock (F14) dengan navigator.wakeLock di-mock: minta saat aktif,
 * lepas saat berhenti, minta ulang saat tab terlihat, gagal = senyap,
 * tidak didukung = tidak meminta apa pun.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWakeLock, wakeLockSupported } from './useWakeLock'

interface MockLock {
  release: ReturnType<typeof vi.fn<() => Promise<void>>>
}

interface MockWakeLock {
  request: ReturnType<typeof vi.fn<(type: string) => Promise<MockLock>>>
}

/** Pasang navigator.wakeLock buatan; `reject` meniru izin yang ditolak. */
function installWakeLock(reject = false): MockWakeLock {
  const wakeLock: MockWakeLock = {
    request: vi.fn(() => {
      if (reject) return Promise.reject(new DOMException('izin ditolak', 'NotAllowedError'))
      return Promise.resolve({ release: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) })
    }),
  }
  Object.defineProperty(navigator, 'wakeLock', { value: wakeLock, configurable: true })
  return wakeLock
}

function removeWakeLock(): void {
  delete (navigator as { wakeLock?: unknown }).wakeLock
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

function fireVisibility(state: DocumentVisibilityState): void {
  setVisibility(state)
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

beforeEach(() => setVisibility('visible'))
afterEach(() => {
  removeWakeLock()
  setVisibility('visible')
})

describe('useWakeLock', () => {
  it('minta screen saat aktif', async () => {
    const wakeLock = installWakeLock()
    renderHook(() => useWakeLock(true))
    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledWith('screen'))
  })

  it('tidak minta saat tidak aktif (timer idle/jeda, pengaturan mati)', () => {
    const wakeLock = installWakeLock()
    renderHook(() => useWakeLock(false))
    expect(wakeLock.request).not.toHaveBeenCalled()
  })

  it('lepas saat berhenti', async () => {
    const wakeLock = installWakeLock()
    const { rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    })
    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(1))
    const lock = (await wakeLock.request.mock.results[0]!.value) as MockLock

    rerender({ active: false })
    await waitFor(() => expect(lock.release).toHaveBeenCalledTimes(1))
  })

  it('minta ulang saat tab terlihat lagi selama timer jalan', async () => {
    setVisibility('hidden')
    const wakeLock = installWakeLock()
    renderHook(() => useWakeLock(true))
    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(1))
    const first = (await wakeLock.request.mock.results[0]!.value) as MockLock

    fireVisibility('visible')

    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(first.release).toHaveBeenCalled())
  })

  it('permintaan gagal: senyap, lalu bisa dicoba lagi', async () => {
    const wakeLock = installWakeLock(true)
    renderHook(() => useWakeLock(true))
    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(1))

    // Tidak ada penolakan yang lolos (vitest gagal kalau ada unhandled rejection)
    // dan pemicu berikutnya tetap mencoba.
    fireVisibility('hidden')
    fireVisibility('visible')
    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(2))
  })

  it('tidak didukung: tidak meminta apa pun', () => {
    const wakeLock = installWakeLock()
    removeWakeLock()
    expect(wakeLockSupported()).toBe(false)
    renderHook(() => useWakeLock(true))
    expect(wakeLock.request).not.toHaveBeenCalled()
  })
})
