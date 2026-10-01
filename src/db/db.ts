import Dexie, { type EntityTable } from 'dexie'
import type { AppSettings } from '@/state/settings'

export type Phase = 'focus' | 'break' | 'longBreak'

export interface SessionRow {
  id: string
  method: string
  kind: Phase
  startedAt: number
  endedAt: number
  plannedMs: number
  actualMs: number
  taskId?: string
  completed: boolean
  /** Tanggal lokal sesi (`YYYY-MM-DD`) — grouping harian langsung (M4a). */
  date: string
  /** Nama preset Custom saat sesi (sublabel statistik); absen = metode lain. */
  methodLabel?: string
}

export interface TaskRow {
  id: string
  title: string
  createdAt: number
  /** Saat ditandai selesai; hilang (undefined) = kembali aktif. */
  doneAt?: number | undefined
  sessionCount: number
}

export type BlockStatus = 'planned' | 'running' | 'done' | 'overrun'

export interface BlockRow {
  id: string
  date: string
  startMin: number
  endMin: number
  taskId?: string
  status: BlockStatus
}

export interface PresetRow {
  id: string
  name: string
  focusMs: number
  breakMs: number
  longBreakMs?: number
  cycle?: number
  /** Waktu simpan — urutan daftar preset (v4); absen pada baris skema lama. */
  createdAt?: number
}

export interface SettingsRow {
  id: 'app'
  value: AppSettings
}

export const db = new Dexie('ritme') as Dexie & {
  sessions: EntityTable<SessionRow, 'id'>
  tasks: EntityTable<TaskRow, 'id'>
  blocks: EntityTable<BlockRow, 'id'>
  presets: EntityTable<PresetRow, 'id'>
  settings: EntityTable<SettingsRow, 'id'>
}

db.version(1).stores({
  sessions: 'id, startedAt, method, taskId, kind',
  tasks: 'id, createdAt, doneAt',
  blocks: 'id, date, startMin, [date+startMin]',
  presets: 'id, name',
  settings: 'id',
})

// v2: indeks `date` pada sessions untuk pengelompokan harian (F10 nanti).
db.version(2).stores({
  sessions: 'id, startedAt, method, taskId, kind, date',
})

// v3: tabel blocks dipakai penuh oleh Time Boxing (F16) — status blok
// kini alur hidup planned → running → done/overrun; indeks tidak berubah.
db.version(3).stores({
  blocks: 'id, date, startMin, [date+startMin]',
})

// v4: preset Custom (F3) — indeks createdAt untuk urutan daftar.
db.version(4).stores({
  presets: 'id, name, createdAt',
})
