import { describe, expect, it } from 'vitest'
import type { SessionRow, TaskRow } from '@/db/db'
import {
  buildStats,
  completedCountForMethod,
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

describe('dayOffsetKey and lastDays', () => {
  it('crosses month and year boundaries', () => {
    expect(dayOffsetKey('2025-12-31', 1)).toBe('2026-01-01')
    expect(dayOffsetKey('2026-01-01', -1)).toBe('2025-12-31')
    expect(dayOffsetKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(dayOffsetKey('2024-03-01', -1)).toBe('2024-02-29')
  })

  it('builds seven days ending today', () => {
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
  it('writes plain text without decimals', () => {
    expect(formatFocusMs(0)).toBe('0 min')
    expect(formatFocusMs(59_000)).toBe('0 min')
    expect(formatFocusMs(45 * MIN)).toBe('45 min')
    expect(formatFocusMs(60 * MIN)).toBe('1 hr')
    expect(formatFocusMs(65 * MIN)).toBe('1 hr 5 min')
    expect(formatFocusMs(120 * MIN)).toBe('2 hr')
  })
})

describe('formatFocusShort', () => {
  it('short for axis labels', () => {
    expect(formatFocusShort(0)).toBe('0m')
    expect(formatFocusShort(45 * MIN)).toBe('45m')
    expect(formatFocusShort(60 * MIN)).toBe('1h')
    expect(formatFocusShort(110 * MIN)).toBe('1h50m')
  })
})

describe('totalsIn and incompleteCountIn', () => {
  const sessions = [
    session({ id: 'today', date: TODAY, actualMs: 25 * MIN }),
    session({ id: 'incomplete', date: TODAY, completed: false, actualMs: 20 * MIN }),
    session({ id: 'yesterday', date: YESTERDAY, actualMs: 10 * MIN }),
    session({ id: 'future', date: '2026-10-10', actualMs: 25 * MIN }),
  ]

  it('only completed and only within the date range', () => {
    expect(totalsIn(sessions, WEEK_START, TODAY)).toEqual({
      focusMs: 35 * MIN,
      completedCount: 2,
    })
    expect(totalsIn(sessions, TODAY, TODAY)).toEqual({
      focusMs: 25 * MIN,
      completedCount: 1,
    })
  })

  it('incomplete sessions are counted separately, never in the totals', () => {
    expect(incompleteCountIn(sessions, WEEK_START, TODAY)).toBe(1)
    expect(incompleteCountIn(sessions, YESTERDAY, YESTERDAY)).toBe(0)
  })
})

describe('dailySeries', () => {
  it('seven zero-filled entries with sessions attached to their date', () => {
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
  it('sorted by focus descending with method names', () => {
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

  it('equal focus: session count decides the order', () => {
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

describe('groupByMethod with the Custom method', () => {
  it('Custom sessions group under "Custom" with the preset name as sub-label', () => {
    const sessions = [
      session({ date: TODAY, method: 'custom', methodLabel: 'Recovery' }),
      session({ date: TODAY, method: 'custom', methodLabel: 'Recovery' }),
      session({ date: TODAY, method: 'pomodoro' }),
    ]

    const groups = groupByMethod(sessions, TODAY, TODAY)
    const custom = groups.find((group) => group.key === 'custom')
    expect(custom?.label).toBe('Custom')
    expect(custom?.sub).toBe('Recovery')
    expect(custom?.completedCount).toBe(2)
    expect(groups.find((group) => group.key === 'pomodoro')?.sub).toBeUndefined()
  })

  it('several presets are joined; a session without a preset adds no sub-label', () => {
    const sessions = [
      session({ date: TODAY, method: 'custom', methodLabel: 'Morning' }),
      session({ date: TODAY, method: 'custom', methodLabel: 'Evening' }),
      session({ date: TODAY, method: 'custom' }),
    ]

    const groups = groupByMethod(sessions, TODAY, TODAY)
    expect(groups[0]?.label).toBe('Custom')
    expect(groups[0]?.sub).toBe('Morning, Evening')
    expect(groups[0]?.completedCount).toBe(3)
  })

  it('old Custom sessions without a method name still read as Custom', () => {
    const groups = groupByMethod([session({ date: TODAY, method: 'custom' })], TODAY, TODAY)
    expect(groups[0]?.label).toBe('Custom')
    expect(groups[0]?.sub).toBeUndefined()
  })
})

describe('groupByTask', () => {
  it('titles from the task list, a missing task becomes (deleted), no task is skipped', () => {
    const groups = groupByTask(
      [
        session({ id: 'p1', date: TODAY, taskId: 't1', actualMs: 25 * MIN }),
        session({ id: 'p2', date: TODAY, taskId: 't1', actualMs: 25 * MIN }),
        session({ id: 'p3', date: TODAY, taskId: 't404', actualMs: 10 * MIN }),
        session({ id: 'p4', date: TODAY, actualMs: 25 * MIN }),
        session({ id: 'p5', date: TODAY, taskId: 't1', completed: false, actualMs: 3 * MIN }),
      ],
      [task('t1', 'Write report')],
      WEEK_START,
      TODAY,
    )

    expect(groups).toHaveLength(2)
    expect(groups[0]).toEqual({
      key: 't1',
      label: 'Write report',
      focusMs: 50 * MIN,
      completedCount: 2,
    })
    expect(groups[1]).toEqual({
      key: 't404',
      label: '(deleted)',
      focusMs: 10 * MIN,
      completedCount: 1,
    })
  })
})

describe('computeStreaks', () => {
  it('no data = zero', () => {
    expect(computeStreaks([], TODAY)).toEqual({ current: 0, longest: 0 })
  })

  it('today only = one day', () => {
    expect(computeStreaks([session({ date: TODAY })], TODAY)).toEqual({
      current: 1,
      longest: 1,
    })
  })

  it('yesterday has one, today not yet: the streak is not broken', () => {
    expect(computeStreaks([session({ date: YESTERDAY })], TODAY)).toEqual({
      current: 1,
      longest: 1,
    })
  })

  it('today and yesterday consecutive = two days', () => {
    const rows = [session({ date: TODAY }), session({ date: YESTERDAY })]
    expect(computeStreaks(rows, TODAY)).toEqual({ current: 2, longest: 2 })
  })

  it('a one-day gap breaks it; the old run stays the longest', () => {
    const rows = [
      session({ date: '2026-09-27' }),
      session({ date: '2026-09-28' }),
      session({ date: '2026-09-30' }),
      session({ date: TODAY }),
    ]
    expect(computeStreaks(rows, TODAY)).toEqual({ current: 2, longest: 2 })
  })

  it('many sessions in one day still count as one day', () => {
    const rows = [
      session({ id: 'a', date: TODAY }),
      session({ id: 'b', date: TODAY }),
      session({ date: YESTERDAY }),
    ]
    expect(computeStreaks(rows, TODAY)).toEqual({ current: 2, longest: 2 })
  })

  it('only incomplete sessions = zero', () => {
    const rows = [session({ date: TODAY, completed: false })]
    expect(computeStreaks(rows, TODAY)).toEqual({ current: 0, longest: 0 })
  })

  it('across month and year boundaries', () => {
    const rows = [
      session({ date: '2025-12-30' }),
      session({ date: '2025-12-31' }),
      session({ date: '2026-01-01' }),
    ]
    expect(computeStreaks(rows, '2026-01-01')).toEqual({ current: 3, longest: 3 })
  })

  it('the longest run may not be at the end of the history', () => {
    const rows = [
      session({ id: 'a', date: '2026-09-23' }),
      session({ id: 'b', date: '2026-09-24' }),
      session({ id: 'c', date: '2026-09-25' }),
      session({ id: 'd', date: '2026-09-30' }),
      session({ id: 'e', date: TODAY }),
    ]
    expect(computeStreaks(rows, TODAY)).toEqual({ current: 2, longest: 3 })
  })

  it('old data without yesterday: current streak zero, longest kept', () => {
    const rows = [
      session({ id: 'a', date: '2026-09-21' }),
      session({ id: 'b', date: '2026-09-22' }),
      session({ id: 'c', date: '2026-09-23' }),
    ]
    expect(computeStreaks(rows, TODAY)).toEqual({ current: 0, longest: 3 })
  })
})

describe('buildStats', () => {
  it('assembles the whole view in one call', () => {
    const view = buildStats({
      sessions: [
        session({ id: 'p1', date: TODAY, taskId: 't1', actualMs: 25 * MIN }),
        session({ id: 'p2', date: TODAY, taskId: 't1', actualMs: 25 * MIN }),
        session({ id: 'f1', date: TODAY, method: 'flowtime', actualMs: 10 * MIN }),
        session({ id: 'x1', date: TODAY, completed: false, actualMs: 4 * MIN }),
        session({ id: 'y1', date: YESTERDAY, actualMs: 25 * MIN }),
      ],
      tasks: [task('t1', 'Write report')],
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
      label: 'Write report',
      focusMs: 50 * MIN,
      completedCount: 2,
    })
  })

  it('no sessions: the empty marker and zeroed numbers', () => {
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

  it('data outside the 7-day window does not enter the weekly totals', () => {
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

describe('completedCountForMethod', () => {
  it('only the requested method and date, and only completed ones', () => {
    const sessions = [
      session({ date: TODAY, method: 'ultradian' }),
      session({ date: TODAY, method: 'ultradian' }),
      session({ date: TODAY, method: 'ultradian', completed: false }),
      session({ date: TODAY, method: 'pomodoro' }),
      session({ date: YESTERDAY, method: 'ultradian' }),
    ]

    expect(completedCountForMethod(sessions, 'ultradian', TODAY)).toBe(2)
    expect(completedCountForMethod(sessions, 'pomodoro', TODAY)).toBe(1)
    expect(completedCountForMethod(sessions, 'flowtime', TODAY)).toBe(0)
  })
})
