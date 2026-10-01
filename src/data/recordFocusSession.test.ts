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
  it('membaca task aktif dari penyimpanan lokal', () => {
    seedActiveTask('t1')
    expect(readActiveTaskId()).toBe('t1')
  })

  it('tanpa pengaturan → null', () => {
    expect(readActiveTaskId()).toBeNull()
  })
})

describe('recordFocusSession', () => {
  it('mencatat sesi ke task yang aktif saat sesi berakhir', async () => {
    const task = await addTask('Laporan', 1)
    seedActiveTask(task.id)

    // Flowtime (hitung maju): "Selesai" di menit ke-5.
    const prev = start(createTimer('flowtime'), T0)
    const session = await recordFocusSession(prev, 'skip', T0 + 5 * MINUTE)

    expect(session).not.toBeNull()
    expect(session?.taskId).toBe(task.id)
    expect(await db.sessions.get(session?.id ?? '')).toBeDefined()
    expect((await db.tasks.get(task.id))?.sessionCount).toBe(1)
    // Ringkasan daftar tersimpan juga tersinkron.
    expect(read<unknown>(SETTINGS_KEY, null)).not.toBeNull()
  })

  it('sesi Custom membawa nama preset sebagai methodLabel', async () => {
    const custom = { ...DEFAULT_CUSTOM, focusMs: 40 * MINUTE, presetName: 'Pulih' }
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
    expect(session?.methodLabel).toBe('Pulih')
  })

  it('sesi Custom tanpa preset → tanpa methodLabel', async () => {
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

  it('tanpa task aktif → sesi tetap tercatat tanpa taskId', async () => {
    const prev = start(createTimer('flowtime'), T0)
    const session = await recordFocusSession(prev, 'skip', T0 + 2 * MINUTE)

    expect(session?.taskId).toBeUndefined()
    expect(await db.sessions.count()).toBe(1)
  })

  it('skenario idle tidak menghasilkan sesi', async () => {
    const session = await recordFocusSession(createTimer('pomodoro'), 'skip', T0)
    expect(session).toBeNull()
    expect(await db.sessions.count()).toBe(0)
  })

  it('IndexedDB gagal → tidak melempar, mengembalikan null', async () => {
    const task = await addTask('Laporan', 1)
    seedActiveTask(task.id)
    vi.spyOn(db.sessions, 'put').mockRejectedValueOnce(new Error('IDB mati'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const prev = start(createTimer('flowtime'), T0)
    await expect(recordFocusSession(prev, 'skip', T0 + 5 * MINUTE)).resolves.toBeNull()

    expect(warn).toHaveBeenCalled()
  })
})
