import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTimer, elapsed, pause, setBoxingEnd, start } from './engine'
import { configureMethods, DEFAULT_CUSTOM, MINUTE } from './methods'
import { loadTimer, restoreTimer, saveTimer } from './persist'

const T0 = Date.UTC(2026, 0, 5, 8, 0, 0)

describe('timer save/restore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    configureMethods({ durations: {}, custom: null })
  })

  it('restores a running countdown from its remaining time', () => {
    const running = start(createTimer('pomodoro'), T0)
    saveTimer(running)

    const restored = loadTimer(T0 + 40_000)
    expect(restored.running).toBe(true)
    expect(restored.phase).toBe('focus')
    expect(restored.endTime).toBe(running.endTime)
    expect(restored.method).toBe('pomodoro')
  })

  it('endTime already past → session finishes silently, no alarm, no crash', () => {
    const running = start(createTimer('pomodoro'), T0)
    const restored = restoreTimer(running, T0 + 25 * MINUTE + 60_000)

    expect(restored.phase).toBe('break')
    expect(restored.running).toBe(false)
    expect(restored.endTime).toBeNull()
    expect(restored.remainingMs).toBe(5 * MINUTE)
  })

  it('a paused timer restores as-is: remaining time and phase unchanged', () => {
    const paused = pause(start(createTimer('pomodoro'), T0), T0 + 7 * MINUTE)
    const restored = restoreTimer(paused, T0 + 3 * 60 * 60 * 1000)

    expect(restored.running).toBe(false)
    expect(restored.phase).toBe('focus')
    expect(restored.remainingMs).toBe(paused.remainingMs)
    expect(restored.remainingMs).toBe(18 * MINUTE)
  })

  it('Custom method without stored configuration → falls back to Pomodoro, no crash', () => {
    configureMethods({ durations: {}, custom: null })
    const raw = {
      method: 'custom',
      phase: 'focus',
      running: false,
      cycleIndex: 1,
      endTime: null,
      remainingMs: 40 * MINUTE,
      elapsedMs: 0,
      startedAt: null,
    }

    const restored = restoreTimer(raw, T0)
    expect(restored.method).toBe('pomodoro')
    expect(restored.running).toBe(false)
    expect(restored.remainingMs).toBe(40 * MINUTE)
  })

  it('Custom method with stored configuration stays Custom', () => {
    configureMethods({
      durations: {},
      custom: { ...DEFAULT_CUSTOM, focusMs: 40 * MINUTE },
    })
    const raw = {
      method: 'custom',
      phase: 'focus',
      running: false,
      cycleIndex: 1,
      endTime: null,
      remainingMs: 40 * MINUTE,
      elapsedMs: 0,
      startedAt: null,
    }

    const restored = restoreTimer(raw, T0)
    expect(restored.method).toBe('custom')
    expect(restored.remainingMs).toBe(40 * MINUTE)
  })

  it('running Flowtime count-up: elapsed continues from the recovery time', () => {
    const running = start(createTimer('flowtime'), T0)
    const at = T0 + 90_000
    const restored = restoreTimer(running, at)

    expect(restored.running).toBe(true)
    expect(restored.endTime).toBeNull()
    expect(elapsed(restored, at)).toBe(90_000)
  })

  it('paused Flowtime count-up: the old accumulation is kept', () => {
    const paused = pause(start(createTimer('flowtime'), T0), T0 + 60_000)
    const restored = restoreTimer(paused, T0 + 9 * 60 * 60 * 1000)

    expect(restored.running).toBe(false)
    expect(elapsed(restored, T0 + 9 * 60 * 60 * 1000)).toBe(60_000)
  })

  it('corrupt data falls back to the initial state without crashing', () => {
    for (const bad of [
      'not an object',
      42,
      null,
      {},
      { method: 'pomodoro', phase: 'later', running: false, cycleIndex: 1 },
      { method: 'pomodoro', phase: 'focus', running: 'yes', cycleIndex: 1 },
      { method: 'pomodoro', phase: 'focus', running: true, cycleIndex: 0 },
      {
        method: 'pomodoro',
        phase: 'focus',
        running: false,
        cycleIndex: 1,
        endTime: 'tuesday',
        remainingMs: NaN,
        elapsedMs: Infinity,
        startedAt: {},
      },
    ]) {
      const restored = restoreTimer(bad, T0)
      expect(restored.method).toBe('pomodoro')
      expect(restored.phase).toBe('focus')
      expect(restored.running).toBe(false)
      expect(restored.remainingMs).toBe(25 * MINUTE)
    }
  })

  it('corrupt localStorage content reads as the initial state', () => {
    localStorage.setItem('ritme.v1.timer', '{invalid json')
    expect(loadTimer(T0).remainingMs).toBe(25 * MINUTE)

    localStorage.setItem('ritme.v1.timer', JSON.stringify({ v: 1, value: [1, 2, 3] }))
    expect(loadTimer(T0).method).toBe('pomodoro')
  })

  it('an unknown method falls back to Pomodoro', () => {
    const running = start(createTimer('pomodoro'), T0)
    const restored = restoreTimer({ ...running, method: 'mars' }, T0 + 1000)
    expect(restored.method).toBe('pomodoro')
  })

  it('a running countdown without endTime is inconsistent data → paused', () => {
    const running = start(createTimer('pomodoro'), T0)
    const restored = restoreTimer({ ...running, endTime: null, remainingMs: null }, T0 + 1000)

    expect(restored.running).toBe(false)
    expect(restored.endTime).toBeNull()
    expect(restored.remainingMs).toBe(25 * MINUTE)
  })
})

describe('Time Boxing restore', () => {
  const blockEnd = T0 + 30 * MINUTE

  it('endTime already past → stops as a block marker: focus phase, endTime kept', () => {
    const running = start(setBoxingEnd(createTimer('timeboxing'), blockEnd), T0)
    const restored = restoreTimer(running, T0 + 45 * MINUTE)

    expect(restored.running).toBe(false)
    expect(restored.endTime).toBe(blockEnd)
    expect(restored.phase).toBe('focus')
  })

  it('endTime still ahead → restores running with the same block end', () => {
    const running = start(setBoxingEnd(createTimer('timeboxing'), blockEnd), T0)
    const restored = restoreTimer(running, T0 + 5 * MINUTE)

    expect(restored.running).toBe(true)
    expect(restored.endTime).toBe(blockEnd)
    expect(restored.startedAt).toBe(T0)
  })
})
