/** Display labels for the timer (used by screens and the tab title). */

import { formatClock, plannedPhaseMs, type TimerState } from './engine'
import { methodById, type RunnableMethod } from './methods'
import type { BlockRow, Phase } from '@/db/db'
import { currentBlock, formatBlockRange, formatMin, nextBlock } from './blocks'

export const APP_TITLE = 'Ritme'

export function phaseLabel(phase: Phase): string {
  if (phase === 'focus') return 'Focus'
  if (phase === 'break') return 'Break'
  return 'Long break'
}

/**
 * Status line under the clock. Methods without a fixed cycle (Flowtime,
 * 52/17, Ultradian, Custom) never show session position — only Pomodoro
 * has cycle > 1.
 */
export function sessionStatus(method: RunnableMethod, cycleIndex: number, phase: Phase): string {
  const parts = [phaseLabel(phase)]
  if (method.cycle > 1) parts.push(`Session ${cycleIndex} of ${method.cycle}`)
  return parts.join(' · ')
}

/**
 * Time Boxing status line: prompt marker, active block, or the next
 * block (PRD F16).
 */
export function boxingStatus(state: TimerState, blocks: BlockRow[], now: number): string {
  if (!state.running && state.endTime !== null && state.endTime <= now) return 'Block finished'
  const block = currentBlock(blocks, now)
  if (block !== null) return `Focus · ${formatBlockRange(block)}`
  const next = nextBlock(blocks, now)
  if (next !== null) return `No block now. Next: ${formatMin(next.startMin)}`
  return 'No next block'
}

/** Block-ended prompt: Time Boxing, idle, `endTime` already past (PRD F16). */
export function isBlockPrompt(state: TimerState, now: number): boolean {
  return (
    methodById(state.method).mode === 'boxing' &&
    !state.running &&
    state.endTime !== null &&
    state.endTime <= now
  )
}

/**
 * Primary button label (main screen and mini window share one source):
 * a running count-up offers "Finish", the break phase uses "Start break"
 * (PRD section 5).
 */
export function primaryLabel(state: TimerState): 'Start' | 'Start break' | 'Pause' | 'Finish' {
  const method = methodById(state.method)
  const endedByUser =
    (method.mode === 'countup' || method.mode === 'boxing') && state.phase === 'focus'
  if (endedByUser && state.running) return 'Finish'
  if (state.running) return 'Pause'
  return state.phase === 'focus' ? 'Start' : 'Start break'
}

/** Session progress 0-100: countdown from the planned phase or block length; count-up = 0. */
export function sessionProgress(state: TimerState, display: number, blockMs?: number): number {
  const method = methodById(state.method)
  const planned =
    method.mode === 'boxing' ? (blockMs ?? 0) : plannedPhaseMs(state.method, state.phase)
  if ((method.mode !== 'countdown' && method.mode !== 'boxing') || planned <= 0) return 0
  return Math.round((1 - Math.min(1, display / planned)) * 100)
}

/**
 * Tab title: a finished-session marker while the tab is hidden; the remaining
 * time while running; otherwise the app name (PRD F5).
 */
export function documentTitle(
  state: TimerState,
  display: number,
  completionMarker: string | null,
  hidden: boolean,
): string {
  if (completionMarker !== null && hidden) return `● ${completionMarker}`
  if (state.running) return `${formatClock(display)} · ${phaseLabel(state.phase)}`
  return APP_TITLE
}
