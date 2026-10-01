/**
 * Shortcut keyboard (PRD F7): Spasi mulai/jeda, R reset, S lewati,
 * M jendela mini, 1-5 ganti metode saat idle. Mati saat fokus di
 * input/textarea/select, saat ada modifier, dan saat key auto-repeat.
 * Spasi tidak men-scroll.
 *
 * Spasi menjalankan semantik shortcut global di mana pun fokus, kecuali
 * di input. Aktivasi native dicegah hanya pada tombol aksi utama
 * ([data-primary-action]): labelnya berubah di bawah fokus (Mulai → Jeda
 * → Mulai, atau Mulai → Selesai di Time Boxing), sehingga Spasi bisa
 * mengaktifkan label baru yang salah. Enter dan klik tetap mengaktifkan
 * tombol utama; tombol/link lain mempertahankan aktivasi native Spasi
 * (perilaku aksesibilitas standar).
 *
 * Time Boxing berbeda: Spasi hanya memulai (butuh blok aktif) dan saat
 * berjalan tidak melakukan apa-apa — blok ditutup lewat tombol Selesai
 * atau shortcut S, tidak lewat Spasi.
 *
 * Listener dipasang di window yang diberikan — halaman utama memakai
 * window-nya sendiri, jendela mini memasang listener di window mini
 * supaya spasi/R jalan saat fokus di sana.
 */

import { useCallback, useEffect, useRef } from 'react'
import { METHOD_CONFIGS, methodById } from './methods'
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
  /** Toggle panel task (F9). */
  onTasks: (() => void) | null
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
        // Tombol aksi utama: labelnya berubah di bawah fokus, jadi aktivasi
        // native Spasi dimatikan (keydown + keyup) supaya hanya semantik
        // shortcut yang jalan. Tombol/link lain dibiarkan native.
        const primary = near(event.target, '[data-primary-action]') !== null
        const control = near(event.target, 'button, a') !== null
        if (primary || !control) event.preventDefault()
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
      if (letter === 'm') opts.onMini?.()
      else if (letter === 't') opts.onTasks?.()
    }

    const onKeyUp = (event: KeyboardEvent): void => {
      // Beberapa mesin mengaktifkan tombol saat keyup Spasi; dibatalkan
      // hanya untuk tombol aksi utama (lihat catatan di onKeyDown).
      if (event.key === ' ' && near(event.target, '[data-primary-action]') !== null) {
        event.preventDefault()
      }
    }

    host.addEventListener('keydown', onKeyDown)
    host.addEventListener('keyup', onKeyUp)
    return () => {
      host.removeEventListener('keydown', onKeyDown)
      host.removeEventListener('keyup', onKeyUp)
    }
  }, [host])
}

export interface TimerShortcutHooks {
  /** Toggle jendela mini; null = tidak aktif. */
  onMini?: (() => void) | null
  /** Toggle panel task; null = tidak aktif. */
  onTasks?: (() => void) | null
  /** Window penerima listener; default halaman utama. */
  host?: Window
}

/** Aksi sengaja kosong (mis. Spasi saat Time Boxing berjalan). */
const noop = (): void => {}

/** Shortcut alur timer — dipakai layar utama dan jendela mini (F4). */
export function useTimerShortcuts(timer: TimerApi, hooks: TimerShortcutHooks = {}): void {
  const setLastMethod = useSettings((state) => state.setLastMethod)
  const { onMini = null, onTasks = null, host } = hooks
  // Time Boxing: Spasi saat berjalan tidak mengakhiri blok (PRD F7).
  const boxing = methodById(timer.state.method).mode === 'boxing'

  const selectMethod = useCallback(
    (index: number) => {
      const config = METHOD_CONFIGS[index]
      if (!config) return
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
      pause: boxing ? noop : timer.pause,
      skip: timer.skip,
      reset: timer.reset,
      onMini,
      onTasks,
      selectMethod,
    },
    host,
  )
}
