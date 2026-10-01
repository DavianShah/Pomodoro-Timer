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
}

export interface TaskRow {
  id: string
  title: string
  createdAt: number
  doneAt?: number
  sessionCount: number
}

export interface BlockRow {
  id: string
  date: string
  startMin: number
  endMin: number
  taskId?: string
  status: 'planned' | 'done' | 'skipped' | 'overrun'
}

export interface PresetRow {
  id: string
  name: string
  focusMs: number
  breakMs: number
  longBreakMs?: number
  cycle?: number
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
