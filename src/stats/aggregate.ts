/**
 * Stats aggregation (F10) and streaks (F11) — pure functions.
 *
 * Input: an array of `SessionRow` (already limited to today's `date` by
 * `loadSessionsThrough`) and the task list for titles. No DOM, no Dexie.
 *
 * Counting rules (PRD section 4): total focus and session count come ONLY from
 * `completed = true`. Incomplete sessions are counted separately through
 * `incompleteCountIn` and never enter any total.
 */
import type { SessionRow, TaskRow } from '@/db/db'
import { methodName } from '@/timer/methods'
import { localDateKey } from '@/timer/sessionRecord'

export interface Totals {
  focusMs: number
  completedCount: number
}

export interface DayStat {
  date: string
  focusMs: number
  completedCount: number
}

export interface GroupStat {
  key: string
  label: string
  focusMs: number
  completedCount: number
  /** Sub-label: the Custom preset name; absent for other methods. */
  sub?: string
}

export interface StreakStat {
  current: number
  longest: number
}

export interface StatsView {
  /** There has ever been a session (including incomplete). false = show one empty line. */
  hasAnySession: boolean
  today: Totals
  /** Seven days ending today. */
  week: Totals
  /** Incomplete sessions in the 7-day window — one number, outside the totals. */
  incompleteCount: number
  streak: StreakStat
  /** A 7-day series, zero-filled, ending today. */
  days: DayStat[]
  methods: GroupStat[]
  tasks: GroupStat[]
}

/**
 * Shift a local `YYYY-MM-DD` key. It goes through noon (12:00) to stay safe
 * against DST changes, then formats again with `localDateKey`.
 */
export function dayOffsetKey(key: string, deltaDays: number): string {
  const date = new Date(`${key}T12:00:00`)
  date.setDate(date.getDate() + deltaDays)
  return localDateKey(date.getTime())
}

/** `count` day keys in order, ending at `todayKey`. */
export function lastDays(todayKey: string, count: number): string[] {
  const keys: string[] = []
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    keys.push(dayOffsetKey(todayKey, -offset))
  }
  return keys
}

/** `YYYY-MM-DD` date keys compare correctly lexicographically. */
function within(key: string, fromKey: string, toKey: string): boolean {
  return key >= fromKey && key <= toKey
}

export function totalsIn(sessions: SessionRow[], fromKey: string, toKey: string): Totals {
  let focusMs = 0
  let completedCount = 0
  for (const session of sessions) {
    if (!session.completed || !within(session.date, fromKey, toKey)) continue
    focusMs += session.actualMs
    completedCount += 1
  }
  return { focusMs, completedCount }
}

/** Completed focus sessions for one method on one day (Ultradian nudge). */
export function completedCountForMethod(
  sessions: SessionRow[],
  methodId: string,
  dateKey: string,
): number {
  let count = 0
  for (const session of sessions) {
    if (session.completed && session.method === methodId && session.date === dateKey) count += 1
  }
  return count
}

export function incompleteCountIn(sessions: SessionRow[], fromKey: string, toKey: string): number {
  let count = 0
  for (const session of sessions) {
    if (!session.completed && within(session.date, fromKey, toKey)) count += 1
  }
  return count
}

/** Daily series for `days`; dates without sessions are zero-filled. */
export function dailySeries(sessions: SessionRow[], days: string[]): DayStat[] {
  const byDate = new Map<string, DayStat>(
    days.map((date) => [date, { date, focusMs: 0, completedCount: 0 }]),
  )
  for (const session of sessions) {
    if (!session.completed) continue
    const day = byDate.get(session.date)
    if (!day) continue
    day.focusMs += session.actualMs
    day.completedCount += 1
  }
  return days.map((date) => byDate.get(date) ?? { date, focusMs: 0, completedCount: 0 })
}

interface RawGroup {
  key: string
  focusMs: number
  completedCount: number
}

