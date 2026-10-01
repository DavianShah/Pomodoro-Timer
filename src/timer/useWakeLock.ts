/**
 * Wake Lock (PRD F14): layar tetap menyala selama timer berjalan, kalau
 * pengaturan mengizinkan (default hidup).
 *
 * - Minta saat timer mulai berjalan, lepas saat jeda/idle/sesi selesai.
 * - Browser melepas sendiri saat tab tersembunyi → minta ulang pada
 *   `visibilitychange` waktu tab terlihat dan timer masih jalan.
 * - Gagal atau tidak didukung = diam, tanpa pesan; timer tidak tergantung
 *   izin ini.
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
        // Dua permintaan berdekatan bisa sama-sama selesai: yang lama dilepas.
        const previous = currentLock()
        lockRef.current = lock
        if (previous !== null) void previous.release().catch(noop)
      } catch {
        // Izin ditolak atau permintaan gagal: senyap (PRD F14).
      }
    }

    const onVisibility = (): void => {
      if (document.visibilityState !== 'visible') return
      // Tab tersembunyi = browser sudah melepas; penanda lama dibuang dulu.
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
