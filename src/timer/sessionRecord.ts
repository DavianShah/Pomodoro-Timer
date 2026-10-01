/**
 * Aturan pencatatan sesi fokus (PRD bagian 9). Murni: masukan = state timer
 * sebelum transisi, jenis ujung sesi, jam, dan task aktif; keluaran = baris
 * Session atau null. Tanpa I/O — Dexie ada di `src/data`.
 *
 * Invarian: `actualMs = endedAt − startedAt` (waktu fokus efektif, jeda di
 * luar hitungan). Id sesi diturunkan dari kunci awal efektif sehingga
 * transisi yang sama (mis. pulih restore ganda) menghasilkan id sama.
 */
import type { SessionRow } from '@/db/db'
import { elapsed, plannedPhaseMs, remaining, type TimerState } from './engine'
import { methodById } from './methods'

/** Ujung sesi fokus: tick otomatis, tombol lewati/Selesai, atau reset. */
export type FocusEndAction = 'auto' | 'skip' | 'reset'

/** Tanggal lokal `YYYY-MM-DD` (zona perangkat) — grouping harian tanpa hitung ulang. */
export function localDateKey(at: number): string {
  const date = new Date(at)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Id stabil dari kunci awal sesi — dasar idempotensi. */
export function focusSessionId(method: string, startedAt: number): string {
  return `${method}-${startedAt}`
}

export interface FocusEndInput {
  /** State sesi fokus sebelum transisi. */
  prev: TimerState
  action: FocusEndAction
  now: number
  /** Task yang aktif saat sesi berakhir; null = tanpa task. */
  taskId: string | null
  /** Time Boxing: panjang blok (ms) untuk plannedMs; absen = metode lain. */
  boxing?: { plannedMs: number } | null
}

export function buildFocusSession({
  prev,
  action,
  now,
  taskId,
  boxing,
}: FocusEndInput): SessionRow | null {
  if (prev.phase !== 'focus') return null
  const method = methodById(prev.method)

  if (method.mode === 'boxing') {
    // Anti-ganda: prompt tanpa sesi berjalan (startedAt null) bukan ujung sesi.
    if (prev.startedAt === null) return null
    const startedAt = prev.startedAt
    const endedAt = action === 'auto' && prev.endTime !== null ? prev.endTime : now
    const actualMs = endedAt - startedAt
    if (!(actualMs > 0)) return null
    return {
      id: focusSessionId(prev.method, startedAt),
      method: prev.method,
      kind: 'focus',
      startedAt,
      endedAt,
      plannedMs: boxing?.plannedMs ?? actualMs,
      actualMs,
      ...(taskId !== null ? { taskId } : {}),
      // Blok batal (reset) bukan selesai; ujung lain = sesi selesai.
      completed: action !== 'reset',
      date: localDateKey(endedAt),
    }
  }

  // Waktu fokus aktual: hitung maju = akumulasi; hitung mundur = rencana −
  // sisa (jeda tidak ikut terhitung karena jeda membekukan sisa waktu).
  const actualMs =
    method.mode === 'countup'
      ? elapsed(prev, now)
      : plannedPhaseMs(prev.method, 'focus') - remaining(prev, now)
  // Sesi tanpa durasi (skip/reset saat idle) bukan sesi — jangan dicatat.
  if (!(actualMs > 0)) return null

  // Ujung otomatis = endTime (tepat saat rencana); manual = momen aksi.
  const endedAt = action === 'auto' && prev.endTime !== null ? prev.endTime : now
  const startedAt = endedAt - actualMs

  return {
    id: focusSessionId(prev.method, startedAt),
    method: prev.method,
    kind: 'focus',
    startedAt,
    endedAt,
    plannedMs: plannedPhaseMs(prev.method, 'focus'),
    actualMs,
    ...(taskId !== null ? { taskId } : {}),
    // Otomatis selesai = completed. Hitung maju diakhiri "Selesai" (Flowtime)
    // = completed. Lewati/reset hitung mundur di tengah = batal.
    completed: action === 'auto' || (action === 'skip' && method.mode === 'countup'),
    date: localDateKey(endedAt),
  }
}
