/**
 * Task repository (PRD section 9). The only place components/stores touch
 * the `tasks` table, through these functions — Dexie is never called from
 * the UI. Every function throws when IndexedDB fails; failure handling
 * lives in the caller (the store), not here.
 */
import { db, type TaskRow } from '@/db/db'

export async function listTasks(): Promise<TaskRow[]> {
  return db.tasks.orderBy('createdAt').toArray()
}

export async function addTask(title: string, now = Date.now()): Promise<TaskRow> {
  const task: TaskRow = { id: crypto.randomUUID(), title, createdAt: now, sessionCount: 0 }
  await db.tasks.add(task)
  return task
}

export async function renameTask(id: string, title: string): Promise<void> {
  await db.tasks.update(id, { title })
}

/** Mark done (`doneAt`) or make active again (`null`). */
export async function setTaskDone(id: string, doneAt: number | null): Promise<void> {
  await db.tasks.update(id, { doneAt: doneAt ?? undefined })
}

export async function removeTask(id: string): Promise<void> {
  await db.tasks.delete(id)
}
