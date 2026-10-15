/**
 * Agregasi statistik (F10) dan streak (F11) — fungsi murni.
 *
 * Masukan: array `SessionRow` (sudah dibatasi `date` hari ini oleh
 * `loadSessionsThrough`) dan daftar task untuk judul. Tanpa DOM, tanpa Dexie.
 *
 * Aturan hitung (PRD bagian 4): total fokus dan jumlah sesi HANYA dari
 * `completed = true`. Sesi tidak selesai dihitung terpisah lewat
 * `incompleteCountIn` dan tidak pernah masuk total mana pun.
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
  /** Sublabel: nama preset Custom; absen untuk metode lain. */
  sub?: string
}

export interface StreakStat {
  current: number
  longest: number
}

export interface StatsView {
  /** Pernah ada sesi (termasuk tidak selesai). false = tampil satu baris kosong. */
  hasAnySession: boolean
  today: Totals
  /** Tujuh hari berakhir hari ini. */
  week: Totals
  /** Sesi tidak selesai dalam jendela 7 hari — satu angka, di luar total. */
  incompleteCount: number
  streak: StreakStat
  /** Deret 7 hari, terisi nol, berakhir hari ini. */
  days: DayStat[]
  methods: GroupStat[]
  tasks: GroupStat[]
}

/**
 * Geser kunci `YYYY-MM-DD` lokal. Lewat tengah hari (12:00) supaya aman
 * terhadap perubahan DST, lalu format ulang dengan `localDateKey`.
 */
export function dayOffsetKey(key: string, deltaDays: number): string {
  const date = new Date(`${key}T12:00:00`)
  date.setDate(date.getDate() + deltaDays)
  return localDateKey(date.getTime())
}

/** `count` kunci hari urut, berakhir di `todayKey`. */
export function lastDays(todayKey: string, count: number): string[] {
  const keys: string[] = []
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    keys.push(dayOffsetKey(todayKey, -offset))
  }
  return keys
}

/** Kunci tanggal `YYYY-MM-DD` membandingkan benar secara leksikografis. */
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

/** Jumlah sesi fokus selesai satu metode pada satu hari (nudge Ultradian). */
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

/** Deret harian untuk `days`; tanggal tanpa sesi lengkapi nol. */
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
      a.key.localeCompare(b.key, 'id'),
  )
}

/** Per metode, fokus turun; label = nama metode, sublabel = preset Custom. */
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

/** Per task, fokus turun; judul dari daftar task, task hilang = `(dihapus)`. */
export function groupByTask(
  sessions: SessionRow[],
  tasks: TaskRow[],
  fromKey: string,
  toKey: string,
): GroupStat[] {
  const titleOf = new Map(tasks.map((task) => [task.id, task.title]))
  return groupSessions(sessions, fromKey, toKey, (session) => session.taskId).map((group) => ({
    ...group,
    label: titleOf.get(group.key) ?? '(dihapus)',
  }))
}

/**
 * Streak dari sesi completed: `current` dihitung mundur dari hari ini
 * (hari ini boleh masih kosong selama kemarin ada — putus hanya saat kemarin
 * kosong); `longest` = run hari berurutan terpanjang di seluruh riwayat.
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

/** Susun seluruh tampilan panel statistik dalam satu panggilan. */
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

/** Durasi fokus sebagai teks datar: "45 menit", "1 jam", "1 jam 5 menit". */
export function formatFocusMs(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  if (totalMinutes <= 0) return '0 menit'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${totalMinutes} menit`
  if (minutes === 0) return `${hours} jam`
  return `${hours} jam ${minutes} menit`
}

/** Label sumbu grafik yang pendek: "45m", "2j", "1j50m". */
export function formatFocusShort(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  if (totalMinutes <= 0) return '0m'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${totalMinutes}m`
  if (minutes === 0) return `${hours}j`
  return `${hours}j${minutes}m`
}
