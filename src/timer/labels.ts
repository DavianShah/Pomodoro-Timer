/** Label tampilan berbahasa Indonesia untuk timer (dipakai layar dan judul tab). */

import { formatClock, plannedPhaseMs, type TimerState } from './engine'
import { methodById, type RunnableMethod } from './methods'
import type { BlockRow, Phase } from '@/db/db'
import { currentBlock, formatBlockRange, formatMin, nextBlock } from './blocks'

export const APP_TITLE = 'Ritme'

export function phaseLabel(phase: Phase): string {
  if (phase === 'focus') return 'Fokus'
  if (phase === 'break') return 'Istirahat'
  return 'Istirahat panjang'
}

/**
 * Baris status di bawah jam. Metode tanpa siklus tetap (Flowtime, 52/17,
 * Ultradian, Custom) tidak pernah menampilkan posisi sesi — hanya Pomodoro
 * yang cycle-nya > 1.
 */
export function sessionStatus(method: RunnableMethod, cycleIndex: number, phase: Phase): string {
  const parts = [phaseLabel(phase)]
  if (method.cycle > 1) parts.push(`Sesi ${cycleIndex} dari ${method.cycle}`)
  return parts.join(' · ')
}

/**
 * Baris status Time Boxing: penanda prompt, blok aktif, atau blok
 * berikutnya (PRD F16).
 */
export function boxingStatus(state: TimerState, blocks: BlockRow[], now: number): string {
  if (!state.running && state.endTime !== null && state.endTime <= now) return 'Blok selesai'
  const block = currentBlock(blocks, now)
  if (block !== null) return `Fokus · ${formatBlockRange(block)}`
  const next = nextBlock(blocks, now)
  if (next !== null) return `Tidak ada blok sekarang. Berikutnya: ${formatMin(next.startMin)}`
  return 'Tidak ada blok berikutnya'
}

/** Prompt blok berakhir: Time Boxing, idle, `endTime` sudah lewat (PRD F16). */
export function isBlockPrompt(state: TimerState, now: number): boolean {
  return (
    methodById(state.method).mode === 'boxing' &&
    !state.running &&
    state.endTime !== null &&
    state.endTime <= now
  )
}

/**
 * Label tombol utama (layar utama dan jendela mini memakai satu sumber):
 * hitung maju yang berjalan menawarkan "Selesai", fase istirahat memakai
 * "Mulai istirahat" (PRD bagian 5).
 */
export function primaryLabel(state: TimerState): 'Mulai' | 'Mulai istirahat' | 'Jeda' | 'Selesai' {
  const method = methodById(state.method)
  const endedByUser =
    (method.mode === 'countup' || method.mode === 'boxing') && state.phase === 'focus'
  if (endedByUser && state.running) return 'Selesai'
  if (state.running) return 'Jeda'
  return state.phase === 'focus' ? 'Mulai' : 'Mulai istirahat'
}

/** Progres sesi 0-100: hitung mundur dari rencana fase atau panjang blok; hitung maju = 0. */
export function sessionProgress(state: TimerState, display: number, blockMs?: number): number {
  const method = methodById(state.method)
  const planned =
    method.mode === 'boxing' ? (blockMs ?? 0) : plannedPhaseMs(state.method, state.phase)
  if ((method.mode !== 'countdown' && method.mode !== 'boxing') || planned <= 0) return 0
  return Math.round((1 - Math.min(1, display / planned)) * 100)
}

/**
 * Judul tab: penanda sesi selesai selama tab masih tersembunyi; saat berjalan
 * menampilkan sisa waktu; selain itu nama aplikasi (PRD F5).
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
