/**
 * Pencatat sesi fokus: jembatan dari transisi mesin timer (src/timer) ke
 * tabel Dexie (src/data). Gagal di sini tidak boleh mengganggu timer —
 * semua error ditangkap dan sesi hilang dengan catatan di console.
 */
import type { BlockRow, SessionRow } from '@/db/db'
import { read } from '@/lib/storage'
import { SETTINGS_KEY } from '@/app/constants'
import { parseSettings } from '@/state/settings'
import { useTasks } from '@/state/tasks'
import { useBlocks } from '@/state/blocks'
import type { TimerState } from '@/timer/engine'
import { blockEndingAt } from '@/timer/blocks'
import { MINUTE, methodById } from '@/timer/methods'
import { buildFocusSession, localDateKey, type FocusEndAction } from '@/timer/sessionRecord'
import { listBlocks, putBlocks } from './blocks'
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
  const isBoxing = methodById(prev.method).mode === 'boxing'
  let session: SessionRow | null
  let block: BlockRow | null = null
  try {
    let boxing: { plannedMs: number } | null = null
    let taskId = readActiveTaskId()
    if (isBoxing && prev.endTime !== null) {
      // Blok dicari di tanggal barisnya — akhir 24.00 jatuh ke hari berikutnya.
      const rows = await listBlocks(localDateKey(prev.endTime - 1))
      block = blockEndingAt(rows, prev.endTime)
      if (block !== null) {
        boxing = { plannedMs: (block.endMin - block.startMin) * MINUTE }
        taskId = block.taskId ?? taskId
      }
    }
    session = buildFocusSession({ prev, action, now, taskId, boxing })
    if (session === null) return null
    await putFocusSession(session)
    // Blok ikut tercatat: selesai = done, batal (reset) = planned kembali.
    if (block !== null) {
      await putBlocks([{ ...block, status: session.completed ? 'done' : 'planned' }])
    }
  } catch (error) {
    console.warn('Ritme: sesi gagal dicatat', error)
    return null
  }
  // Hitungan sesi per task dan status blok di layar ikut segar.
  void useTasks.getState().refresh()
  if (block !== null) void useBlocks.getState().refresh()
  return session
}
