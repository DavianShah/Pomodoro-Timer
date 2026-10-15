import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/db'
import { listPresets, MAX_PRESETS, removePreset, savePreset } from './presets'

const base = { focusMs: 40 * 60_000, breakMs: 10 * 60_000, longBreakMs: null, cycle: 1 }

beforeEach(async () => {
  await db.presets.clear()
})

describe('Custom presets', () => {
  it('the same name overwrites the existing row (edit flow), the list stays at one', async () => {
    const first = await savePreset({ name: 'Morning', ...base })
    const second = await savePreset({ name: 'Morning', ...base, focusMs: 50 * 60_000 })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) throw new Error('failed')
    expect(second.row.id).toBe(first.row.id)

    const rows = await listPresets()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.focusMs).toBe(50 * 60_000)
  })

  it('a new name adds; beyond 10 is rejected, not silently dropped', async () => {
    for (let index = 0; index < MAX_PRESETS; index += 1) {
      const result = await savePreset({ name: `preset-${index}`, ...base })
      expect(result.ok).toBe(true)
    }

    const extra = await savePreset({ name: 'the-eleventh', ...base })
    expect(extra).toEqual({ ok: false, reason: 'capacity' })
    expect(await listPresets()).toHaveLength(MAX_PRESETS)
  })

  it('old presets without createdAt still appear in the list', async () => {
    await db.presets.put({ id: 'old', name: 'Old', focusMs: 25 * 60_000, breakMs: 5 * 60_000 })
    await savePreset({ name: 'New', ...base })

    const rows = await listPresets()
    expect(rows.map((row) => row.name).sort()).toEqual(['New', 'Old'])
  })

  it('removes a preset', async () => {
    const saved = await savePreset({ name: 'Brief', ...base })
    if (!saved.ok) throw new Error('failed')
    await removePreset(saved.row.id)
    expect(await listPresets()).toHaveLength(0)
  })
})
