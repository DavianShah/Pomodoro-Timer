/**
 * Operasi blok Time Boxing (PRD bagian 3 / F16). Fungsi murni: masukan
 * berupa daftar blok + input, keluaran baris/daftar baru — tanpa I/O.
 * Persistensi ada di `src/data/blocks.ts`.
 *
 * Invarian: kelipatan 15 menit, durasi minimal 15 menit, rentang
 * 00:00–24:00, dan tidak ada dua blok pada tanggal sama saling tumpang
 * tindih.
 */
import type { BlockRow } from '@/db/db'

/** Kelipatan penyelarasan menit (PRD F16). */
export const SNAP_MIN = 15
/** Durasi blok paling pendek. */
export const MIN_BLOCK_MIN = 15
/** Menit dalam sehari. */
export const DAY_MIN = 24 * 60

export interface BlockFields {
  startMin: number
  endMin: number
  taskId?: string
}

export type BlockResult = { ok: true; block: BlockRow } | { ok: false; error: string }
export type BlockListResult = { ok: true; blocks: BlockRow[] } | { ok: false; error: string }

/** Bulatkan menit ke kelipatan 15 terdekat, jepit ke 00:00–24:00. */
export function snapMin(minute: number): number {
  const snapped = Math.round(minute / SNAP_MIN) * SNAP_MIN
  return Math.min(DAY_MIN, Math.max(0, snapped))
}

/** Menit → `HH:MM` (24 jam; 1440 → `24:00`). */
export function formatMin(minute: number): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
}

/** Menit hari (`00:00`–`24:00`) untuk waktu epoch. */
export function dayMinutesOf(at: number): number {
  const date = new Date(at)
  return date.getHours() * 60 + date.getMinutes()
}

function parseDateKey(key: string): [number, number, number] {
  const [year = 0, month = 1, day = 1] = key.split('-').map(Number)
  return [year, month, day]
}

/** Epoch awal blok (zona perangkat). */
export function blockStartMs(block: BlockRow): number {
  const [year, month, day] = parseDateKey(block.date)
  return new Date(year, month - 1, day, 0, block.startMin).getTime()
}

/** Epoch akhir blok (zona perangkat); `endMin` 1440 jatuh ke tengah malam. */
export function blockEndMs(block: BlockRow): number {
  const [year, month, day] = parseDateKey(block.date)
  return new Date(year, month - 1, day, 0, block.endMin).getTime()
}

/** Rentang blok `HH:MM–HH:MM` untuk label UI. */
export function formatBlockRange(block: BlockRow): string {
  return `${formatMin(block.startMin)}–${formatMin(block.endMin)}`
}

/** Blok yang mencakup waktu sekarang, atau null. `blocks` urut startMin. */
export function currentBlock(blocks: BlockRow[], now: number): BlockRow | null {
  const minute = dayMinutesOf(now)
  return blocks.find((block) => block.startMin <= minute && minute < block.endMin) ?? null
}

/** Blok dengan mulai paling awal setelah sekarang, atau null. */
export function nextBlock(blocks: BlockRow[], now: number): BlockRow | null {
  const minute = dayMinutesOf(now)
  return blocks.find((block) => block.startMin > minute) ?? null
}

/** Blok berdasarkan akhir epoch-nya — penanda "blok berakhir" di timer. */
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
 * Validasi nilai mentah dulu — snap bisa "memperbaiki" durasi pendek
 * jadi 15 menit, padahal aturan durasi minimal harus ditolak apa adanya.
 * Pemeriksaan tumpang tindih memakai nilai hasil snap.
 */
function validate(
  date: string,
  fields: BlockFields,
  blocks: BlockRow[],
  excludeId: string | null,
): string | null {
  if (fields.endMin <= fields.startMin) return 'Selesai harus setelah mulai'
  if (fields.endMin - fields.startMin < MIN_BLOCK_MIN) return 'Durasi minimal 15 menit'
  const startMin = snapMin(fields.startMin)
  const endMin = snapMin(fields.endMin)
  const clash = blocks.some(
    (block) =>
      block.id !== excludeId &&
      block.date === date &&
      startMin < block.endMin &&
      block.startMin < endMin,
  )
  return clash ? 'Blok tumpang tindih' : null
}

function byStart(a: BlockRow, b: BlockRow): number {
  return a.startMin - b.startMin
}

/** Blok baru: snap 15 menit, validasi durasi/tumpang tindih. */
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
 * Ubah isi blok (validasi kecuali dirinya sendiri). `fields` adalah
 * kondisi lengkap: `taskId` hilang = blok tanpa task. Status kembali ke
 * `planned` kecuali blok sedang `running`.
 */
export function updateBlock(id: string, fields: BlockFields, blocks: BlockRow[]): BlockResult {
  const current = blocks.find((block) => block.id === id)
  if (current === undefined) return { ok: false, error: 'Blok tidak ditemukan' }
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

/** Hapus satu blok; blok lain tidak berubah. */
export function deleteBlock(id: string, blocks: BlockRow[]): BlockListResult {
  if (!blocks.some((block) => block.id === id)) return { ok: false, error: 'Blok tidak ditemukan' }
  return { ok: true, blocks: blocks.filter((block) => block.id !== id) }
}

/**
 * Perpanjang blok `extraMin` menit dan tandai `overrun` (Lanjut 15).
 * Blok yang mulai menempel di belakang ikut digeser sejauh perpanjangan
 * supaya tidak tumpang tindih; perpanjangan dibatasi sisa hari. Tanpa
 * sisa hari → `Hari sudah penuh`.
 */
export function extendBlock(id: string, extraMin: number, blocks: BlockRow[]): BlockListResult {
  const current = blocks.find((block) => block.id === id)
  if (current === undefined) return { ok: false, error: 'Blok tidak ditemukan' }

  const tail = blocks.filter((block) => block.startMin > current.startMin)
  const first = tail.reduce<BlockRow | null>(
    (min, block) => (min === null || block.startMin < min.startMin ? block : min),
    null,
  )
  let extension = Math.min(extraMin, DAY_MIN - current.endMin)
  if (extension <= 0) return { ok: false, error: 'Sudah 24.00' }

  const gap = first === null ? Number.POSITIVE_INFINITY : first.startMin - current.endMin
  if (gap < extension) {
    const maxEnd = tail.reduce((max, block) => Math.max(max, block.endMin), 0)
    extension = Math.min(extension, DAY_MIN - maxEnd)
    if (extension <= 0) return { ok: false, error: 'Hari sudah penuh' }
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
 * Geser semua blok setelah blok ini sebesar `deltaMin` — blok berjalan
 * tidak ikut. Geser seragam (jarak antar blok terjaga) dan dijepit supaya
 * tidak ada yang melewati 24:00; delta nol = tanpa perubahan.
 */
export function shiftFollowing(id: string, deltaMin: number, blocks: BlockRow[]): BlockListResult {
  const current = blocks.find((block) => block.id === id)
  if (current === undefined) return { ok: false, error: 'Blok tidak ditemukan' }
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

/** Urutkan daftar berdasarkan awal blok. */
export function sortBlocks(blocks: BlockRow[]): BlockRow[] {
  return [...blocks].sort(byStart)
}
