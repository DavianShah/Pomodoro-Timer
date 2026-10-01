/**
 * Pencatat sesi fokus: jembatan dari transisi mesin timer (src/timer) ke
 * tabel Dexie (src/data). Gagal di sini tidak boleh mengganggu timer —
 * semua error ditangkap dan sesi hilang dengan catatan di console.
 */
import type { SessionRow } from '@/db/db'
import { read } from '@/lib/storage'
import { SETTINGS_KEY } from '@/app/constants'
import { parseSettings } from '@/state/settings'
import { useTasks } from '@/state/tasks'
import type { TimerState } from '@/timer/engine'
import { buildFocusSession, type FocusEndAction } from '@/timer/sessionRecord'
import { putFocusSession } from './sessions'

/**
 * Task aktif dibaca dari localStorage saat sesi berakhir — sinkron, tanpa
 * menunggu React: "task yang aktif saat sesi berakhir", termasuk di jalur
 * pemulihan setelah reload (settings.load() mungkin belum selesai).
 */
export function readActiveTaskId(): string | null {
  return parseSettings(read<unknown>(SETTINGS_KEY, null)).activeTaskId
}

/** Catat ujung sesi fokus. Mengembalikan baris tersimpan, atau null. */
export async function recordFocusSession(
  prev: TimerState,
  action: FocusEndAction,
  now: number,
): Promise<SessionRow | null> {
  let session: SessionRow | null
  try {
    session = buildFocusSession({ prev, action, now, taskId: readActiveTaskId() })
    if (session === null) return null
    await putFocusSession(session)
  } catch (error) {
    console.warn('Ritme: sesi gagal dicatat', error)
    return null
  }
  // Hitungan sesi per task di layar ikut segar.
  void useTasks.getState().refresh()
  return session
}
