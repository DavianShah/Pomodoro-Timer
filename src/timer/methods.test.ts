import { afterEach, describe, expect, it } from 'vitest'
import {
  configureMethods,
  customMethod,
  DEFAULT_CUSTOM,
  DURATION_LIMITS,
  inDurationRange,
  methodById,
  methodName,
  MINUTE,
} from './methods'

afterEach(() => {
  configureMethods({ durations: {}, custom: null })
})

describe('duration registry (PRD F3)', () => {
  it('an override changes method resolution; untouched fields keep their defaults', () => {
    configureMethods({
      durations: { pomodoro: { focusMs: 45 * MINUTE, breakMs: 10 * MINUTE } },
      custom: null,
    })

    const config = methodById('pomodoro')
    expect(config.mode).toBe('countdown')
    if (config.mode !== 'countdown') throw new Error('not a countdown')
    expect(config.focusMs).toBe(45 * MINUTE)
    expect(config.breakMs).toBe(10 * MINUTE)
    expect(config.longBreakMs).toBe(15 * MINUTE)
    expect(config.cycle).toBe(4)
  })

  it('without an override it uses the default configuration', () => {
    const config = methodById('52-17')
    if (config.mode !== 'countdown') throw new Error('not a countdown')
    expect(config.focusMs).toBe(52 * MINUTE)
    expect(config.breakMs).toBe(17 * MINUTE)
  })

  it('Custom comes from the registry; without configuration it falls back to Pomodoro', () => {
    expect(methodById('custom').id).toBe('pomodoro')

    configureMethods({
      durations: {},
      custom: { ...DEFAULT_CUSTOM, focusMs: 40 * MINUTE, longBreakMs: 12 * MINUTE, cycle: 3 },
    })
    const config = methodById('custom')
    expect(config.id).toBe('custom')
    if (config.mode !== 'countdown') throw new Error('not a countdown')
    expect(config.focusMs).toBe(40 * MINUTE)
    expect(config.longBreakMs).toBe(12 * MINUTE)
    expect(config.cycle).toBe(3)
  })

  it('an unknown id falls back to Pomodoro with its overrides', () => {
    configureMethods({
      durations: { pomodoro: { focusMs: 30 * MINUTE, breakMs: 5 * MINUTE } },
      custom: null,
    })
    expect(methodById('does-not-exist').id).toBe('pomodoro')
    const config = methodById('does-not-exist')
    if (config.mode !== 'countdown') throw new Error('not a countdown')
    expect(config.focusMs).toBe(30 * MINUTE)
  })

  it('the stats method name stays Custom even when the configuration is gone', () => {
    expect(methodName('custom')).toBe('Custom')
    expect(methodName('pomodoro')).toBe('Pomodoro')
    expect(methodName('does-not-exist')).toBe('Pomodoro')
  })

  it('the Custom picker row always shows, with effective values', () => {
    expect(customMethod().id).toBe('custom')
    const fresh = customMethod()
    if (fresh.mode !== 'countdown') throw new Error('not a countdown')
    expect(fresh.focusMs).toBe(DEFAULT_CUSTOM.focusMs)

    configureMethods({
      durations: {},
      custom: { ...DEFAULT_CUSTOM, focusMs: 45 * MINUTE },
    })
    const configured = customMethod()
    if (configured.mode !== 'countdown') throw new Error('not a countdown')
    expect(configured.focusMs).toBe(45 * MINUTE)
  })
})

describe('duration validation', () => {
  it('range limits per field (minutes, cycles)', () => {
    expect(DURATION_LIMITS).toEqual({
      focus: { min: 1, max: 180 },
      break: { min: 1, max: 60 },
      longBreak: { min: 1, max: 120 },
      cycle: { min: 2, max: 8 },
    })
  })

  it('focus: 1–180 minutes', () => {
    expect(inDurationRange('focus', 1 * MINUTE)).toBe(true)
    expect(inDurationRange('focus', 180 * MINUTE)).toBe(true)
    expect(inDurationRange('focus', 0)).toBe(false)
    expect(inDurationRange('focus', 181 * MINUTE)).toBe(false)
  })

  it('break: 1–60 minutes; long break: 1–120 minutes', () => {
    expect(inDurationRange('break', 60 * MINUTE)).toBe(true)
    expect(inDurationRange('break', 61 * MINUTE)).toBe(false)
    expect(inDurationRange('longBreak', 120 * MINUTE)).toBe(true)
    expect(inDurationRange('longBreak', 121 * MINUTE)).toBe(false)
  })

  it('cycle: 2–8 sessions', () => {
    expect(inDurationRange('cycle', 2)).toBe(true)
    expect(inDurationRange('cycle', 8)).toBe(true)
    expect(inDurationRange('cycle', 1)).toBe(false)
    expect(inDurationRange('cycle', 9)).toBe(false)
  })

  it('fractions are not accepted', () => {
    expect(inDurationRange('focus', 25.5 * MINUTE)).toBe(false)
    expect(inDurationRange('cycle', 2.5)).toBe(false)
  })
})
