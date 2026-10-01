import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTimer,
  displayMs,
  elapsed,
  endsFocusSession,
  formatClock,
  pause,
  plannedPhaseMs,
  remaining,
  reset,
  setBoxingEnd,
  skip,
  start,
  tick,
} from './engine'
import { MINUTE } from './methods'

afterEach(() => {
  vi.useRealTimers()
})

describe('konfigurasi metode', () => {
  it('id tak dikenal jatuh ke Pomodoro', () => {
    expect(createTimer('tidak-ada').method).toBe('pomodoro')
  })

  it('rencana fase dihitung dari konfigurasi, bukan percabangan metode', () => {
    expect(plannedPhaseMs('pomodoro', 'focus')).toBe(25 * MINUTE)
    expect(plannedPhaseMs('pomodoro', 'break')).toBe(5 * MINUTE)
    expect(plannedPhaseMs('pomodoro', 'longBreak')).toBe(15 * MINUTE)
    expect(plannedPhaseMs('ultradian', 'focus')).toBe(90 * MINUTE)
    expect(plannedPhaseMs('52-17', 'longBreak')).toBe(17 * MINUTE)
  })
})

describe('countdown', () => {
  it('mulai menetapkan endTime dari timestamp, bukan hitungan tick', () => {
    const state = start(createTimer('pomodoro'), 1_000)
    expect(state.running).toBe(true)
    expect(state.endTime).toBe(1_000 + 25 * MINUTE)
  })

  it('jeda membekukan sisa waktu lalu lanjut dari sana', () => {
    let state = start(createTimer('pomodoro'), 0)
    state = pause(state, 10 * MINUTE)
    expect(state.running).toBe(false)
    expect(state.endTime).toBeNull()
    expect(state.remainingMs).toBe(15 * MINUTE)

    state = start(state, 30 * MINUTE)
    expect(state.endTime).toBe(30 * MINUTE + 15 * MINUTE)
    expect(remaining(state, 40 * MINUTE)).toBe(5 * MINUTE)
  })

  it('drift nol: lompatan 60 menit (tab background/sleep) dihitung dari endTime', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)

    let state = start(createTimer('ultradian'), Date.now())
    // Satu pulse setelah tidur 60 menit + 400 ms; tidak ada tick di antaranya.
    vi.setSystemTime(60 * MINUTE + 400)
    state = tick(state, Date.now())

    expect(state.running).toBe(true)
    // Sisa harus tepat 90:00 − 60:00.400, selisih 0 < 1 detik (PRD bagian 13).
    expect(remaining(state, Date.now())).toBe(30 * MINUTE - 400)
  })

  it('bangun tidur setelah endTime: fase dianggap selesai, istirahat siap dijalankan', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)

    let state = start(createTimer('pomodoro'), Date.now())
    vi.setSystemTime(30 * MINUTE)
    state = tick(state, Date.now())

    expect(state.running).toBe(false)
    expect(state.phase).toBe('break')
    expect(state.endTime).toBeNull()
    expect(remaining(state, Date.now())).toBe(5 * MINUTE)
    expect(displayMs(state, Date.now())).toBe(5 * MINUTE)
  })

  it('tick sebelum endTime tidak mengubah apa pun', () => {
    const state = start(createTimer('pomodoro'), 0)
    expect(tick(state, 24 * MINUTE)).toBe(state)
  })

  it('lewati fase fokus langsung ke istirahat', () => {
    const state = skip(start(createTimer('pomodoro'), 0), 3 * MINUTE)
    expect(state.phase).toBe('break')
    expect(state.running).toBe(false)
    expect(state.remainingMs).toBe(5 * MINUTE)
  })

  it('siklus Pomodoro: istirahat panjang tiap 4 sesi lalu kembali ke 1', () => {
    let state = createTimer('pomodoro')

    for (let cycle = 1; cycle <= 4; cycle += 1) {
      expect(state.phase).toBe('focus')
      expect(state.cycleIndex).toBe(cycle)
      state = skip(start(state, 0), 0)
      expect(state.phase).toBe(cycle === 4 ? 'longBreak' : 'break')
      state = skip(start(state, 0), 0)
    }

    expect(state.phase).toBe('focus')
    expect(state.cycleIndex).toBe(1)
  })

  it('52/17 tidak pernah punya istirahat panjang', () => {
    let state = start(createTimer('52-17'), 0)
    state = skip(state, 0)
    expect(state.phase).toBe('break')
    expect(plannedPhaseMs('52-17', 'break')).toBe(17 * MINUTE)
    state = skip(start(state, 0), 0)
    expect(state.phase).toBe('focus')
    expect(state.cycleIndex).toBe(1)
  })

  it('reset mengembalikan ke fokus awal', () => {
    const state = reset(skip(start(createTimer('pomodoro'), 0), 0))
    expect(state.phase).toBe('focus')
    expect(state.running).toBe(false)
    expect(state.remainingMs).toBe(25 * MINUTE)
    expect(state.cycleIndex).toBe(1)
  })
})

