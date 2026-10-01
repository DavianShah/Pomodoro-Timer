/** Label tampilan berbahasa Indonesia untuk timer (dipakai layar dan judul tab). */

import { formatClock, plannedPhaseMs, type TimerState } from './engine'
import { methodById, type RunnableMethod } from './methods'
import type { Phase } from '@/db/db'

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
 * Label tombol utama (layar utama dan jendela mini memakai satu sumber):
 * hitung maju yang berjalan menawarkan "Selesai", fase istirahat memakai
 * "Mulai istirahat" (PRD bagian 5).
 */
export function primaryLabel(state: TimerState): 'Mulai' | 'Mulai istirahat' | 'Jeda' | 'Selesai' {
  const countupFocus = methodById(state.method).mode === 'countup' && state.phase === 'focus'
  if (countupFocus && state.running) return 'Selesai'
  if (state.running) return 'Jeda'
  return state.phase === 'focus' ? 'Mulai' : 'Mulai istirahat'
}

/** Progres sesi 0-100: hitung mundur dari rencana fase; hitung maju selalu 0 (PRD bagian 7). */
export function sessionProgress(state: TimerState, display: number): number {
  const planned = plannedPhaseMs(state.method, state.phase)
  if (methodById(state.method).mode !== 'countdown' || planned <= 0) return 0
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
