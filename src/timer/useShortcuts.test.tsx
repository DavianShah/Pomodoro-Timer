/**
 * Tabel keputusan shortcut (PRD F7): semua metode × {idle, berjalan,
 * paused/ber akhir} × {Spasi, R, S}. Baris kritisnya Time Boxing — Spasi
 * saat berjalan tidak memanggil aksi apa pun (blok hanya ditutup lewat
 * tombol Selesai atau S); Spasi saat idle memanggil start, dan mesin yang
 * menolak kalau tidak ada blok aktif (`engine.start`).
 *
 * Hook dipasang lewat probe kecil; berkas ini juga memastikan satu tekanan
 * menghasilkan tepat satu aksi (listener ganda akan terlihat di sini).
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTimer, pause as pausePhase, setBoxingEnd, start as startPhase } from './engine'
import type { TimerState } from './engine'
import { METHOD_CONFIGS, MINUTE, methodById, type RunnableMethod } from './methods'
import type { MethodConfig } from './methods'
import { useTimerShortcuts } from './useShortcuts'
import type { TimerApi } from './useTimer'

const NOW = 1_700_000_000_000
const KINDS = ['idle', 'berjalan', 'paused/ber akhir'] as const
const KEYS = [' ', 'R', 'S'] as const

type Kind = (typeof KINDS)[number]
type Action = 'start' | 'pause' | 'skip' | 'reset'
const ACTIONS: readonly Action[] = ['start', 'pause', 'skip', 'reset']

afterEach(cleanup)

/** State per metode per keadaan; jam tetap NOW supaya deterministik. */
function stateFor(config: MethodConfig, kind: Kind): TimerState {
  const idle = createTimer(config.id)
  if (config.mode === 'boxing') {
    if (kind === 'idle') return setBoxingEnd(idle, NOW + 30 * MINUTE)
    if (kind === 'berjalan') return startPhase(setBoxingEnd(idle, NOW + 30 * MINUTE), NOW)
    // Blok sudah lewat: baris pilihan "ber akhir".
    return setBoxingEnd(idle, NOW - MINUTE)
  }
  if (kind === 'idle') return idle
  const running = startPhase(idle, NOW)
  return kind === 'berjalan' ? running : pausePhase(running, NOW + MINUTE)
}

/** Aksi yang seharusnya dipanggil hook untuk satu baris tabel. */
function expected(config: MethodConfig, kind: Kind, key: string): Action[] {
  if (key === 'R') return ['reset']
  if (key === 'S') return ['skip']
  if (config.mode === 'boxing') return kind === 'berjalan' ? [] : ['start']
  return kind === 'berjalan' ? ['pause'] : ['start']
}

function Probe({ timer }: { timer: TimerApi }): null {
  useTimerShortcuts(timer)
  return null
}

interface Spies {
  start: ReturnType<typeof vi.fn<() => void>>
  pause: ReturnType<typeof vi.fn<() => void>>
  skip: ReturnType<typeof vi.fn<() => void>>
  reset: ReturnType<typeof vi.fn<() => void>>
}

function makeSpies(): Spies {
  return {
    start: vi.fn<() => void>(),
    pause: vi.fn<() => void>(),
    skip: vi.fn<() => void>(),
    reset: vi.fn<() => void>(),
  }
}

function makeTimer(config: MethodConfig, kind: Kind, spies: Spies): TimerApi {
  const state = stateFor(config, kind)
  return {
    state,
    now: NOW,
    display: 0,
    methodEditable: !state.running,
    soundBlocked: false,
    setBoxingEnd: vi.fn<(endMs: number | null) => void>(),
    resumeAt: vi.fn<(endMs: number) => void>(),
    ...spies,
  }
}

/** Lipatan aksi terpanggil — mendeteksi listener ganda. */
function collect(spies: Spies): Action[] {
  const fired: Action[] = []
  for (const action of ACTIONS) {
    for (let i = 0; i < spies[action].mock.calls.length; i += 1) fired.push(action)
  }
  return fired
}

function press(config: MethodConfig, kind: Kind, key: string): Action[] {
  const spies = makeSpies()
  render(<Probe timer={makeTimer(config, kind, spies)} />)
  fireEvent.keyDown(window, { key })
  return collect(spies)
}

