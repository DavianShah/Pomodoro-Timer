/**
 * Time Boxing block operations (PRD section 3 / F16). Pure functions: input
 * is a block list + fields, output is a new row/list — no I/O. Persistence
 * lives in `src/data/blocks.ts`.
 *
 * Invariants: multiples of 15 minutes, minimum duration 15 minutes, range
 * 00:00–24:00, and no two blocks on the same date overlapping.
 */
import type { BlockRow } from '@/db/db'

/** Minute snap increment (PRD F16). */
export const SNAP_MIN = 15
/** Shortest block duration. */
export const MIN_BLOCK_MIN = 15
/** Minutes in a day. */
export const DAY_MIN = 24 * 60

export interface BlockFields {
  startMin: number
  endMin: number
  taskId?: string
}

export type BlockResult = { ok: true; block: BlockRow } | { ok: false; error: string }
export type BlockListResult = { ok: true; blocks: BlockRow[] } | { ok: false; error: string }

/** Round minutes to the nearest multiple of 15, clamped to 00:00–24:00. */
export function snapMin(minute: number): number {
  const snapped = Math.round(minute / SNAP_MIN) * SNAP_MIN
  return Math.min(DAY_MIN, Math.max(0, snapped))
}

/** Minutes → `HH:MM` (24-hour; 1440 → `24:00`). */
export function formatMin(minute: number): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
}

/** Day minutes (`00:00`–`24:00`) for an epoch time. */
export function dayMinutesOf(at: number): number {
  const date = new Date(at)
  return date.getHours() * 60 + date.getMinutes()
}

function parseDateKey(key: string): [number, number, number] {
  const [year = 0, month = 1, day = 1] = key.split('-').map(Number)
  return [year, month, day]
}

/** Block start epoch (device timezone). */
export function blockStartMs(block: BlockRow): number {
  const [year, month, day] = parseDateKey(block.date)
  return new Date(year, month - 1, day, 0, block.startMin).getTime()
}

/** Block end epoch (device timezone); `endMin` 1440 falls on midnight. */
export function blockEndMs(block: BlockRow): number {
  const [year, month, day] = parseDateKey(block.date)
  return new Date(year, month - 1, day, 0, block.endMin).getTime()
}

/** Block range `HH:MM–HH:MM` for UI labels. */
export function formatBlockRange(block: BlockRow): string {
  return `${formatMin(block.startMin)}–${formatMin(block.endMin)}`
}

/** The block covering the current time, or null. `blocks` sorted by startMin. */
export function currentBlock(blocks: BlockRow[], now: number): BlockRow | null {
  const minute = dayMinutesOf(now)
  return blocks.find((block) => block.startMin <= minute && minute < block.endMin) ?? null
}

/** The earliest block starting after now, or null. */
export function nextBlock(blocks: BlockRow[], now: number): BlockRow | null {
  const minute = dayMinutesOf(now)
  return blocks.find((block) => block.startMin > minute) ?? null
}

/** A block by its end epoch — the timer's "block ended" marker. */
export function blockEndingAt(blocks: BlockRow[], endMs: number): BlockRow | null {
  const exact = blocks.find((block) => blockEndMs(block) === endMs)
  if (exact !== undefined) return exact
  const minute = dayMinutesOf(endMs)
  return (
    blocks.find((block) => block.endMin === minute || (minute === 0 && block.endMin === DAY_MIN)) ??
    null
  )
}

/**
 * Validate the raw values first — snapping could "fix" a short duration up
 * to 15 minutes, while the minimum-duration rule must reject it as-is.
 * The overlap check uses the snapped values.
 */
function validate(
  date: string,
  fields: BlockFields,
  blocks: BlockRow[],
  excludeId: string | null,
): string | null {
  if (fields.endMin <= fields.startMin) return 'End must be after start'
  if (fields.endMin - fields.startMin < MIN_BLOCK_MIN) return 'Minimum duration is 15 minutes'
  const startMin = snapMin(fields.startMin)
  const endMin = snapMin(fields.endMin)
  const clash = blocks.some(
    (block) =>
      block.id !== excludeId &&
      block.date === date &&
      startMin < block.endMin &&
      block.startMin < endMin,
  )
  return clash ? 'Overlapping block' : null
}

function byStart(a: BlockRow, b: BlockRow): number {
  return a.startMin - b.startMin
}

