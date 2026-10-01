/** Label tampilan berbahasa Indonesia untuk timer (dipakai layar dan judul tab). */

import { formatClock, type TimerState } from './engine'
import type { RunnableMethod } from './methods'
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
