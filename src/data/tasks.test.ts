import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/db'
import { addTask, listTasks, removeTask, renameTask, setTaskDone } from './tasks'

beforeEach(async () => {
  await db.tasks.clear()
  await db.sessions.clear()
})

describe('task repository (Dexie)', () => {
  it('add task: id, sessionCount 0, list ordered by createdAt', async () => {
    const second = await addTask('Second', 2000)
    const first = await addTask('First', 1000)

    expect(first.id).toBeTypeOf('string')
    expect(first.sessionCount).toBe(0)

    const list = await listTasks()
    expect(list.map((task) => task.title)).toEqual(['First', 'Second'])
    expect(list[0]?.id).toBe(first.id)
    expect(list[1]?.id).toBe(second.id)
  })

  it('renames the title', async () => {
    const task = await addTask('Draft', 1)
    await renameTask(task.id, 'Draft final')
    expect((await db.tasks.get(task.id))?.title).toBe('Draft final')
  })

  it('mark done then active again: doneAt disappears from the row', async () => {
    const task = await addTask('Test', 1)

    await setTaskDone(task.id, 123_456)
    expect((await db.tasks.get(task.id))?.doneAt).toBe(123_456)

    await setTaskDone(task.id, null)
    expect((await db.tasks.get(task.id))?.doneAt).toBeUndefined()
  })

  it('removes a task', async () => {
    const task = await addTask('Discard', 1)
    await removeTask(task.id)
    expect(await db.tasks.get(task.id)).toBeUndefined()
    expect(await listTasks()).toEqual([])
  })
})
