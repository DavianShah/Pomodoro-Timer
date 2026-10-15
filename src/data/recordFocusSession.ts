/**
 * Focus session recorder: the bridge from timer engine transitions
 * (src/timer) to the Dexie tables (src/data). A failure here must never
 * disturb the timer — every error is caught and the session is lost with a
 * note in the console.
 */
import type { BlockRow, SessionRow } from '@/db/db'
import { read } from '@/lib/storage'
import { SETTINGS_KEY } from '@/app/constants'
import { parseSettings, type AppSettings } from '@/state/settings'
import { useTasks } from '@/state/tasks'
import { useBlocks } from '@/state/blocks'
import type { TimerState } from '@/timer/engine'
import { blockEndingAt } from '@/timer/blocks'
import { MINUTE, methodById } from '@/timer/methods'
import { buildFocusSession, localDateKey, type FocusEndAction } from '@/timer/sessionRecord'
import { listBlocks, putBlocks } from './blocks'
import { putFocusSession } from './sessions'

/**
 * The active task and Custom preset are read from localStorage when the
 * session ends — synchronously, without waiting on React: "what was active
 * when the session ended", including on the restore path after a reload
 * (settings.load() may not have finished yet).
 */
export function readLocalSettings(): AppSettings {
  return parseSettings(read<unknown>(SETTINGS_KEY, null))
}

export function readActiveTaskId(): string | null {
  return readLocalSettings().activeTaskId
}

/** Record the end of a focus session. Returns the stored row, or null. */
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
      // The block is looked up by its own row date — a 24:00 end falls on the next day.
      const rows = await listBlocks(localDateKey(prev.endTime - 1))
      block = blockEndingAt(rows, prev.endTime)
      if (block !== null) {
        boxing = { plannedMs: (block.endMin - block.startMin) * MINUTE }
        taskId = block.taskId ?? taskId
      }
    }
    session = buildFocusSession({
      prev,
      action,
      now,
      taskId,
      boxing,
      methodLabel:
        prev.method === 'custom' ? (readLocalSettings().custom?.presetName ?? null) : null,
    })
    if (session === null) return null
    await putFocusSession(session)
    // The block is recorded too: finished = done, cancelled (reset) = planned again.
    if (block !== null) {
      await putBlocks([{ ...block, status: session.completed ? 'done' : 'planned' }])
    }
  } catch (error) {
    console.warn('Ritme: failed to record session', error)
    return null
  }
  // Per-task session counts and on-screen block status refresh too.
  void useTasks.getState().refresh()
  if (block !== null) void useBlocks.getState().refresh()
  return session
}
