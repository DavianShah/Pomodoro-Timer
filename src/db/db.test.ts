import 'fake-indexeddb/auto'
import Dexie, { type EntityTable } from 'dexie'
import { expect, it } from 'vitest'
import { db } from './db'

type OldPreset = { id: string; name: string; focusMs: number; breakMs: number }

/**
 * v3 → v4 migration: old preset rows (without createdAt) survive and stay
 * readable; new rows enter the createdAt index.
 */
it('v4 schema: v3 presets survive, createdAt follows', async () => {
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
  await old.presets.put({ id: 'old', name: 'Morning', focusMs: 40 * 60_000, breakMs: 10 * 60_000 })
  old.close()

  await db.open()
  expect(db.verno).toBe(4)

  const survived = await db.presets.get('old')
  expect(survived?.name).toBe('Morning')

  await db.presets.put({
    id: 'new',
    name: 'Evening',
    focusMs: 50 * 60_000,
    breakMs: 10 * 60_000,
    createdAt: 123,
  })
  const all = await db.presets.toArray()
  expect(all.map((row) => row.id).sort()).toEqual(['new', 'old'])
  expect(all.find((row) => row.id === 'new')?.createdAt).toBe(123)
})
