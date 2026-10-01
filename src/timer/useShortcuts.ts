/**
 * Shortcut keyboard (PRD F7): Spasi mulai/jeda, R reset, S lewati,
 * M jendela mini (no-op sampai M3), 1-5 ganti metode saat idle.
 * Mati saat fokus di input/textarea/select, saat ada modifier, dan saat
 * key auto-repeat. Spasi tidak men-scroll dan tidak menekan tombol ganda
 * (target button/a dibiarkan aktif secara native).
 */

import { useEffect, useRef } from 'react'

export interface ShortcutOptions {
  running: boolean
  methodEditable: boolean
  start: () => void
  pause: () => void
  skip: () => void
  reset: () => void
  /** Dipasang di M3 untuk jendela mini; null = belum tersedia. */
  onMini: (() => void) | null
  selectMethod: (index: number) => void
}

export function useShortcuts(options: ShortcutOptions): void {
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) return
      const target = event.target
      if (
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        return
      }

      const opts = optionsRef.current

      if (event.key === ' ') {
        // Tombol/link sudah punya perilaku native Spasi — jangan gandakan.
        if (target instanceof Element && target.closest('button, a')) return
        event.preventDefault()
        if (opts.running) opts.pause()
        else opts.start()
        return
      }

      if (event.key >= '1' && event.key <= '5') {
        if (!opts.methodEditable) return
        opts.selectMethod(Number(event.key) - 1)
        return
      }

      const letter = event.key.toLowerCase()
      if (letter === 'r') opts.reset()
      else if (letter === 's') opts.skip()
      else if (letter === 'm') opts.onMini?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
