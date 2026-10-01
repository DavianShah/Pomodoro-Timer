import 'fake-indexeddb/auto'
import Dexie, { type EntityTable } from 'dexie'
import { expect, it } from 'vitest'
import { db } from './db'

type OldPreset = { id: string; name: string; focusMs: number; breakMs: number }

/**
 * Migrasi v3 → v4: baris preset lama (tanpa createdAt) selamat dan tetap
 * terbaca; baris baru masuk indeks createdAt.
 */
it('skema v4: preset v3 selamat, createdAt menyusul', async () => {
  const old = new Dexie('ritme') as Dexie & {
    presets: EntityTable<OldPreset, 'id'>
    sessions: EntityTable<never, 'id'>
    tasks: EntityTable<never, 'id'>
    blocks: EntityTable<never, 'id'>
    settings: EntityTable<never, 'id'>
  }
  old.version(1).stores({
    sessions: 'id, startedAt, method, taskId, kind',
    tasks: 'id, createdAt, doneAt',
    blocks: 'id, date, startMin, [date+startMin]',
    presets: 'id, name',
    settings: 'id',
  })
  old.version(2).stores({
    sessions: 'id, startedAt, method, taskId, kind, date',
  })
  old.version(3).stores({
    blocks: 'id, date, startMin, [date+startMin]',
  })
  await old.open()
  await old.presets.put({ id: 'lama', name: 'Pagi', focusMs: 40 * 60_000, breakMs: 10 * 60_000 })
  old.close()

  await db.open()
  expect(db.verno).toBe(4)

  const survived = await db.presets.get('lama')
  expect(survived?.name).toBe('Pagi')

  await db.presets.put({
    id: 'baru',
    name: 'Malam',
    focusMs: 50 * 60_000,
    breakMs: 10 * 60_000,
    createdAt: 123,
  })
  const all = await db.presets.toArray()
  expect(all.map((row) => row.id).sort()).toEqual(['baru', 'lama'])
  expect(all.find((row) => row.id === 'baru')?.createdAt).toBe(123)
})
