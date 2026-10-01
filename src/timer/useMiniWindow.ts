/**
 * State jendela mini (F4). Toggle buka/tutup lewat aksi user (tombol atau
 * shortcut M). Timer tetap berjalan di halaman utama — window mini hanya
 * menampilkan state; tidak ada timer kedua dan state mini tidak dipulihkan
 * otomatis setelah reload.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { closeMiniWindow, openMiniWindow, prepareMiniDocument } from './miniWindow'

export interface MiniWindowApi {
  /** Window mini yang terbuka; null = tertutup. */
  win: Window | null
  /** Popup diblokir browser — layar utama menampilkan pesan role="status". */
  blocked: boolean
  toggle: () => void
}

export function useMiniWindow(timerRunning: boolean): MiniWindowApi {
  const [win, setWin] = useState<Window | null>(null)
  const [blocked, setBlocked] = useState(false)
  const winRef = useRef<Window | null>(null)
  const openingRef = useRef(false)

  const toggle = useCallback(() => {
    const current = winRef.current
    if (current !== null) {
      winRef.current = null
      setWin(null)
      closeMiniWindow(current)
      return
    }
    if (openingRef.current) return
    openingRef.current = true
    setBlocked(false)
    void openMiniWindow(window)
      .then((result) => {
        openingRef.current = false
        if (!result.ok) {
          setBlocked(true)
          return
        }
        prepareMiniDocument(document, result.win)
        winRef.current = result.win
        setWin(result.win)
      })
      .catch(() => {
        openingRef.current = false
        setBlocked(true)
      })
  }, [])

  // Ditutup lewat X (pagehide) → state "terbuka" ikut ter-reset.
  useEffect(() => {
    if (win === null) return undefined
    const onPageHide = (): void => {
      winRef.current = null
      setWin(null)
    }
    win.addEventListener('pagehide', onPageHide)
    return () => win.removeEventListener('pagehide', onPageHide)
  }, [win])

  // Peringatan hanya saat halaman utama ditutup/reload dengan timer jalan
  // dan mini terbuka; kondisi lain tanpa peringatan (PRD bagian 6).
  useEffect(() => {
    if (win === null || !timerRunning) return undefined
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [win, timerRunning])

  return { win, blocked, toggle }
}
