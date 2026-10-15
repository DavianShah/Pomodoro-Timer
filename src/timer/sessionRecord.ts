/**
 * Focus-session recording rules (PRD section 9). Pure: input = timer state
 * before the transition, how the session ended, the clock, and the active
 * task; output = a Session row or null. No I/O — Dexie lives in `src/data`.
 *
 * Invariant: `actualMs = endedAt − startedAt` (effective focus time, pauses
 * excluded). Session ids derive from the effective start key so the same
 * transition (e.g. a duplicate restore) yields the same id.
 */
import type { SessionRow } from '@/db/db'
import { elapsed, plannedPhaseMs, remaining, type TimerState } from './engine'
import { methodById } from './methods'

/** How a focus session ended: automatic tick, skip/Finish button, or reset. */
export type FocusEndAction = 'auto' | 'skip' | 'reset'

/** Local date `YYYY-MM-DD` (device timezone) — daily grouping without recomputation. */
export function localDateKey(at: number): string {
  const date = new Date(at)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Stable id from the session start key — the basis for idempotency. */
export function focusSessionId(method: string, startedAt: number): string {
  return `${method}-${startedAt}`
}

export interface FocusEndInput {
  /** Focus-session state before the transition. */
  prev: TimerState
  action: FocusEndAction
  now: number
  /** Task active when the session ended; null = no task. */
  taskId: string | null
  /** Time Boxing: block length (ms) for plannedMs; absent = other methods. */
  boxing?: { plannedMs: number } | null
  /** Custom preset name used by this session (stats sublabel); absent = not Custom. */
  methodLabel?: string | null
}

export function buildFocusSession({
  prev,
  action,
  now,
  taskId,
  boxing,
  methodLabel,
}: FocusEndInput): SessionRow | null {
  if (prev.phase !== 'focus') return null
  const method = methodById(prev.method)

  if (method.mode === 'boxing') {
    // Dedupe: a prompt without a running session (startedAt null) is not a session end.
    if (prev.startedAt === null) return null
    const startedAt = prev.startedAt
    const endedAt = action === 'auto' && prev.endTime !== null ? prev.endTime : now
    const actualMs = endedAt - startedAt
    if (!(actualMs > 0)) return null
    return {
      id: focusSessionId(prev.method, startedAt),
      method: prev.method,
      kind: 'focus',
      startedAt,
      endedAt,
      plannedMs: boxing?.plannedMs ?? actualMs,
      actualMs,
      ...(taskId !== null ? { taskId } : {}),
      ...(methodLabel ? { methodLabel } : {}),
      // A cancelled block (reset) is not finished; other ends = completed session.
      completed: action !== 'reset',
      date: localDateKey(endedAt),
    }
  }

  // Actual focus time: count-up = accumulation; countdown = planned −
  // remaining (pauses do not count because pausing freezes the remaining time).
  const actualMs =
    method.mode === 'countup'
      ? elapsed(prev, now)
      : plannedPhaseMs(prev.method, 'focus') - remaining(prev, now)
  // A zero-duration session (skip/reset while idle) is not a session — do not record.
  if (!(actualMs > 0)) return null

  // Automatic end = endTime (exactly at the planned moment); manual = action moment.
  const endedAt = action === 'auto' && prev.endTime !== null ? prev.endTime : now
  const startedAt = endedAt - actualMs

  return {
    id: focusSessionId(prev.method, startedAt),
    method: prev.method,
    kind: 'focus',
    startedAt,
    endedAt,
    plannedMs: plannedPhaseMs(prev.method, 'focus'),
    actualMs,
    ...(taskId !== null ? { taskId } : {}),
    ...(methodLabel ? { methodLabel } : {}),
    // Automatic completion = completed. Count-up ended with "Finish" (Flowtime)
    // = completed. Skip/reset mid-countdown = cancelled.
    completed: action === 'auto' || (action === 'skip' && method.mode === 'countup'),
    date: localDateKey(endedAt),
  }
}
