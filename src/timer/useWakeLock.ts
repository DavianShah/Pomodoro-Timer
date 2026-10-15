/**
 * Wake Lock (PRD F14): the screen stays on while the timer runs, when the
 * setting allows it (on by default).
 *
 * - Requested when the timer starts running, released on pause/idle/session
 *   finish.
 * - The browser releases it on its own while the tab is hidden → re-request
 *   on `visibilitychange` when the tab becomes visible and the timer still
 *   runs.
 * - Failure or lack of support = silent, no message; the timer does not
 *   depend on this permission.
 */
import { useEffect, useRef } from 'react'

const noop = (): void => undefined

export function wakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator
}

export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active || !wakeLockSupported()) return undefined
    let cancelled = false
    const currentLock = (): WakeLockSentinel | null => lockRef.current

    const acquire = async (): Promise<void> => {
      if (currentLock() !== null) return
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void lock.release().catch(noop)
          return
        }
        // Two nearby requests can both resolve: the older one is released.
        const previous = currentLock()
        lockRef.current = lock
        if (previous !== null) void previous.release().catch(noop)
      } catch {
        // Permission denied or request failed: silent (PRD F14).
      }
    }

    const onVisibility = (): void => {
      if (document.visibilityState !== 'visible') return
      // Hidden tab = the browser already released it; drop the stale marker first.
      const stale = lockRef.current
      lockRef.current = null
      if (stale !== null) void stale.release().catch(noop)
      void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      const lock = lockRef.current
      lockRef.current = null
      if (lock !== null) void lock.release().catch(noop)
    }
  }, [active])
}
