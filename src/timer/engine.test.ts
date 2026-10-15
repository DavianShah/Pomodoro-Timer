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
import { configureMethods, MINUTE } from './methods'

afterEach(() => {
  vi.useRealTimers()
  configureMethods({ durations: {}, custom: null })
})

describe('method configuration', () => {
  it('an unknown id falls back to Pomodoro', () => {
    expect(createTimer('does-not-exist').method).toBe('pomodoro')
  })

  it('phase plans come from configuration, not per-method branching', () => {
    expect(plannedPhaseMs('pomodoro', 'focus')).toBe(25 * MINUTE)
    expect(plannedPhaseMs('pomodoro', 'break')).toBe(5 * MINUTE)
    expect(plannedPhaseMs('pomodoro', 'longBreak')).toBe(15 * MINUTE)
    expect(plannedPhaseMs('ultradian', 'focus')).toBe(90 * MINUTE)
    expect(plannedPhaseMs('52-17', 'longBreak')).toBe(17 * MINUTE)
  })
})

describe('duration overrides and Custom (PRD F3)', () => {
  it('plannedPhaseMs uses the user override', () => {
    configureMethods({
      durations: { pomodoro: { focusMs: 45 * MINUTE, breakMs: 10 * MINUTE } },
      custom: null,
    })
    expect(plannedPhaseMs('pomodoro', 'focus')).toBe(45 * MINUTE)
    expect(plannedPhaseMs('pomodoro', 'break')).toBe(10 * MINUTE)
    expect(plannedPhaseMs('pomodoro', 'longBreak')).toBe(15 * MINUTE)
  })

  it('Custom engine: focus/break overrides, longBreak every 3rd cycle', () => {
    configureMethods({
      durations: {},
      custom: { focusMs: 40 * MINUTE, breakMs: 8 * MINUTE, longBreakMs: 12 * MINUTE, cycle: 3 },
    })
    const state = createTimer('custom')
    expect(state.method).toBe('custom')
    expect(state.remainingMs).toBe(40 * MINUTE)

    const focusDone = tick(start(state, 1_000), 1_000 + 40 * MINUTE)
    expect(focusDone.phase).toBe('break')
    expect(focusDone.remainingMs).toBe(8 * MINUTE)

    const backToFocus = tick(start(focusDone, 2_000), 2_000 + 8 * MINUTE)
    expect(backToFocus.phase).toBe('focus')
    expect(backToFocus.cycleIndex).toBe(2)

    const secondDone = tick(start(backToFocus, 3_000), 3_000 + 40 * MINUTE)
    expect(secondDone.phase).toBe('break')
    const thirdFocus = tick(start(secondDone, 4_000), 4_000 + 8 * MINUTE)
    expect(thirdFocus.phase).toBe('focus')
    expect(thirdFocus.cycleIndex).toBe(3)

    const thirdDone = tick(start(thirdFocus, 5_000), 5_000 + 40 * MINUTE)
    expect(thirdDone.phase).toBe('longBreak')
    expect(thirdDone.remainingMs).toBe(12 * MINUTE)
  })

  it('Custom without a long break: the cycle wraps, no longBreak', () => {
    configureMethods({
      durations: {},
      custom: { focusMs: 10 * MINUTE, breakMs: 2 * MINUTE, longBreakMs: null, cycle: 4 },
    })
    let state = tick(start(createTimer('custom'), 1_000), 1_000 + 10 * MINUTE)
    expect(state.phase).toBe('break')
    state = tick(start(state, 2_000), 2_000 + 2 * MINUTE)
    expect(state.phase).toBe('focus')
    expect(state.cycleIndex).toBe(2)
    expect(state.remainingMs).toBe(10 * MINUTE)
  })
})

