/**
 * Mini window state (F4). Open/close is toggled by user actions (button or
 * the M shortcut). The timer keeps running on the main page — the mini
 * window only displays state; there is no second timer, and the mini state
 * is not restored automatically after a reload.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { closeMiniWindow, openMiniWindow, prepareMiniDocument } from './miniWindow'

export interface MiniWindowApi {
  /** The open mini window; null = closed. */
  win: Window | null
  /** Popup blocked by the browser — the main screen shows a role="status" message. */
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

  // Closed via X (pagehide) → the "open" state resets along with it.
  useEffect(() => {
    if (win === null) return undefined
    const onPageHide = (): void => {
      winRef.current = null
      setWin(null)
    }
    win.addEventListener('pagehide', onPageHide)
    return () => win.removeEventListener('pagehide', onPageHide)
  }, [win])

  // Warn only when the main page is closed/reloaded with the timer running
  // and the mini open; no warning otherwise (PRD section 6).
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