describe('hitung maju (Flowtime)', () => {
  it('fokus tidak pernah selesai sendiri — tidak ada alarm', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)

    let state = start(createTimer('flowtime'), Date.now())
    vi.setSystemTime(3 * 60 * MINUTE)
    state = tick(state, Date.now())

    expect(state.running).toBe(true)
    expect(state.phase).toBe('focus')
    expect(elapsed(state, Date.now())).toBe(3 * 60 * MINUTE)
    expect(displayMs(state, Date.now())).toBe(3 * 60 * MINUTE)
  })

  it('jeda dan lanjut menumpuk durasi fokus dengan benar', () => {
    let state = start(createTimer('flowtime'), 0)
    state = pause(state, 10 * MINUTE)
    expect(state.elapsedMs).toBe(10 * MINUTE)
    expect(state.startedAt).toBeNull()

    state = start(state, 30 * MINUTE)
    expect(elapsed(state, 35 * MINUTE)).toBe(15 * MINUTE)
  })

  it('istirahat proporsional mengikuti aturan PRD di semua batas', () => {
    const cases: Array<[number, number]> = [
      [0, 5 * MINUTE],
      [25 * MINUTE - 1_000, 5 * MINUTE],
      [25 * MINUTE, 8 * MINUTE],
      [50 * MINUTE - 1_000, 8 * MINUTE],
      [50 * MINUTE, 10 * MINUTE],
      [90 * MINUTE, 10 * MINUTE],
      [90 * MINUTE + 1_000, 15 * MINUTE],
    ]

    for (const [focusMs, breakMs] of cases) {
      const state = skip(start(createTimer('flowtime'), 1_000), 1_000 + focusMs)
      expect(state.phase).toBe('break')
      expect(state.remainingMs).toBe(breakMs)
      expect(state.running).toBe(false)
    }
  })

  it('istirahat Flowtime tetap countdown biasa', () => {
    let state = skip(start(createTimer('flowtime'), 0), 25 * MINUTE)
    state = start(state, 60_000)
    expect(state.endTime).toBe(60_000 + 8 * MINUTE)
    expect(tick(state, 60_000 + 8 * MINUTE).phase).toBe('focus')
  })
})

describe('formatClock', () => {
  it('menit tanpa batas, detik dua digit, tidak pernah negatif', () => {
    expect(formatClock(25 * MINUTE)).toBe('25:00')
    expect(formatClock(90 * MINUTE)).toBe('90:00')
    expect(formatClock(65_000)).toBe('1:05')
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(-5_000)).toBe('0:00')
  })
})

describe('time boxing', () => {
  const blockEnd = 30 * MINUTE

  it('mulai butuh blok: endTime null atau sudah lewat → no-op', () => {
    const idle = createTimer('timeboxing')
    expect(idle.endTime).toBeNull()
    expect(start(idle, 1_000)).toBe(idle)

    const stale = setBoxingEnd(idle, 1_000)
    expect(start(stale, 2_000)).toBe(stale)
  })

  it('mulai di dalam blok: running, endTime tetap penanda akhir blok', () => {
    const running = start(setBoxingEnd(createTimer('timeboxing'), blockEnd), 5 * MINUTE)
    expect(running.running).toBe(true)
    expect(running.endTime).toBe(blockEnd)
    expect(running.startedAt).toBe(5 * MINUTE)
    expect(running.remainingMs).toBeNull()
  })

  it('jeda no-op — blok berjalan mengikuti jam dinding', () => {
    const running = start(setBoxingEnd(createTimer('timeboxing'), blockEnd), 5 * MINUTE)
    expect(pause(running, 10 * MINUTE)).toBe(running)
  })

  it('lewati akhir blok: berhenti, endTime dan fase dipertahankan untuk pilihan', () => {
    const running = start(setBoxingEnd(createTimer('timeboxing'), blockEnd), 5 * MINUTE)
    const ended = tick(running, blockEnd + 1_000)
    expect(ended.running).toBe(false)
    expect(ended.endTime).toBe(blockEnd)
    expect(ended.phase).toBe('focus')
    expect(ended.startedAt).toBeNull()
    expect(endsFocusSession(running, ended)).toBe(true)
    expect(endsFocusSession(ended, ended)).toBe(false)
  })

  it('setBoxingEnd menyetel dan membersihkan penanda blok', () => {
    const idle = createTimer('timeboxing')
    expect(setBoxingEnd(idle, blockEnd).endTime).toBe(blockEnd)
    expect(setBoxingEnd(idle, null).endTime).toBeNull()
  })
})
