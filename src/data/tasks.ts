/**
 * Repository task (PRD bagian 9). Satu-satunya tempat komponen/store
 * berurutan dengan tabel `tasks` lewat fungsi ini — Dexie tidak dipanggil
 * dari UI. Semua fungsi melempar error saat IndexedDB gagal; penanganan
 * gagal ada di pemanggil (store), bukan di sini.
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

/** Tandai selesai (`doneAt`) atau kembalikan jadi aktif (`null`). */
export async function setTaskDone(id: string, doneAt: number | null): Promise<void> {
  await db.tasks.update(id, { doneAt: doneAt ?? undefined })
}

export async function removeTask(id: string): Promise<void> {
  await db.tasks.delete(id)
}
