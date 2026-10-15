import type { SessionRow } from '@/db/db'
import { describe, expect, it } from 'vitest'
import { createTimer, pause, setBoxingEnd, skip, start } from './engine'
import { MINUTE } from './methods'
import { buildFocusSession, focusSessionId, localDateKey } from './sessionRecord'

const T0 = new Date(2026, 0, 5, 8, 0).getTime()

function must(session: SessionRow | null): SessionRow {
  if (session === null) throw new Error('the session should have been recorded')
  return session
}

describe('localDateKey', () => {
  it('writes the local date as YYYY-MM-DD', () => {
    expect(localDateKey(new Date(2026, 0, 5, 8, 30).getTime())).toBe('2026-01-05')
    expect(localDateKey(new Date(2026, 11, 31, 23, 59).getTime())).toBe('2026-12-31')
  })
})

describe('buildFocusSession — countdown (Pomodoro)', () => {
  it('auto: fully finished → completed, planned time, id stable across now', () => {
    const prev = start(createTimer('pomodoro'), T0)
    const end = T0 + 25 * MINUTE
    const session = must(
      buildFocusSession({ prev, action: 'auto', now: end + 1_000, taskId: null }),
    )

    expect(session.completed).toBe(true)
    expect(session.actualMs).toBe(25 * MINUTE)
    expect(session.plannedMs).toBe(25 * MINUTE)
    expect(session.endedAt).toBe(end)
    expect(session.startedAt).toBe(T0)
    expect(session.endedAt - session.startedAt).toBe(session.actualMs)
    expect(session.kind).toBe('focus')
    expect(session.date).toBe(localDateKey(end))

    const later = must(buildFocusSession({ prev, action: 'auto', now: end + 90_000, taskId: null }))
    expect(later.id).toBe(session.id)
    expect(session.id).toBe(focusSessionId('pomodoro', T0))
  })

  it('skipped midway → cancelled, duration as-is, id stable', () => {
    const prev = start(createTimer('pomodoro'), T0)
    const now = T0 + 10 * MINUTE
    const session = must(buildFocusSession({ prev, action: 'skip', now, taskId: null }))

    expect(session.completed).toBe(false)
    expect(session.actualMs).toBe(10 * MINUTE)
    expect(session.endedAt).toBe(now)
    expect(session.startedAt).toBe(T0)

    const retry = must(buildFocusSession({ prev, action: 'skip', now: now + 5_000, taskId: null }))
    expect(retry.id).toBe(session.id)
  })

  it('reset midway → cancelled', () => {
    const prev = start(createTimer('pomodoro'), T0)
    const session = must(
      buildFocusSession({ prev, action: 'reset', now: T0 + 5 * MINUTE, taskId: null }),
    )
    expect(session.completed).toBe(false)
    expect(session.actualMs).toBe(5 * MINUTE)
  })

  it('paused time does not count as focus time', () => {
    // Starts at T0, paused at minute 10, skipped 20 minutes later (wall clock).
    const paused = pause(start(createTimer('pomodoro'), T0), T0 + 10 * MINUTE)
    const session = must(
      buildFocusSession({ prev: paused, action: 'skip', now: T0 + 30 * MINUTE, taskId: null }),
    )
    expect(session.actualMs).toBe(10 * MINUTE)
    expect(session.endedAt - session.startedAt).toBe(10 * MINUTE)
  })

  it('idle: skip/reset while not running → no session', () => {
    expect(
      buildFocusSession({ prev: createTimer('pomodoro'), action: 'skip', now: T0, taskId: null }),
    ).toBeNull()
    expect(
      buildFocusSession({ prev: createTimer('pomodoro'), action: 'reset', now: T0, taskId: null }),
    ).toBeNull()
  })
})

describe('buildFocusSession — count-up (Flowtime)', () => {
  it('skip = "Finish" → completed, plannedMs 0', () => {
    const prev = start(createTimer('flowtime'), T0)
    const now = T0 + 3 * MINUTE
    const session = must(buildFocusSession({ prev, action: 'skip', now, taskId: null }))

    expect(session.completed).toBe(true)
    expect(session.actualMs).toBe(3 * MINUTE)
    expect(session.plannedMs).toBe(0)
    expect(session.startedAt).toBe(T0)
    expect(session.endedAt).toBe(now)
  })
})

describe('buildFocusSession — other phases and task', () => {
  it('a phase that is not focus → null (skip/reset during a break records nothing)', () => {
    const onBreak = skip(start(createTimer('pomodoro'), T0), T0 + 25 * MINUTE)
    expect(onBreak.phase).toBe('break')
    expect(
      buildFocusSession({ prev: onBreak, action: 'skip', now: T0 + 30 * MINUTE, taskId: null }),
    ).toBeNull()
    expect(
      buildFocusSession({ prev: onBreak, action: 'reset', now: T0 + 30 * MINUTE, taskId: null }),
    ).toBeNull()
  })

  it('taskId comes along when present, missing without a task', () => {
    const prev = start(createTimer('pomodoro'), T0)
    const withTask = must(
      buildFocusSession({ prev, action: 'auto', now: T0 + 25 * MINUTE, taskId: 't1' }),
    )
    expect(withTask.taskId).toBe('t1')

    const without = must(
      buildFocusSession({ prev, action: 'auto', now: T0 + 25 * MINUTE, taskId: null }),
    )
    expect(without.taskId).toBeUndefined()
    expect('taskId' in without).toBe(false)
  })
})

describe('buildFocusSession — time boxing', () => {
  const blockEnd = T0 + 45 * MINUTE
  const running = start(setBoxingEnd(createTimer('timeboxing'), blockEnd), T0)

  it('the prompt without a running session (startedAt null) is not a session end → null', () => {
    expect(
      buildFocusSession({
        prev: { ...running, running: false, startedAt: null },
        action: 'skip',
        now: blockEnd,
        taskId: null,
      }),
    ).toBeNull()
  })

  it('auto: endedAt = block end (not now), completed, plannedMs from the block', () => {
    const session = must(
      buildFocusSession({
        prev: running,
        action: 'auto',
        now: blockEnd + 120_000,
        taskId: null,
        boxing: { plannedMs: 45 * MINUTE },
      }),
    )

    expect(session.completed).toBe(true)
    expect(session.endedAt).toBe(blockEnd)
    expect(session.actualMs).toBe(45 * MINUTE)
    expect(session.plannedMs).toBe(45 * MINUTE)
    expect(session.startedAt).toBe(T0)
    expect(session.id).toBe(focusSessionId('timeboxing', T0))
  })

  it('without block data: plannedMs = actual duration; skip (Finish) = completed, reset = cancelled', () => {
    const finished = must(
      buildFocusSession({
        prev: running,
        action: 'skip',
        now: T0 + 10 * MINUTE,
        taskId: null,
      }),
    )

    expect(finished.completed).toBe(true)
    expect(finished.endedAt).toBe(T0 + 10 * MINUTE)
    expect(finished.plannedMs).toBe(10 * MINUTE)

    const cancelled = must(
      buildFocusSession({
        prev: running,
        action: 'reset',
        now: T0 + 12 * MINUTE,
        taskId: null,
      }),
    )
    expect(cancelled.completed).toBe(false)
    expect(cancelled.plannedMs).toBe(12 * MINUTE)
  })
})
