import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionRow } from '@/db/db'
import { db } from '@/db/db'
import { addTask } from './tasks'
import { loadSessionsThrough, putFocusSession } from './sessions'

function makeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 'pomodoro-1',
    method: 'pomodoro',
    kind: 'focus',
    startedAt: 1_000,
    endedAt: 61_000,
    plannedMs: 60_000,
    actualMs: 60_000,
    completed: true,
    date: '2026-01-05',
    ...overrides,
  }
}

beforeEach(async () => {
  await db.tasks.clear()
  await db.sessions.clear()
})

describe('putFocusSession', () => {
  it('stores a single session row', async () => {
    const session = makeSession()
    await putFocusSession(session)

    expect(await db.sessions.count()).toBe(1)
    expect(await db.sessions.get(session.id)).toEqual(session)
  })

  it('idempotent: the same id twice → one row, the count stays correct', async () => {
    const task = await addTask('Report', 1)
    const session = makeSession({ taskId: task.id })

    await putFocusSession(session)
    await putFocusSession(session)

    expect(await db.sessions.count()).toBe(1)
    expect((await db.tasks.get(task.id))?.sessionCount).toBe(1)
  })

  it('sessionCount only counts completed sessions', async () => {
    const task = await addTask('Report', 1)

    await putFocusSession(makeSession({ id: 'a', taskId: task.id, completed: true }))
    await putFocusSession(makeSession({ id: 'b', taskId: task.id, completed: true }))
    // Cancelled midway: not counted, even though written last.
    await putFocusSession(makeSession({ id: 'c', taskId: task.id, completed: false }))

    expect(await db.sessions.count()).toBe(3)
    expect((await db.tasks.get(task.id))?.sessionCount).toBe(2)
  })

  it('without a taskId: the session is stored, other tasks are untouched', async () => {
    const other = await addTask('Other', 1)
    await putFocusSession(makeSession({ id: 'x' }))

    expect(await db.sessions.count()).toBe(1)
    expect((await db.tasks.get(other.id))?.sessionCount).toBe(0)
    expect(await db.tasks.get(other.id)).toBeDefined()
  })
})

describe('loadSessionsThrough', () => {
  it('reads sessions from the date index up to that day key only', async () => {
    await putFocusSession(makeSession({ id: 'old', date: '2026-01-01' }))
    await putFocusSession(makeSession({ id: 'boundary', date: '2026-01-05' }))
    await putFocusSession(makeSession({ id: 'tomorrow', date: '2026-01-06' }))

    const rows = await loadSessionsThrough('2026-01-05')
    const ids = rows.map((row) => row.id).sort()

    expect(ids).toEqual(['boundary', 'old'])
  })
})