function groupSessions(
  sessions: SessionRow[],
  fromKey: string,
  toKey: string,
  keyOf: (session: SessionRow) => string | undefined,
): RawGroup[] {
  const groups = new Map<string, RawGroup>()
  for (const session of sessions) {
    if (!session.completed || !within(session.date, fromKey, toKey)) continue
    const key = keyOf(session)
    if (key === undefined || key === '') continue
    const group = groups.get(key) ?? { key, focusMs: 0, completedCount: 0 }
    groups.set(key, group)
    group.focusMs += session.actualMs
    group.completedCount += 1
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.focusMs - a.focusMs ||
      b.completedCount - a.completedCount ||
      a.key.localeCompare(b.key, 'en'),
  )
}

/** Per method, focus descending; label = method name, sub-label = Custom preset. */
export function groupByMethod(sessions: SessionRow[], fromKey: string, toKey: string): GroupStat[] {
  const subOf = new Map<string, string[]>()
  for (const session of sessions) {
    if (!session.completed || !within(session.date, fromKey, toKey)) continue
    if (session.method !== 'custom' || !session.methodLabel) continue
    const names = subOf.get(session.method) ?? []
    if (!names.includes(session.methodLabel)) names.push(session.methodLabel)
    subOf.set(session.method, names)
  }
  return groupSessions(sessions, fromKey, toKey, (session) => session.method).map((group) => {
    const sub = subOf.get(group.key)
    return {
      ...group,
      label: methodName(group.key),
      ...(sub && sub.length > 0 ? { sub: sub.join(', ') } : {}),
    }
  })
}

/** Per task, focus descending; titles from the task list, missing task = `(deleted)`. */
export function groupByTask(
  sessions: SessionRow[],
  tasks: TaskRow[],
  fromKey: string,
  toKey: string,
): GroupStat[] {
  const titleOf = new Map(tasks.map((task) => [task.id, task.title]))
  return groupSessions(sessions, fromKey, toKey, (session) => session.taskId).map((group) => ({
    ...group,
    label: titleOf.get(group.key) ?? '(deleted)',
  }))
}

/**
 * Streak from completed sessions: `current` counts back from today
 * (today may still be empty as long as yesterday has one — it only breaks
 * when yesterday is empty); `longest` = the longest run of consecutive days
 * in the whole history.
 */
export function computeStreaks(sessions: SessionRow[], todayKey: string): StreakStat {
  const days = new Set<string>()
  for (const session of sessions) {
    if (session.completed) days.add(session.date)
  }
  if (days.size === 0) return { current: 0, longest: 0 }

  let current = 0
  let cursor = days.has(todayKey) ? todayKey : dayOffsetKey(todayKey, -1)
  while (days.has(cursor)) {
    current += 1
    cursor = dayOffsetKey(cursor, -1)
  }

  const sorted = [...days].sort()
  let longest = 1
  let run = 1
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1] ?? ''
    run = dayOffsetKey(previous, 1) === sorted[index] ? run + 1 : 1
    if (run > longest) longest = run
  }
  return { current, longest }
}

export interface StatsInput {
  sessions: SessionRow[]
  tasks: TaskRow[]
  todayKey: string
}

/** Assemble the whole stats panel view in one call. */
export function buildStats({ sessions, tasks, todayKey }: StatsInput): StatsView {
  const days = lastDays(todayKey, 7)
  const weekFrom = days[0] ?? todayKey
  return {
    hasAnySession: sessions.length > 0,
    today: totalsIn(sessions, todayKey, todayKey),
    week: totalsIn(sessions, weekFrom, todayKey),
    incompleteCount: incompleteCountIn(sessions, weekFrom, todayKey),
    streak: computeStreaks(sessions, todayKey),
    days: dailySeries(sessions, days),
    methods: groupByMethod(sessions, weekFrom, todayKey),
    tasks: groupByTask(sessions, tasks, weekFrom, todayKey),
  }
}

/** Focus duration as plain text: "45 min", "1 hr", "1 hr 5 min". */
export function formatFocusMs(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  if (totalMinutes <= 0) return '0 min'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${totalMinutes} min`
  if (minutes === 0) return `${hours} hr`
  return `${hours} hr ${minutes} min`
}

/** Short chart-axis label: "45m", "2h", "1h50m". */
export function formatFocusShort(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  if (totalMinutes <= 0) return '0m'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${totalMinutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h${minutes}m`
}
