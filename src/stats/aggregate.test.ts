import { describe, expect, it } from 'vitest'
import type { SessionRow, TaskRow } from '@/db/db'
import {
  buildStats,
  computeStreaks,
  dailySeries,
  dayOffsetKey,
  formatFocusMs,
  formatFocusShort,
  groupByMethod,
  groupByTask,
  incompleteCountIn,
  lastDays,
  totalsIn,
} from './aggregate'

const MIN = 60_000
const TODAY = '2026-10-01'
const YESTERDAY = '2026-09-30'
const WEEK_START = '2026-09-25'

let created = 0

function session(input: Partial<SessionRow> & { date: string }): SessionRow {
  created += 1
  return {
    id: `s${created}`,
    method: 'pomodoro',
    kind: 'focus',
    startedAt: created * 1000,
    endedAt: created * 1000 + 25 * MIN,
    plannedMs: 25 * MIN,
    actualMs: 25 * MIN,
    completed: true,
    ...input,
  }
}

function task(id: string, title: string): TaskRow {
  return { id, title, createdAt: 0, sessionCount: 0 }
}

describe('dayOffsetKey dan lastDays', () => {
  it('melewati batas bulan dan tahun', () => {
    expect(dayOffsetKey('2025-12-31', 1)).toBe('2026-01-01')
    expect(dayOffsetKey('2026-01-01', -1)).toBe('2025-12-31')
    expect(dayOffsetKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(dayOffsetKey('2024-03-01', -1)).toBe('2024-02-29')
  })

  it('membentuk tujuh hari yang berakhir di hari ini', () => {
    expect(lastDays(TODAY, 7)).toEqual([
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
    ])
  })
})

describe('formatFocusMs', () => {
  it('menulis datar tanpa desimal', () => {
    expect(formatFocusMs(0)).toBe('0 menit')
    expect(formatFocusMs(59_000)).toBe('0 menit')
    expect(formatFocusMs(45 * MIN)).toBe('45 menit')
    expect(formatFocusMs(60 * MIN)).toBe('1 jam')
    expect(formatFocusMs(65 * MIN)).toBe('1 jam 5 menit')
    expect(formatFocusMs(120 * MIN)).toBe('2 jam')
  })
})

describe('formatFocusShort', () => {
  it('pendek untuk label sumbu', () => {
    expect(formatFocusShort(0)).toBe('0m')
    expect(formatFocusShort(45 * MIN)).toBe('45m')
    expect(formatFocusShort(60 * MIN)).toBe('1j')
    expect(formatFocusShort(110 * MIN)).toBe('1j50m')
  })
})

describe('totalsIn dan incompleteCountIn', () => {
  const sessions = [
    session({ id: 'hari-ini', date: TODAY, actualMs: 25 * MIN }),
    session({ id: 'tidak-selesai', date: TODAY, completed: false, actualMs: 20 * MIN }),
    session({ id: 'kemarin', date: YESTERDAY, actualMs: 10 * MIN }),
    session({ id: 'masa-depan', date: '2026-10-10', actualMs: 25 * MIN }),
  ]

  it('hanya completed dan hanya dalam rentang tanggal', () => {
    expect(totalsIn(sessions, WEEK_START, TODAY)).toEqual({
      focusMs: 35 * MIN,
      completedCount: 2,
    })
    expect(totalsIn(sessions, TODAY, TODAY)).toEqual({
      focusMs: 25 * MIN,
      completedCount: 1,
    })
  })

  it('tidak selesai dihitung terpisah, tidak masuk total', () => {
    expect(incompleteCountIn(sessions, WEEK_START, TODAY)).toBe(1)
    expect(incompleteCountIn(sessions, YESTERDAY, YESTERDAY)).toBe(0)
  })
})

describe('dailySeries', () => {
  it('tujuh entri terisi nol dan sesi menempel di tanggalnya', () => {
    const days = lastDays(TODAY, 7)
    const series = dailySeries(
      [
        session({ id: 'a', date: TODAY, actualMs: 25 * MIN }),
        session({ id: 'b', date: TODAY, completed: false, actualMs: 20 * MIN }),
        session({ id: 'c', date: YESTERDAY, actualMs: 10 * MIN }),
        session({ id: 'd', date: '2026-09-01', actualMs: 25 * MIN }),
      ],
      days,
    )

    expect(series).toHaveLength(7)
    expect(series[0]).toEqual({ date: '2026-09-25', focusMs: 0, completedCount: 0 })
    expect(series[5]).toEqual({ date: YESTERDAY, focusMs: 10 * MIN, completedCount: 1 })
    expect(series[6]).toEqual({ date: TODAY, focusMs: 25 * MIN, completedCount: 1 })
  })
})

describe('groupByMethod', () => {
  it('urut fokus turun dengan nama metode', () => {
    const groups = groupByMethod(
      [
        session({ id: 'p1', date: TODAY, actualMs: 25 * MIN }),
        session({ id: 'p2', date: YESTERDAY, actualMs: 25 * MIN }),
        session({ id: 'f1', date: TODAY, method: 'flowtime', actualMs: 10 * MIN }),
        session({ id: 'x1', date: TODAY, completed: false, actualMs: 5 * MIN }),
      ],
      WEEK_START,
      TODAY,
    )

    expect(groups).toHaveLength(2)
    expect(groups[0]).toEqual({
      key: 'pomodoro',
      label: 'Pomodoro',
      focusMs: 50 * MIN,
      completedCount: 2,
    })
    expect(groups[1]).toEqual({
      key: 'flowtime',
      label: 'Flowtime',
      focusMs: 10 * MIN,
      completedCount: 1,
    })
  })

  it('fokus sama: jumlah sesi menentukan urutan', () => {
    const groups = groupByMethod(
      [
        session({ id: 'p1', date: TODAY, actualMs: 30 * MIN }),
        session({ id: 'u1', date: TODAY, method: 'ultradian', actualMs: 15 * MIN }),
        session({ id: 'u2', date: YESTERDAY, method: 'ultradian', actualMs: 15 * MIN }),
      ],
      WEEK_START,
      TODAY,
    )

    expect(groups.map((group) => group.key)).toEqual(['ultradian', 'pomodoro'])
  })
})

describe('groupByMethod metode Custom', () => {
  it('sesi Custom dikelompokkan di bawah "Custom" dengan sublabel nama preset', () => {
    const sessions = [
      session({ date: TODAY, method: 'custom', methodLabel: 'Pulih' }),
      session({ date: TODAY, method: 'custom', methodLabel: 'Pulih' }),
      session({ date: TODAY, method: 'pomodoro' }),
    ]

    const groups = groupByMethod(sessions, TODAY, TODAY)
    const custom = groups.find((group) => group.key === 'custom')
    expect(custom?.label).toBe('Custom')
    expect(custom?.sub).toBe('Pulih')
    expect(custom?.completedCount).toBe(2)
    expect(groups.find((group) => group.key === 'pomodoro')?.sub).toBeUndefined()
  })

  it('beberapa preset digabung; sesi tanpa preset tidak menambah sublabel', () => {
    const sessions = [
      session({ date: TODAY, method: 'custom', methodLabel: 'Pagi' }),
      session({ date: TODAY, method: 'custom', methodLabel: 'Malam' }),
      session({ date: TODAY, method: 'custom' }),
    ]

    const groups = groupByMethod(sessions, TODAY, TODAY)
    expect(groups[0]?.label).toBe('Custom')
    expect(groups[0]?.sub).toBe('Pagi, Malam')
    expect(groups[0]?.completedCount).toBe(3)
  })

  it('sesi Custom lama tanpa nama metode tetap terbaca sebagai Custom', () => {
    const groups = groupByMethod([session({ date: TODAY, method: 'custom' })], TODAY, TODAY)
    expect(groups[0]?.label).toBe('Custom')
    expect(groups[0]?.sub).toBeUndefined()
  })
})

describe('groupByTask', () => {
  it('judul dari daftar task, task hilang jadi (dihapus), tanpa task dilewati', () => {
    const groups = groupByTask(
      [
        session({ id: 'p1', date: TODAY, taskId: 't1', actualMs: 25 * MIN }),
        session({ id: 'p2', date: TODAY, taskId: 't1', actualMs: 25 * MIN }),
        session({ id: 'p3', date: TODAY, taskId: 't404', actualMs: 10 * MIN }),
        session({ id: 'p4', date: TODAY, actualMs: 25 * MIN }),
        session({ id: 'p5', date: TODAY, taskId: 't1', completed: false, actualMs: 3 * MIN }),
      ],
      [task('t1', 'Tulis laporan')],
      WEEK_START,
      TODAY,
    )

    expect(groups).toHaveLength(2)
    expect(groups[0]).toEqual({
      key: 't1',
      label: 'Tulis laporan',
      focusMs: 50 * MIN,
      completedCount: 2,
    })
    expect(groups[1]).toEqual({
      key: 't404',
      label: '(dihapus)',
      focusMs: 10 * MIN,
      completedCount: 1,
    })
  })
})

describe('computeStreaks', () => {
  it('tanpa data = nol', () => {
    expect(computeStreaks([], TODAY)).toEqual({ current: 0, longest: 0 })
  })

  it('hanya hari ini = satu hari', () => {
    expect(computeStreaks([session({ date: TODAY })], TODAY)).toEqual({
      current: 1,
      longest: 1,
    })
  })

  it('kemarin ada, hari ini belum: streak belum putus', () => {
    expect(computeStreaks([session({ date: YESTERDAY })], TODAY)).toEqual({
      current: 1,
      longest: 1,
    })
  })

  it('hari ini dan kemarin berurutan = dua hari', () => {
    const rows = [session({ date: TODAY }), session({ date: YESTERDAY })]
    expect(computeStreaks(rows, TODAY)).toEqual({ current: 2, longest: 2 })
  })

  it('selang satu hari memutus; run lama tetap terpanjang', () => {
    const rows = [
      session({ date: '2026-09-27' }),
      session({ date: '2026-09-28' }),
      session({ date: '2026-09-30' }),
      session({ date: TODAY }),
    ]
    expect(computeStreaks(rows, TODAY)).toEqual({ current: 2, longest: 2 })
  })

  it('banyak sesi dalam satu hari tetap dihitung satu hari', () => {
    const rows = [
      session({ id: 'a', date: TODAY }),
      session({ id: 'b', date: TODAY }),
      session({ date: YESTERDAY }),
    ]
    expect(computeStreaks(rows, TODAY)).toEqual({ current: 2, longest: 2 })
  })

  it('hanya sesi tidak selesai = nol', () => {
    const rows = [session({ date: TODAY, completed: false })]
    expect(computeStreaks(rows, TODAY)).toEqual({ current: 0, longest: 0 })
  })

  it('lintas batas bulan dan tahun', () => {
    const rows = [
      session({ date: '2025-12-30' }),
      session({ date: '2025-12-31' }),
      session({ date: '2026-01-01' }),
    ]
    expect(computeStreaks(rows, '2026-01-01')).toEqual({ current: 3, longest: 3 })
  })

  it('run terpanjang boleh bukan di ujung riwayat', () => {
    const rows = [
      session({ id: 'a', date: '2026-09-23' }),
      session({ id: 'b', date: '2026-09-24' }),
      session({ id: 'c', date: '2026-09-25' }),
      session({ id: 'd', date: '2026-09-30' }),
      session({ id: 'e', date: TODAY }),
    ]
    expect(computeStreaks(rows, TODAY)).toEqual({ current: 2, longest: 3 })
  })

  it('data lama tanpa kemarin: streak sekarang nol, terpanjang tersimpan', () => {
    const rows = [
      session({ id: 'a', date: '2026-09-21' }),
      session({ id: 'b', date: '2026-09-22' }),
      session({ id: 'c', date: '2026-09-23' }),
    ]
    expect(computeStreaks(rows, TODAY)).toEqual({ current: 0, longest: 3 })
  })
})

describe('buildStats', () => {
  it('menyusun seluruh tampilan dalam satu panggilan', () => {
    const view = buildStats({
      sessions: [
        session({ id: 'p1', date: TODAY, taskId: 't1', actualMs: 25 * MIN }),
        session({ id: 'p2', date: TODAY, taskId: 't1', actualMs: 25 * MIN }),
        session({ id: 'f1', date: TODAY, method: 'flowtime', actualMs: 10 * MIN }),
        session({ id: 'x1', date: TODAY, completed: false, actualMs: 4 * MIN }),
        session({ id: 'y1', date: YESTERDAY, actualMs: 25 * MIN }),
      ],
      tasks: [task('t1', 'Tulis laporan')],
      todayKey: TODAY,
    })

    expect(view.hasAnySession).toBe(true)
    expect(view.today).toEqual({ focusMs: 60 * MIN, completedCount: 3 })
    expect(view.week).toEqual({ focusMs: 85 * MIN, completedCount: 4 })
    expect(view.incompleteCount).toBe(1)
    expect(view.streak).toEqual({ current: 2, longest: 2 })
    expect(view.days).toHaveLength(7)
    expect(view.days[6]).toEqual({ date: TODAY, focusMs: 60 * MIN, completedCount: 3 })
    expect(view.days[5]).toEqual({ date: YESTERDAY, focusMs: 25 * MIN, completedCount: 1 })
    expect(view.methods[0]).toMatchObject({
      label: 'Pomodoro',
      focusMs: 75 * MIN,
      completedCount: 3,
    })
    expect(view.methods[1]).toMatchObject({
      label: 'Flowtime',
      focusMs: 10 * MIN,
      completedCount: 1,
    })
    expect(view.tasks[0]).toMatchObject({
      label: 'Tulis laporan',
      focusMs: 50 * MIN,
      completedCount: 2,
    })
  })

  it('tanpa sesi: penanda kosong dan angka nol', () => {
    const view = buildStats({ sessions: [], tasks: [], todayKey: TODAY })

    expect(view.hasAnySession).toBe(false)
    expect(view.today).toEqual({ focusMs: 0, completedCount: 0 })
    expect(view.week).toEqual({ focusMs: 0, completedCount: 0 })
    expect(view.incompleteCount).toBe(0)
    expect(view.streak).toEqual({ current: 0, longest: 0 })
    expect(view.days).toHaveLength(7)
    expect(view.days.every((day) => day.focusMs === 0)).toBe(true)
    expect(view.methods).toEqual([])
    expect(view.tasks).toEqual([])
  })

  it('data di luar jendela 7 hari tidak masuk mingguan', () => {
    const view = buildStats({
      sessions: [session({ date: '2026-09-10', actualMs: 25 * MIN })],
      tasks: [],
      todayKey: TODAY,
    })

    expect(view.hasAnySession).toBe(true)
    expect(view.week).toEqual({ focusMs: 0, completedCount: 0 })
    expect(view.streak).toEqual({ current: 0, longest: 1 })
  })
})
