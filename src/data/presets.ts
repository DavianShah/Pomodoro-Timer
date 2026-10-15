/**
 * Custom preset repository (PRD section 9, Preset Table). Save-per-name:
 * an existing name overwrites its row (edit flow), a new name adds a new
 * row up to the maximum.
 */
import { db, type PresetRow } from '@/db/db'

/** Preset count limit (PRD section 9). */
export const MAX_PRESETS = 10

export type SavePresetResult = { ok: true; row: PresetRow } | { ok: false; reason: 'capacity' }

/**
 * Preset list, oldest first. `toArray` + manual sort (not `orderBy`): rows
 * from the old schema without `createdAt` still show up even though unindexed.
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

/** Save preset: same name = update, new name = add (rejected when full). */
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
    return { ok: false, reason: 'capacity' }
  }
  await db.presets.put(row)
  return { ok: true, row }
}

export async function removePreset(id: string): Promise<void> {
  await db.presets.delete(id)
}
