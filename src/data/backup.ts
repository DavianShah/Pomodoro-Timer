/**
 * Ekspor/impor data (PRD F19): CSV sesi untuk dibaca di luar aplikasi dan
 * backup JSON seluruh tabel data. Impor bersifat gabung per id (`bulkPut`),
 * bukan menghapus — file yang sama dipulihkan dua kali tidak menggandakan
 * baris. Pengaturan tidak ikut dipulihkan: preferensi tetap milik perangkat.
 *
 * Validasi baris longgar tapi eksplisit: baris yang tidak berbentuk benar
 * dibuang dan dihitung `skipped`, bukan membuat seluruh impor gagal.
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

/** Tulis CSV: kutip nilai yang memuat koma/baris baru/kutip (RFC 4180). */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/** CSV sesi, urut waktu; BOM supaya Excel membaca UTF-8 dengan benar. */
export function sessionsToCsv(sessions: SessionRow[], tasks: TaskRow[]): string {
  const titleOf = new Map(tasks.map((task) => [task.id, task.title]))
  const header = [
    'tanggal',
    'mulai',
    'selesai',
    'metode',
    'jenis',
    'rencana_menit',
    'fokus_menit',
    'task',
    'selesai',
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
        session.taskId !== undefined ? (titleOf.get(session.taskId) ?? '(dihapus)') : '',
        session.completed ? 'ya' : 'tidak',
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

/** Pulihkan (gabung) dari isi berkas backup. */
export async function restoreBackup(text: string): Promise<RestoreResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Berkas bukan JSON' }
  }
  if (!isRecord(parsed) || parsed.app !== 'ritme') {
    return { ok: false, error: 'Bukan berkas backup Ritme' }
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
      // Hitungan sesi per task dihitung ulang dari tabel, bukan dipercaya
      // dari berkas — sama dengan aturan putFocusSession.
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
    console.warn('Ritme: pemulihan backup gagal', error)
    return { ok: false, error: 'Penyimpanan browser tidak tersedia' }
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

/** Unduh teks sebagai berkas (anchor + object URL, tanpa dependensi). */
export function downloadFile(name: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

/** Nama berkas ekspor bertanggal lokal: `ritme-backup-2026-10-15.json`. */
export function exportFileName(kind: 'backup' | 'sesi', ext: 'json' | 'csv', now = Date.now()): string {
  return `ritme-${kind}-${localDateKey(now)}.${ext}`
}
