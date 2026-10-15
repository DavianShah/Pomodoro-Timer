import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_KEY, STORAGE_VERSION } from '@/app/constants'
import { db } from '@/db/db'
import { read, write } from '@/lib/storage'
import { createTimer, start } from '@/timer/engine'
import { configureMethods, DEFAULT_CUSTOM, MINUTE } from '@/timer/methods'
import { recordFocusSession, readActiveTaskId } from './recordFocusSession'
import { addTask } from './tasks'

const T0 = new Date(2026, 0, 5, 8, 0).getTime()

beforeEach(async () => {
  localStorage.clear()
  await db.tasks.clear()
  await db.sessions.clear()
})

afterEach(() => {
  configureMethods({ durations: {}, custom: null })
})

function seedActiveTask(taskId: string): void {
  write(SETTINGS_KEY, STORAGE_VERSION, {
    theme: 'system',
    lastMethod: 'pomodoro',
    activeTaskId: taskId,
  })
}

describe('readActiveTaskId', () => {
  it('reads the active task from local storage', () => {
    seedActiveTask('t1')
    expect(readActiveTaskId()).toBe('t1')
  })

  it('without settings → null', () => {
    expect(readActiveTaskId()).toBeNull()
  })
})

describe('recordFocusSession', () => {
  it('records the session against the task that was active when it ended', async () => {
    const task = await addTask('Report', 1)
    seedActiveTask(task.id)

    // Flowtime (count-up): "Finish" at minute 5.
    const prev = start(createTimer('flowtime'), T0)
    const session = await recordFocusSession(prev, 'skip', T0 + 5 * MINUTE)

    expect(session).not.toBeNull()
    expect(session?.taskId).toBe(task.id)
    expect(await db.sessions.get(session?.id ?? '')).toBeDefined()
    expect((await db.tasks.get(task.id))?.sessionCount).toBe(1)
    // The stored settings summary is in sync too.
    expect(read<unknown>(SETTINGS_KEY, null)).not.toBeNull()
  })

  it('a Custom session carries the preset name as methodLabel', async () => {
    const custom = { ...DEFAULT_CUSTOM, focusMs: 40 * MINUTE, presetName: 'Recovery' }
    write(SETTINGS_KEY, STORAGE_VERSION, {
      theme: 'system',
      lastMethod: 'custom',
      activeTaskId: null,
      custom,
    })
    configureMethods({ durations: {}, custom: { ...custom } })

    const prev = start(createTimer('custom'), T0)
    const session = await recordFocusSession(prev, 'skip', T0 + 5 * MINUTE)

    expect(session?.method).toBe('custom')
    expect(session?.methodLabel).toBe('Recovery')
  })

  it('a Custom session without a preset → no methodLabel', async () => {
    const custom = { ...DEFAULT_CUSTOM, focusMs: 40 * MINUTE, presetName: null }
    write(SETTINGS_KEY, STORAGE_VERSION, {
      theme: 'system',
      lastMethod: 'custom',
      activeTaskId: null,
      custom,
    })
    configureMethods({ durations: {}, custom: { ...custom } })

    const prev = start(createTimer('custom'), T0)
    const session = await recordFocusSession(prev, 'skip', T0 + 5 * MINUTE)

    expect(session?.method).toBe('custom')
    expect(session?.methodLabel).toBeUndefined()
  })

  it('no active task → the session is still recorded without a taskId', async () => {
    const prev = start(createTimer('flowtime'), T0)
    const session = await recordFocusSession(prev, 'skip', T0 + 2 * MINUTE)

    expect(session?.taskId).toBeUndefined()
    expect(await db.sessions.count()).toBe(1)
  })

  it('an idle scenario produces no session', async () => {
    const session = await recordFocusSession(createTimer('pomodoro'), 'skip', T0)
    expect(session).toBeNull()
    expect(await db.sessions.count()).toBe(0)
  })

  it('IndexedDB fails → does not throw, returns null', async () => {
    const task = await addTask('Report', 1)
    seedActiveTask(task.id)
    vi.spyOn(db.sessions, 'put').mockRejectedValueOnce(new Error('IDB down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const prev = start(createTimer('flowtime'), T0)
    await expect(recordFocusSession(prev, 'skip', T0 + 5 * MINUTE)).resolves.toBeNull()

    expect(warn).toHaveBeenCalled()
  })
})
