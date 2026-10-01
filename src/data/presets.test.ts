import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/db'
import { listPresets, MAX_PRESETS, removePreset, savePreset } from './presets'

const base = { focusMs: 40 * 60_000, breakMs: 10 * 60_000, longBreakMs: null, cycle: 1 }

beforeEach(async () => {
  await db.presets.clear()
})

describe('preset Custom', () => {
  it('nama sama menimpa baris yang ada (alur edit), daftar tetap satu', async () => {
    const first = await savePreset({ name: 'Pagi', ...base })
    const second = await savePreset({ name: 'Pagi', ...base, focusMs: 50 * 60_000 })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) throw new Error('gagal')
    expect(second.row.id).toBe(first.row.id)

    const rows = await listPresets()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.focusMs).toBe(50 * 60_000)
  })

  it('nama baru menambah; lewat 10 ditolak, bukan dibuang diam-diam', async () => {
    for (let index = 0; index < MAX_PRESETS; index += 1) {
      const result = await savePreset({ name: `preset-${index}`, ...base })
      expect(result.ok).toBe(true)
    }

    const extra = await savePreset({ name: 'ke-sebelas', ...base })
    expect(extra).toEqual({ ok: false, reason: 'kapasitas' })
    expect(await listPresets()).toHaveLength(MAX_PRESETS)
  })

  it('preset lama tanpa createdAt tetap tampil di daftar', async () => {
    await db.presets.put({ id: 'lama', name: 'Lama', focusMs: 25 * 60_000, breakMs: 5 * 60_000 })
    await savePreset({ name: 'Baru', ...base })

    const rows = await listPresets()
    expect(rows.map((row) => row.name).sort()).toEqual(['Baru', 'Lama'])
  })

  it('hapus preset', async () => {
    const saved = await savePreset({ name: 'Sebentar', ...base })
    if (!saved.ok) throw new Error('gagal')
    await removePreset(saved.row.id)
    expect(await listPresets()).toHaveLength(0)
  })
})
