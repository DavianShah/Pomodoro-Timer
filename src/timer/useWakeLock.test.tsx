/**
 * Wake Lock (F14) with a mocked navigator.wakeLock: request while active,
 * release when stopped, re-request when the tab becomes visible, failure =
 * silent, unsupported = request nothing.
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

/** Install a fake navigator.wakeLock; `reject` mimics a denied permission. */
function installWakeLock(reject = false): MockWakeLock {
  const wakeLock: MockWakeLock = {
    request: vi.fn(() => {
      if (reject) return Promise.reject(new DOMException('permission denied', 'NotAllowedError'))
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
  it('requests screen while active', async () => {
    const wakeLock = installWakeLock()
    renderHook(() => useWakeLock(true))
    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledWith('screen'))
  })

  it('requests nothing while inactive (timer idle/paused, setting off)', () => {
    const wakeLock = installWakeLock()
    renderHook(() => useWakeLock(false))
    expect(wakeLock.request).not.toHaveBeenCalled()
  })

  it('releases when stopped', async () => {
    const wakeLock = installWakeLock()
    const { rerender } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    })
    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(1))
    const lock = (await wakeLock.request.mock.results[0]!.value) as MockLock

    rerender({ active: false })
    await waitFor(() => expect(lock.release).toHaveBeenCalledTimes(1))
  })

  it('re-requests when the tab becomes visible again while the timer runs', async () => {
    setVisibility('hidden')
    const wakeLock = installWakeLock()
    renderHook(() => useWakeLock(true))
    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(1))
    const first = (await wakeLock.request.mock.results[0]!.value) as MockLock

    fireVisibility('visible')

    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(first.release).toHaveBeenCalled())
  })

  it('request fails: silent, then can be retried', async () => {
    const wakeLock = installWakeLock(true)
    renderHook(() => useWakeLock(true))
    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(1))

    // No rejection escapes (vitest fails on unhandled rejections) and the
    // next trigger still tries.
    fireVisibility('hidden')
    fireVisibility('visible')
    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(2))
  })

  it('unsupported: requests nothing', () => {
    const wakeLock = installWakeLock()
    removeWakeLock()
    expect(wakeLockSupported()).toBe(false)
    renderHook(() => useWakeLock(true))
    expect(wakeLock.request).not.toHaveBeenCalled()
  })
})
