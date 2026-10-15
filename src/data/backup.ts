/**
 * Data export/import (PRD F19): session CSV for reading outside the app and
 * a JSON backup of every data table. Import merges per id (`bulkPut`), it
 * never deletes — restoring the same file twice does not duplicate rows.
 * Settings are not restored: preferences stay with the device.
 *
 * Row validation is loose but explicit: rows with the wrong shape are
 * dropped and counted as `skipped`, instead of failing the whole import.
 */
import {
  db,
  type BlockRow,
  type BlockStatus,
  type PresetRow,
  type SessionRow,
  type TaskRow,
} from '@/db/db'
import { methodName } from '@/timer/methods'
import { localDateKey } from '@/timer/sessionRecord'

export const BACKUP_VERSION = 1

export interface BackupData {
  app: 'ritme'
  version: number
  exportedAt: string
  tasks: TaskRow[]
  sessions: SessionRow[]
  blocks: BlockRow[]
  presets: PresetRow[]
}

export interface RestoreCounts {
  tasks: number
  sessions: number
  blocks: number
  presets: number
  skipped: number
}

export type RestoreResult = { ok: true; counts: RestoreCounts } | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const isText = (value: unknown): value is string => typeof value === 'string' && value !== ''
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const BLOCK_STATUSES: readonly BlockStatus[] = ['planned', 'running', 'done', 'overrun']

function isTaskRow(row: unknown): row is TaskRow {
  return (
    isRecord(row) &&
    isText(row.id) &&
    isText(row.title) &&
    isNumber(row.createdAt) &&
    isNumber(row.sessionCount)
  )
}

function isSessionRow(row: unknown): row is SessionRow {
  return (
    isRecord(row) &&
    isText(row.id) &&
    isText(row.method) &&
    (row.kind === 'focus' || row.kind === 'break' || row.kind === 'longBreak') &&
    isNumber(row.startedAt) &&
    isNumber(row.endedAt) &&
    isNumber(row.plannedMs) &&
    isNumber(row.actualMs) &&
    typeof row.completed === 'boolean' &&
    isText(row.date)
  )
}

function isBlockRow(row: unknown): row is BlockRow {
  return (
    isRecord(row) &&
    isText(row.id) &&
    isText(row.date) &&
    isNumber(row.startMin) &&
    isNumber(row.endMin) &&
    typeof row.status === 'string' &&
    (BLOCK_STATUSES as readonly string[]).includes(row.status)
  )
}

function isPresetRow(row: unknown): row is PresetRow {
  return isRecord(row) && isText(row.id) && isText(row.name) && isNumber(row.focusMs) && isNumber(row.breakMs)
}

/** Write CSV: quote values containing commas/newlines/quotes (RFC 4180). */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/** Session CSV, sorted by time; BOM so Excel reads UTF-8 correctly. */
export function sessionsToCsv(sessions: SessionRow[], tasks: TaskRow[]): string {
  const titleOf = new Map(tasks.map((task) => [task.id, task.title]))
  const header = [
    'date',
    'started',
    'ended',
    'method',
    'kind',
    'planned_min',
    'focus_min',
    'task',
    'completed',
  ]
  const lines = [header.join(',')]
  for (const session of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) {
    const method = session.methodLabel
      ? `${methodName(session.method)} (${session.methodLabel})`
      : methodName(session.method)
    lines.push(
      [
        session.date,
        new Date(session.startedAt).toISOString(),
        new Date(session.endedAt).toISOString(),
        method,
        session.kind,
        String(Math.round(session.plannedMs / 60_000)),
        String(Math.round(session.actualMs / 60_000)),
        session.taskId !== undefined ? (titleOf.get(session.taskId) ?? '(deleted)') : '',
        session.completed ? 'yes' : 'no',
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return `\uFEFF${lines.join('\n')}\n`
}

export async function buildSessionsCsv(): Promise<string> {
  const [sessions, tasks] = await Promise.all([db.sessions.toArray(), db.tasks.toArray()])
  return sessionsToCsv(sessions, tasks)
}

export async function buildBackup(now = Date.now()): Promise<BackupData> {
  const [tasks, sessions, blocks, presets] = await Promise.all([
    db.tasks.toArray(),
    db.sessions.toArray(),
    db.blocks.toArray(),
    db.presets.toArray(),
  ])
  return {
    app: 'ritme',
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    tasks,
    sessions,
    blocks,
    presets,
  }
}

/** Restore (merge) from backup file contents. */
export async function restoreBackup(text: string): Promise<RestoreResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'File is not JSON' }
  }
  if (!isRecord(parsed) || parsed.app !== 'ritme') {
    return { ok: false, error: 'Not a Ritme backup file' }
  }
  const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
  const raw = {
    tasks: list(parsed.tasks),
    sessions: list(parsed.sessions),
    blocks: list(parsed.blocks),
    presets: list(parsed.presets),
  }
  const tasks = raw.tasks.filter(isTaskRow)
  const sessions = raw.sessions.filter(isSessionRow)
  const blocks = raw.blocks.filter(isBlockRow)
  const presets = raw.presets.filter(isPresetRow)
  const skipped =
    raw.tasks.length +
    raw.sessions.length +
    raw.blocks.length +
    raw.presets.length -
    (tasks.length + sessions.length + blocks.length + presets.length)

  try {
    await db.transaction('rw', db.tasks, db.sessions, db.blocks, db.presets, async () => {
      await db.tasks.bulkPut(tasks)
      await db.sessions.bulkPut(sessions)
      await db.blocks.bulkPut(blocks)
      await db.presets.bulkPut(presets)
      // Per-task session counts are recomputed from the table, never trusted
      // from the file — same rule as putFocusSession.
      const ids = new Set<string>(tasks.map((task) => task.id))
      for (const session of sessions) {
        if (session.taskId !== undefined) ids.add(session.taskId)
      }
      for (const id of ids) {
        const count = await db.sessions
          .where('taskId')
          .equals(id)
          .and((row) => row.completed)
          .count()
        await db.tasks.update(id, { sessionCount: count })
      }
    })
  } catch (error) {
    console.warn('Ritme: backup restore failed', error)
    return { ok: false, error: 'Browser storage is unavailable' }
  }
  return {
    ok: true,
    counts: {
      tasks: tasks.length,
      sessions: sessions.length,
      blocks: blocks.length,
      presets: presets.length,
      skipped,
    },
  }
}

/** Download text as a file (anchor + object URL, no dependencies). */
export function downloadFile(name: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

/** Local-dated export file name: `ritme-backup-2026-10-15.json`. */
export function exportFileName(kind: 'backup' | 'sessions', ext: 'json' | 'csv', now = Date.now()): string {
  return `ritme-${kind}-${localDateKey(now)}.${ext}`
}