const ROWS = METHOD_CONFIGS.flatMap((config) =>
  KINDS.flatMap((kind) =>
    KEYS.map((key) => ({
      name: `${config.name} · ${kind} · "${key}"`,
      config,
      kind,
      key,
    })),
  ),
)

describe('tabel keputusan shortcut (F7)', () => {
  it.each(ROWS)('$name', ({ config, kind, key }) => {
    expect(press(config, kind, key)).toEqual(expected(config, kind, key))
  })

  it('Spasi di Time Boxing berjalan tidak menyentuh aksi Selesai (skip)', () => {
    const boxing = METHOD_CONFIGS.find((config) => config.mode === 'boxing')
    if (boxing === undefined) throw new Error('metode Time Boxing tidak ada')
    expect(press(boxing, 'berjalan', ' ')).toEqual([])
  })
})

describe('Spasi dan fokus tombol', () => {
  interface Outcome {
    fired: Action[]
    keydownPrevented: boolean
    keyupPrevented: boolean
  }

  /**
   * Spasi: semantik shortcut global jalan di mana pun fokus (kecuali
   * input); aktivasi native dicegah hanya pada tombol aksi utama karena
   * labelnya berubah di bawah fokus (Mulai→Jeda, Mulai→Selesai).
   */
  function pressAt(config: RunnableMethod, kind: Kind, selector: string): Outcome {
    const spies = makeSpies()
    const view = render(
      <>
        <Probe timer={makeTimer(config, kind, spies)} />
        <button type="button" data-primary-action="">
          Aksi utama
        </button>
        <button type="button">Tombol lain</button>
        <input aria-label="catatan" />
      </>,
    )
    const target = selector === 'window' ? window : view.container.querySelector(selector)
    if (target === null) throw new Error(`target ${selector} tidak ditemukan`)

    let keydownPrevented = false
    let keyupPrevented = false
    // Spy terpasang setelah efek shortcut: urutan listener membuatnya
    // membaca defaultPrevented SETELAH handler shortcut jalan.
    window.addEventListener(
      'keydown',
      (event: KeyboardEvent) => {
        keydownPrevented = event.defaultPrevented
      },
      { once: true },
    )
    window.addEventListener(
      'keyup',
      (event: KeyboardEvent) => {
        keyupPrevented = event.defaultPrevented
      },
      { once: true },
    )

    fireEvent.keyDown(target, { key: ' ' })
    fireEvent.keyUp(target, { key: ' ' })
    return { fired: collect(spies), keydownPrevented, keyupPrevented }
  }

  it('tombol aksi utama, Pomodoro berjalan: shortcut jeda sekali, aktivasi native dibatalkan', () => {
    const outcome = pressAt(methodById('pomodoro'), 'berjalan', '[data-primary-action]')
    expect(outcome.fired).toEqual(['pause'])
    expect(outcome.keydownPrevented).toBe(true)
    expect(outcome.keyupPrevented).toBe(true)
  })

  it('tombol aksi utama, Time Boxing berjalan: tanpa aksi dan native dibatalkan', () => {
    const outcome = pressAt(methodById('timeboxing'), 'berjalan', '[data-primary-action]')
    expect(outcome.fired).toEqual([])
    expect(outcome.keydownPrevented).toBe(true)
    expect(outcome.keyupPrevented).toBe(true)
  })

  it('tombol lain: aktivasi native tetap, shortcut tetap jalan', () => {
    const outcome = pressAt(methodById('pomodoro'), 'berjalan', 'button:not([data-primary-action])')
    expect(outcome.fired).toEqual(['pause'])
    expect(outcome.keydownPrevented).toBe(false)
    expect(outcome.keyupPrevented).toBe(false)
  })

  it('di input: Spasi mengetik, shortcut tidak jalan', () => {
    const outcome = pressAt(methodById('pomodoro'), 'idle', 'input')
    expect(outcome.fired).toEqual([])
    expect(outcome.keydownPrevented).toBe(false)
  })

  it('di luar kontrol: Spasi dicegah (anti-scroll) lalu shortcut jalan', () => {
    const outcome = pressAt(methodById('pomodoro'), 'idle', 'window')
    expect(outcome.fired).toEqual(['start'])
    expect(outcome.keydownPrevented).toBe(true)
  })
})
