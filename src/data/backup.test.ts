import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, type BlockRow, type PresetRow, type SessionRow, type TaskRow } from '@/db/db'
import { buildBackup, exportFileName, restoreBackup, sessionsToCsv } from './backup'

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

function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return { id: 't1', title: 'Report', createdAt: 1, sessionCount: 0, ...overrides }
}

function makeBlock(overrides: Partial<BlockRow> = {}): BlockRow {
  return { id: 'b1', date: '2026-01-05', startMin: 540, endMin: 600, status: 'planned', ...overrides }
}

function makePreset(overrides: Partial<PresetRow> = {}): PresetRow {
  return { id: 'p1', name: 'Morning', focusMs: 60_000, breakMs: 60_000, ...overrides }
}

beforeEach(async () => {
  await Promise.all([db.tasks.clear(), db.sessions.clear(), db.blocks.clear(), db.presets.clear()])
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('sessionsToCsv', () => {
  it('header, BOM, time order, and deleted tasks are flagged', () => {
    const csv = sessionsToCsv(
      [
        makeSession({ id: 'b', startedAt: 2_000, taskId: 'missing' }),
        makeSession({ id: 'a', startedAt: 1_000, taskId: 't1' }),
      ],
      [makeTask({ title: 'Report, "important"' })],
    )

    expect(csv.startsWith('\uFEFFdate,started,ended,method,kind,')).toBe(true)
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('Pomodoro')
    expect(lines[1]).toContain('"Report, ""important"""')
    expect(lines[2]).toContain('(deleted)')
  })

  it('carries the Custom preset name and the incomplete status', () => {
    const csv = sessionsToCsv(
      [makeSession({ method: 'custom', methodLabel: 'Morning', completed: false })],
      [],
    )
    expect(csv).toContain('Custom (Morning)')
    expect(csv).toContain('no')
  })
})

describe('restoreBackup', () => {
  it('merges per id and recomputes sessionCount from the table', async () => {
    await db.tasks.put(makeTask({ sessionCount: 0 }))
    await db.sessions.put(makeSession({ taskId: 't1' }))
    await db.blocks.put(makeBlock())
    await db.presets.put(makePreset())
    const data = await buildBackup(0)
    expect(data.app).toBe('ritme')

    await Promise.all([
      db.tasks.clear(),
      db.sessions.clear(),
      db.blocks.clear(),
      db.presets.clear(),
    ])
    const result = await restoreBackup(JSON.stringify(data))

    expect(result).toEqual({
      ok: true,
      counts: { tasks: 1, sessions: 1, blocks: 1, presets: 1, skipped: 0 },
    })
    expect(await db.sessions.count()).toBe(1)
    expect((await db.tasks.get('t1'))?.sessionCount).toBe(1)
  })

  it('malformed rows are dropped and counted as skipped', async () => {
    const result = await restoreBackup(
      JSON.stringify({
        app: 'ritme',
        tasks: [makeTask(), { id: 3 }],
        sessions: ['broken'],
        blocks: [],
        presets: [],
      }),
    )
    expect(result).toEqual({
      ok: true,
      counts: { tasks: 1, sessions: 0, blocks: 0, presets: 0, skipped: 2 },
    })
  })

  it('not JSON or not a Ritme backup → error message', async () => {
    expect(await restoreBackup('not json')).toEqual({ ok: false, error: 'File is not JSON' })
    expect(await restoreBackup(JSON.stringify({ app: 'other' }))).toEqual({
      ok: false,
      error: 'Not a Ritme backup file',
    })
  })
})

describe('exportFileName', () => {
  it('is locally dated with an extension matching the kind', () => {
    const at = new Date(2026, 9, 5, 9, 0).getTime()
    expect(exportFileName('backup', 'json', at)).toBe('ritme-backup-2026-10-05.json')
    expect(exportFileName('sessions', 'csv', at)).toBe('ritme-sessions-2026-10-05.csv')
  })
})
