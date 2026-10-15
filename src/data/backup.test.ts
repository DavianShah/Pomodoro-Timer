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
  return { id: 't1', title: 'Laporan', createdAt: 1, sessionCount: 0, ...overrides }
}

function makeBlock(overrides: Partial<BlockRow> = {}): BlockRow {
  return { id: 'b1', date: '2026-01-05', startMin: 540, endMin: 600, status: 'planned', ...overrides }
}

function makePreset(overrides: Partial<PresetRow> = {}): PresetRow {
  return { id: 'p1', name: 'Pagi', focusMs: 60_000, breakMs: 60_000, ...overrides }
}

beforeEach(async () => {
  await Promise.all([db.tasks.clear(), db.sessions.clear(), db.blocks.clear(), db.presets.clear()])
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('sessionsToCsv', () => {
  it('header, BOM, urutan waktu, dan task yang dihapus ditandai', () => {
    const csv = sessionsToCsv(
      [
        makeSession({ id: 'b', startedAt: 2_000, taskId: 'hilang' }),
        makeSession({ id: 'a', startedAt: 1_000, taskId: 't1' }),
      ],
      [makeTask({ title: 'Laporan, "penting"' })],
    )

    expect(csv.startsWith('\uFEFFtanggal,mulai,selesai,metode,jenis,')).toBe(true)
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('Pomodoro')
    expect(lines[1]).toContain('"Laporan, ""penting"""')
    expect(lines[2]).toContain('(dihapus)')
  })

  it('membawa nama preset Custom dan status tidak selesai', () => {
    const csv = sessionsToCsv(
      [makeSession({ method: 'custom', methodLabel: 'Pagi', completed: false })],
      [],
    )
    expect(csv).toContain('Custom (Pagi)')
    expect(csv).toContain('tidak')
  })
})

describe('restoreBackup', () => {
  it('bergabung per id dan menghitung ulang sessionCount dari tabel', async () => {
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

  it('baris tidak berbentuk dibuang dan dihitung skipped', async () => {
    const result = await restoreBackup(
      JSON.stringify({
        app: 'ritme',
        tasks: [makeTask(), { id: 3 }],
        sessions: ['rusak'],
        blocks: [],
        presets: [],
      }),
    )
    expect(result).toEqual({
      ok: true,
      counts: { tasks: 1, sessions: 0, blocks: 0, presets: 0, skipped: 2 },
    })
  })

  it('bukan JSON atau bukan backup Ritme → pesan error', async () => {
    expect(await restoreBackup('bukan json')).toEqual({ ok: false, error: 'Berkas bukan JSON' })
    expect(await restoreBackup(JSON.stringify({ app: 'lain' }))).toEqual({
      ok: false,
      error: 'Bukan berkas backup Ritme',
    })
  })
})

describe('exportFileName', () => {
  it('bertanggal lokal dengan ekstensi sesuai jenis', () => {
    const at = new Date(2026, 9, 5, 9, 0).getTime()
    expect(exportFileName('backup', 'json', at)).toBe('ritme-backup-2026-10-05.json')
    expect(exportFileName('sesi', 'csv', at)).toBe('ritme-sesi-2026-10-05.csv')
  })
})