/** New block: snap to 15 minutes, validate duration/overlap. */
export function createBlock(
  date: string,
  fields: BlockFields,
  blocks: BlockRow[],
  makeId: () => string = () => crypto.randomUUID(),
): BlockResult {
  const error = validate(date, fields, blocks, null)
  if (error !== null) return { ok: false, error }
  const startMin = snapMin(fields.startMin)
  const endMin = snapMin(fields.endMin)
  const block: BlockRow = { id: makeId(), date, startMin, endMin, status: 'planned' }
  if (fields.taskId !== undefined) block.taskId = fields.taskId
  return { ok: true, block }
}

/**
 * Update a block's contents (validation excludes the block itself). `fields`
 * is the complete state: a missing `taskId` = block without a task. Status
 * returns to `planned` unless the block is `running`.
 */
export function updateBlock(id: string, fields: BlockFields, blocks: BlockRow[]): BlockResult {
  const current = blocks.find((block) => block.id === id)
  if (current === undefined) return { ok: false, error: 'Block not found' }
  const error = validate(current.date, fields, blocks, id)
  if (error !== null) return { ok: false, error }
  const startMin = snapMin(fields.startMin)
  const endMin = snapMin(fields.endMin)
  const status = current.status === 'running' ? 'running' : 'planned'
  const block: BlockRow = { ...current, startMin, endMin, status }
  if (fields.taskId !== undefined) block.taskId = fields.taskId
  else delete block.taskId
  return { ok: true, block }
}

/** Delete a single block; other blocks are unchanged. */
export function deleteBlock(id: string, blocks: BlockRow[]): BlockListResult {
  if (!blocks.some((block) => block.id === id)) return { ok: false, error: 'Block not found' }
  return { ok: true, blocks: blocks.filter((block) => block.id !== id) }
}

/**
 * Extend a block by `extraMin` minutes and mark it `overrun` (Extend 15).
 * Blocks starting right behind it shift by the extension so they do not
 * overlap; the extension is limited by the remainder of the day. No
 * remainder → `Day is full`.
 */
export function extendBlock(id: string, extraMin: number, blocks: BlockRow[]): BlockListResult {
  const current = blocks.find((block) => block.id === id)
  if (current === undefined) return { ok: false, error: 'Block not found' }

  const tail = blocks.filter((block) => block.startMin > current.startMin)
  const first = tail.reduce<BlockRow | null>(
    (min, block) => (min === null || block.startMin < min.startMin ? block : min),
    null,
  )
  let extension = Math.min(extraMin, DAY_MIN - current.endMin)
  if (extension <= 0) return { ok: false, error: 'Already 24:00' }

  const gap = first === null ? Number.POSITIVE_INFINITY : first.startMin - current.endMin
  if (gap < extension) {
    const maxEnd = tail.reduce((max, block) => Math.max(max, block.endMin), 0)
    extension = Math.min(extension, DAY_MIN - maxEnd)
    if (extension <= 0) return { ok: false, error: 'Day is full' }
  }
  const move = gap < extension ? extension : 0
  const endMin = current.endMin + extension
  const moving = new Set(tail.map((block) => block.id))
  return {
    ok: true,
    blocks: blocks.map((block): BlockRow => {
      if (block.id === id) return { ...block, endMin, status: 'overrun' }
      if (move > 0 && moving.has(block.id)) {
        return { ...block, startMin: block.startMin + move, endMin: block.endMin + move }
      }
      return block
    }),
  }
}

/**
 * Shift every block after this one by `deltaMin` — the running block is not
 * included. The shift is uniform (gaps between blocks preserved) and clamped
 * so nothing crosses 24:00; a zero delta = no change.
 */
export function shiftFollowing(id: string, deltaMin: number, blocks: BlockRow[]): BlockListResult {
  const current = blocks.find((block) => block.id === id)
  if (current === undefined) return { ok: false, error: 'Block not found' }
  if (deltaMin <= 0) return { ok: true, blocks }

  const tail = blocks.filter((block) => block.startMin > current.startMin)
  if (tail.length === 0) return { ok: true, blocks }
  const maxEnd = tail.reduce((max, block) => Math.max(max, block.endMin), 0)
  const move = Math.min(deltaMin, DAY_MIN - maxEnd)
  if (move <= 0) return { ok: true, blocks }

  const moving = new Set(tail.map((block) => block.id))
  return {
    ok: true,
    blocks: blocks.map((block): BlockRow =>
      moving.has(block.id)
        ? { ...block, startMin: block.startMin + move, endMin: block.endMin + move }
        : block,
    ),
  }
}

/** Sort the list by block start. */
export function sortBlocks(blocks: BlockRow[]): BlockRow[] {
  return [...blocks].sort(byStart)
}