describe('countdown', () => {
  it('start sets endTime from the timestamp, not tick counting', () => {
    const state = start(createTimer('pomodoro'), 1_000)
    expect(state.running).toBe(true)
    expect(state.endTime).toBe(1_000 + 25 * MINUTE)
  })

  it('pause freezes the remaining time, then resumes from there', () => {
    let state = start(createTimer('pomodoro'), 0)
    state = pause(state, 10 * MINUTE)
    expect(state.running).toBe(false)
    expect(state.endTime).toBeNull()
    expect(state.remainingMs).toBe(15 * MINUTE)

    state = start(state, 30 * MINUTE)
    expect(state.endTime).toBe(30 * MINUTE + 15 * MINUTE)
    expect(remaining(state, 40 * MINUTE)).toBe(5 * MINUTE)
  })

  it('zero drift: a 60-minute jump (background tab/sleep) is computed from endTime', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)

    let state = start(createTimer('ultradian'), Date.now())
    // One pulse after a 60-minute sleep + 400 ms; no ticks in between.
    vi.setSystemTime(60 * MINUTE + 400)
    state = tick(state, Date.now())

    expect(state.running).toBe(true)
    // Remaining must be exactly 90:00 − 60:00.400, difference 0 < 1 second (PRD section 13).
    expect(remaining(state, Date.now())).toBe(30 * MINUTE - 400)
  })

  it('waking after endTime: the phase counts as finished, break ready to run', () => {
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

  it('a tick before endTime changes nothing', () => {
    const state = start(createTimer('pomodoro'), 0)
    expect(tick(state, 24 * MINUTE)).toBe(state)
  })

  it('skipping the focus phase goes straight to the break', () => {
    const state = skip(start(createTimer('pomodoro'), 0), 3 * MINUTE)
    expect(state.phase).toBe('break')
    expect(state.running).toBe(false)
    expect(state.remainingMs).toBe(5 * MINUTE)
  })

  it('Pomodoro cycle: a long break every 4 sessions, then back to 1', () => {
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

  it('52/17 never has a long break', () => {
    let state = start(createTimer('52-17'), 0)
    state = skip(state, 0)
    expect(state.phase).toBe('break')
    expect(plannedPhaseMs('52-17', 'break')).toBe(17 * MINUTE)
    state = skip(start(state, 0), 0)
    expect(state.phase).toBe('focus')
    expect(state.cycleIndex).toBe(1)
  })

  it('reset returns to the initial focus', () => {
    const state = reset(skip(start(createTimer('pomodoro'), 0), 0))
    expect(state.phase).toBe('focus')
    expect(state.running).toBe(false)
    expect(state.remainingMs).toBe(25 * MINUTE)
    expect(state.cycleIndex).toBe(1)
  })
})

describe('count-up (Flowtime)', () => {
  it('focus never finishes on its own — no alarm', () => {
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

  it('pausing and resuming accumulates focus time correctly', () => {
    let state = start(createTimer('flowtime'), 0)
    state = pause(state, 10 * MINUTE)
    expect(state.elapsedMs).toBe(10 * MINUTE)
    expect(state.startedAt).toBeNull()

    state = start(state, 30 * MINUTE)
    expect(elapsed(state, 35 * MINUTE)).toBe(15 * MINUTE)
  })

  it('proportional breaks follow the PRD rules at every boundary', () => {
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

  it('the Flowtime break stays a regular countdown', () => {
    let state = skip(start(createTimer('flowtime'), 0), 25 * MINUTE)
    state = start(state, 60_000)
    expect(state.endTime).toBe(60_000 + 8 * MINUTE)
    expect(tick(state, 60_000 + 8 * MINUTE).phase).toBe('focus')
  })
})

describe('formatClock', () => {
  it('unlimited minutes, two-digit seconds, never negative', () => {
    expect(formatClock(25 * MINUTE)).toBe('25:00')
    expect(formatClock(90 * MINUTE)).toBe('90:00')
    expect(formatClock(65_000)).toBe('01:05')
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(-5_000)).toBe('00:00')
  })
})

describe('time boxing', () => {
  const blockEnd = 30 * MINUTE

  it('start needs a block: endTime null or already past → no-op', () => {
    const idle = createTimer('timeboxing')
    expect(idle.endTime).toBeNull()
    expect(start(idle, 1_000)).toBe(idle)

    const stale = setBoxingEnd(idle, 1_000)
    expect(start(stale, 2_000)).toBe(stale)
  })

  it('start inside a block: running, endTime stays the block-end marker', () => {
    const running = start(setBoxingEnd(createTimer('timeboxing'), blockEnd), 5 * MINUTE)
    expect(running.running).toBe(true)
    expect(running.endTime).toBe(blockEnd)
    expect(running.startedAt).toBe(5 * MINUTE)
    expect(running.remainingMs).toBeNull()
  })

  it('pause is a no-op — a running block follows the wall clock', () => {
    const running = start(setBoxingEnd(createTimer('timeboxing'), blockEnd), 5 * MINUTE)
    expect(pause(running, 10 * MINUTE)).toBe(running)
  })

  it('skipping the block end: stops, endTime and phase kept for the prompt', () => {
    const running = start(setBoxingEnd(createTimer('timeboxing'), blockEnd), 5 * MINUTE)
    const ended = tick(running, blockEnd + 1_000)
    expect(ended.running).toBe(false)
    expect(ended.endTime).toBe(blockEnd)
    expect(ended.phase).toBe('focus')
    expect(ended.startedAt).toBeNull()
    expect(endsFocusSession(running, ended)).toBe(true)
    expect(endsFocusSession(ended, ended)).toBe(false)
  })

  it('setBoxingEnd sets and clears the block marker', () => {
    const idle = createTimer('timeboxing')
    expect(setBoxingEnd(idle, blockEnd).endTime).toBe(blockEnd)
    expect(setBoxingEnd(idle, null).endTime).toBeNull()
  })
})
