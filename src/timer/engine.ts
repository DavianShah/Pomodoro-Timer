/**
 * Pure timer engine. Every transition takes `now` (epoch ms) so it can be
 * tested with fake timers. Time always derives from `endTime` (timestamp),
 * not tick accumulation — safe against sleep/background tabs (PRD F1).
 *
 * Methods are data configuration (`methods.ts`); no per-method if/else here.
 */

import type { Phase } from '@/db/db'
import { breakForFocus, methodById } from './methods'

export interface TimerState {
  /** Id of the method configuration in use. */
  method: string
  phase: Phase
  running: boolean
  /** Session position within the cycle, 1-based. */
  cycleIndex: number
  /** Running countdown: phase end in epoch ms. */
  endTime: number | null
  /** Paused countdown: remaining time in this phase. */
  remainingMs: number | null
  /** Count-up (Flowtime): accumulated focus time. */
  elapsedMs: number
  /** Running count-up: start moment. */
  startedAt: number | null
}

/** Planned phase duration for countdown configurations. */
export function plannedPhaseMs(methodId: string, phase: Phase): number {
  const method = methodById(methodId)
  if (method.mode !== 'countdown') return 0
  if (phase === 'focus') return method.focusMs
  if (phase === 'longBreak') return method.longBreakMs ?? method.breakMs
  return method.breakMs
}

export function createTimer(methodId: string): TimerState {
  const method = methodById(methodId)
  return {
    method: method.id,
    phase: 'focus',
    running: false,
    cycleIndex: 1,
    endTime: null,
    remainingMs: method.mode === 'countdown' ? method.focusMs : 0,
    elapsedMs: 0,
    startedAt: null,
  }
}

export function start(state: TimerState, now: number): TimerState {
  if (state.running) return state
  const method = methodById(state.method)
  // Time Boxing: start only while still inside a block (endTime = block end).
  if (method.mode === 'boxing') {
    if (state.endTime === null || state.endTime <= now) return state
    return { ...state, running: true, startedAt: now, remainingMs: null }
  }

  if (method.mode === 'countup' && state.phase === 'focus') {
    return { ...state, running: true, startedAt: now }
  }
  const remaining = state.remainingMs ?? plannedPhaseMs(state.method, state.phase)
  return { ...state, running: true, endTime: now + remaining, remainingMs: null }
}

export function pause(state: TimerState, now: number): TimerState {
  if (!state.running) return state
  // Time Boxing: a running block follows the wall clock — pausing is meaningless.
  if (methodById(state.method).mode === 'boxing') return state

  if (state.endTime !== null) {
    // Countdown: remaining is recomputed from the timestamp, not from ticks.
    return {
      ...state,
      running: false,
      endTime: null,
      remainingMs: Math.max(0, state.endTime - now),
    }
  }
  // Count-up: accumulate then stop.
  const accumulated = state.elapsedMs + (state.startedAt !== null ? now - state.startedAt : 0)
  return { ...state, running: false, startedAt: null, elapsedMs: accumulated }
}

/**
 * Phase finished (automatically via `tick` or manually via `skip`/`finish`).
 * The next phase always stands not running; PRD section 5: the primary
 * button becomes "Start break" instead of starting immediately.
 */
function complete(state: TimerState, now: number): TimerState {
  const method = methodById(state.method)
  if (method.mode === 'boxing') {
    // Block end: stop without changing phase; endTime is kept as the
    // "block finished" marker until the user leaves the prompt.
    return { ...state, running: false, startedAt: null, elapsedMs: 0, remainingMs: null }
  }

  if (state.phase === 'focus') {
    const focusMs =
      method.mode === 'countup'
        ? state.elapsedMs + (state.startedAt !== null ? now - state.startedAt : 0)
        : method.focusMs
    const cycleDone =
      method.mode === 'countdown' && method.longBreakMs !== null && method.cycle > 1
        ? state.cycleIndex % method.cycle === 0
        : false
    const nextPhase: Phase = cycleDone ? 'longBreak' : 'break'
    const breakMs =
      method.mode === 'countup'
        ? (breakForFocus(method, focusMs) ?? 0)
        : plannedPhaseMs(state.method, nextPhase)
    return {
      ...state,
      phase: nextPhase,
      running: false,
      endTime: null,
      startedAt: null,
      elapsedMs: 0,
      remainingMs: breakMs,
    }
  }

  // From break back to focus; the cycle wraps around.
  return {
    ...state,
    phase: 'focus',
    running: false,
    endTime: null,
    startedAt: null,
    elapsedMs: 0,
    remainingMs: plannedPhaseMs(state.method, 'focus'),
    cycleIndex: (state.cycleIndex % method.cycle) + 1,
  }
}

/** Pulse from the Worker: complete a countdown past its `endTime`. */
export function tick(state: TimerState, now: number): TimerState {
  if (state.running && state.endTime !== null && state.endTime <= now) {
    return complete(state, now)
  }
  return state
}

/**
 * Set the Time Boxing block end (epoch ms). Only while not running — during a
 * running session endTime is the session anchor. null = no active block.
 */
export function setBoxingEnd(state: TimerState, endMs: number | null): TimerState {
  if (state.running || state.endTime === endMs) return state
  return { ...state, endTime: endMs, remainingMs: endMs === null ? 0 : null }
}

/** Skip the current phase; for Time Boxing this closes the running block. */
export function skip(state: TimerState, now: number): TimerState {
  return complete(state, now)
}

/** Reset to the start of the method. */
export function reset(state: TimerState): TimerState {
  return createTimer(state.method)
}

/** True when the transition ends a focus session: phase change, or block finished (boxing). */
export function endsFocusSession(prev: TimerState, next: TimerState): boolean {
  if (prev.phase !== 'focus') return false
  if (prev.phase !== next.phase) return true
  return methodById(prev.method).mode === 'boxing' && prev.running && !next.running
}

/** Remaining time (countdown) to display; 0 once the phase has ended. */
export function remaining(state: TimerState, now: number): number {
  if (state.endTime !== null) return Math.max(0, state.endTime - now)
  return state.remainingMs ?? 0
}

/** Elapsed duration (count-up). Always 0 for countdowns. */
export function elapsed(state: TimerState, now: number): number {
  const method = methodById(state.method)
  if (method.mode !== 'countup' || state.phase !== 'focus') return 0
  return state.elapsedMs + (state.running && state.startedAt !== null ? now - state.startedAt : 0)
}

/**
 * On-screen clock value. Count-up shows elapsed; everything else shows remaining.
 */
export function displayMs(state: TimerState, now: number): number {
  const method = methodById(state.method)
  if (method.mode === 'countup' && state.phase === 'focus') return elapsed(state, now)
  return remaining(state, now)
}

/**
 * Format `mm:ss` (two-digit minutes and seconds; minutes over 99 grow) — PRD
 * section 7. Always two-digit: `05:00`, never `5:00`, so the digits keep a
 * fixed width and the clock never shifts.
 */
export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
