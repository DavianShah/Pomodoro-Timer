/**
 * Shortcut keyboard (PRD F7): Spasi mulai/jeda, R reset, S lewati,
 * M jendela mini, 1-5 ganti metode saat idle. Mati saat fokus di
 * input/textarea/select, saat ada modifier, dan saat key auto-repeat.
 * Spasi tidak men-scroll dan tidak menekan tombol ganda (target button/a
 * dibiarkan aktif secara native).
 *
 * Listener dipasang di window yang diberikan — halaman utama memakai
 * window-nya sendiri, jendela mini memasang listener di window mini
 * supaya spasi/R jalan saat fokus di sana.
 */

import { useCallback, useEffect, useRef } from 'react'
import { METHOD_CONFIGS } from './methods'
import { useSettings } from '@/state/settings'
import type { TimerApi } from './useTimer'

export interface ShortcutOptions {
  running: boolean
  methodEditable: boolean
  start: () => void
  pause: () => void
  skip: () => void
  reset: () => void
  /** Toggle jendela mini (F4). */
  onMini: (() => void) | null
  selectMethod: (index: number) => void
}

/**
 * Selector di dekat target. `instanceof Element` tidak dipakai: elemen di
 * jendela mini berasal dari realm document lain dan gagal instanceof.
 */
function near(node: EventTarget | null, selector: string): Element | null {
  const el = node as Element | null
  return typeof el?.closest === 'function' ? el.closest(selector) : null
}

export function useShortcuts(options: ShortcutOptions, host: Window = window): void {
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) return
      if (near(event.target, 'input, textarea, select, [contenteditable="true"]')) return

      const opts = optionsRef.current

      if (event.key === ' ') {
        // Tombol/link sudah punya perilaku native Spasi — jangan gandakan.
        if (near(event.target, 'button, a')) return
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

    host.addEventListener('keydown', onKeyDown)
    return () => host.removeEventListener('keydown', onKeyDown)
  }, [host])
}

export interface TimerShortcutHooks {
  /** Toggle jendela mini; null = tidak aktif. */
  onMini?: (() => void) | null
  /** Window penerima listener; default halaman utama. */
  host?: Window
}

/** Shortcut alur timer — dipakai layar utama dan jendela mini (F4). */
export function useTimerShortcuts(timer: TimerApi, hooks: TimerShortcutHooks = {}): void {
  const setLastMethod = useSettings((state) => state.setLastMethod)
  const { onMini = null, host } = hooks

  const selectMethod = useCallback(
    (index: number) => {
      const config = METHOD_CONFIGS[index]
      if (!config || config.mode === 'disabled') return
      if (!timer.methodEditable) return
      setLastMethod(config.id)
    },
    [setLastMethod, timer.methodEditable],
  )

  useShortcuts(
    {
      running: timer.state.running,
      methodEditable: timer.methodEditable,
      start: timer.start,
      pause: timer.pause,
      skip: timer.skip,
      reset: timer.reset,
      onMini,
      selectMethod,
    },
    host,
  )
}
