/**
 * Focus session repository (PRD section 9).
 *
 * Idempotency: `put` with a stable id — the same transition read twice
 * (e.g. StrictMode/double restore) overwrites the same row instead of
 * creating a duplicate. The per-task session count is always RECOMPUTED
 * from the sessions table, never incremented, so it stays correct even when
 * the same record arrives twice. Only `completed = true` rows are counted.
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

/** Read sessions via the `date` index up to (and including) the day key — an
 * upward range, used by the stats panel (F10) without scanning all history. */
export async function loadSessionsThrough(throughDate: string): Promise<SessionRow[]> {
  return db.sessions.where('date').belowOrEqual(throughDate).toArray()
}
