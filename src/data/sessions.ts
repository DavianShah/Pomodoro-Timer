/**
 * Repository sesi fokus (PRD bagian 9).
 *
 * Idempotensi: `put` dengan id stabil — transisi yang sama yang terbaca
 * dua kali (mis. StrictMode/pemulihan ganda) menimpa baris yang sama,
 * bukan membuat duplikat. Jumlah sesi per task selalu DIHITUNG ULANG dari
 * tabel sessions, bukan ditambah, supaya tetap benar walau rekaman yang
 * sama masuk dua kali. Yang dihitung hanya `completed = true`.
 */
import { db, type SessionRow } from '@/db/db'

export async function putFocusSession(session: SessionRow): Promise<void> {
  await db.transaction('rw', db.sessions, db.tasks, async () => {
    await db.sessions.put(session)
    if (session.taskId === undefined) return
    const count = await db.sessions
      .where('taskId')
      .equals(session.taskId)
      .and((row) => row.completed)
      .count()
    await db.tasks.update(session.taskId, { sessionCount: count })
  })
}

/** Baca sesi lewat indeks `date` sampai (termasuk) kunci hari — rentang ke atas,
 * dipakai panel statistik (F10) tanpa memindai seluruh riwayat. */
export async function loadSessionsThrough(throughDate: string): Promise<SessionRow[]> {
  return db.sessions.where('date').belowOrEqual(throughDate).toArray()
}
