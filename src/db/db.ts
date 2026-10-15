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
  /** Local session date (`YYYY-MM-DD`) — direct daily grouping (M4a). */
  date: string
  /** Custom preset name at session time (stats sub-label); absent = other methods. */
  methodLabel?: string
}

export interface TaskRow {
  id: string
  title: string
  createdAt: number
  /** When marked done; missing (undefined) = active again. */
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
  /** Save time — preset list order (v4); absent on old-schema rows. */
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

// v2: the `date` index on sessions for daily grouping (F10 later).
db.version(2).stores({
  sessions: 'id, startedAt, method, taskId, kind, date',
})

// v3: the blocks table is fully used by Time Boxing (F16) — block status
// is now the lifecycle planned → running → done/overrun; indexes unchanged.
db.version(3).stores({
  blocks: 'id, date, startMin, [date+startMin]',
})

// v4: Custom presets (F3) — the createdAt index for list order.
db.version(4).stores({
  presets: 'id, name, createdAt',
})
