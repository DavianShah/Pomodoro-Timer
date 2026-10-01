/**
 * Repository preset Custom (PRD bagian 9, Tabel Preset). Simpan-per-nama:
 * nama yang sama menimpa barisnya (alur edit), nama baru menambah baris
 * baru dengan batas maksimal.
 */
import { db, type PresetRow } from '@/db/db'

/** Batas jumlah preset (PRD bagian 9). */
export const MAX_PRESETS = 10

export type SavePresetResult = { ok: true; row: PresetRow } | { ok: false; reason: 'kapasitas' }

/**
 * Daftar preset, terlama dulu. `toArray` + urut manual (bukan `orderBy`):
 * baris dari skema lama tanpa `createdAt` tetap ikut meski belum terindeks.
 */
export async function listPresets(): Promise<PresetRow[]> {
  const rows = await db.presets.toArray()
  return rows.sort((a, b) => createdOf(a) - createdOf(b))
}

function createdOf(row: PresetRow): number {
  return typeof row.createdAt === 'number' ? row.createdAt : 0
}

export interface PresetInput {
  name: string
  focusMs: number
  breakMs: number
  longBreakMs: number | null
  cycle: number
}

/** Simpan preset: nama sama = perbarui, nama baru = tambah (tolak bila penuh). */
export async function savePreset(input: PresetInput): Promise<SavePresetResult> {
  const existing = await db.presets.where('name').equals(input.name).first()
  const row: PresetRow = {
    id: existing?.id ?? crypto.randomUUID(),
    name: input.name,
    focusMs: input.focusMs,
    breakMs: input.breakMs,
    ...(input.longBreakMs !== null ? { longBreakMs: input.longBreakMs } : {}),
    ...(input.cycle > 1 ? { cycle: input.cycle } : {}),
    createdAt: existing?.createdAt ?? Date.now(),
  }
  if (existing === undefined && (await db.presets.count()) >= MAX_PRESETS) {
    return { ok: false, reason: 'kapasitas' }
  }
  await db.presets.put(row)
  return { ok: true, row }
}

export async function removePreset(id: string): Promise<void> {
  await db.presets.delete(id)
}
