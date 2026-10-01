import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/db'
import { addTask, listTasks, removeTask, renameTask, setTaskDone } from './tasks'

beforeEach(async () => {
  await db.tasks.clear()
  await db.sessions.clear()
})

describe('repository task (Dexie)', () => {
  it('tambah task: id, sessionCount 0, list urut createdAt', async () => {
    const second = await addTask('Kedua', 2000)
    const first = await addTask('Pertama', 1000)

    expect(first.id).toBeTypeOf('string')
    expect(first.sessionCount).toBe(0)

    const list = await listTasks()
    expect(list.map((task) => task.title)).toEqual(['Pertama', 'Kedua'])
    expect(list[0]?.id).toBe(first.id)
    expect(list[1]?.id).toBe(second.id)
  })

  it('ubah judul', async () => {
    const task = await addTask('Draf', 1)
    await renameTask(task.id, 'Draf final')
    expect((await db.tasks.get(task.id))?.title).toBe('Draf final')
  })

  it('tandai selesai lalu aktifkan lagi: doneAt hilang dari baris', async () => {
    const task = await addTask('Uji', 1)

    await setTaskDone(task.id, 123_456)
    expect((await db.tasks.get(task.id))?.doneAt).toBe(123_456)

    await setTaskDone(task.id, null)
    expect((await db.tasks.get(task.id))?.doneAt).toBeUndefined()
  })

  it('hapus task', async () => {
    const task = await addTask('Buang', 1)
    await removeTask(task.id)
    expect(await db.tasks.get(task.id)).toBeUndefined()
    expect(await listTasks()).toEqual([])
  })
})
