/**
 * Simpan/pulih TimerState ke localStorage (PRD F8). Penyimpanan terjadi di
 * setiap transisi state, bukan setiap tick. Pulih senyap: endTime yang sudah
 * lewat dianggap sesi selesai tanpa alarm — alarm urusan F5, bukan pemulihan.
 */

import { STORAGE_VERSION } from '@/app/constants'
import { read, write } from '@/lib/storage'
import { createTimer, plannedPhaseMs, tick, type TimerState } from './engine'
import { methodById } from './methods'
import type { Phase } from '@/db/db'

const STORAGE_NAME = 'timer'

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isPhase = (value: unknown): value is Phase =>
  value === 'focus' || value === 'break' || value === 'longBreak'

/** true bila objek memiliki bentuk TimerState yang utuh dan bertipe benar. */
export function isTimerShape(value: unknown): value is TimerState {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.method === 'string' &&
    isPhase(record.phase) &&
    typeof record.running === 'boolean' &&
    Number.isInteger(record.cycleIndex) &&
    (record.cycleIndex as number) >= 1 &&
    (record.endTime === null || isFiniteNumber(record.endTime)) &&
    (record.remainingMs === null || isFiniteNumber(record.remainingMs)) &&
    isFiniteNumber(record.elapsedMs) &&
    (record.startedAt === null || isFiniteNumber(record.startedAt))
  )
}

export function saveTimer(state: TimerState): void {
  write(STORAGE_NAME, STORAGE_VERSION, state)
}

/**
 * Pulihkan timer dari nilai mentah hasil penyimpanan.
 *
 * - berjalan + endTime masih depan → lanjut dari sisa waktu;
 * - berjalan + endTime sudah lewat → sesi selesai, tanpa alarm;
 * - Time Boxing: endTime = akhir blok, tetap tersimpan (penanda prompt);
 * - jaga → pulih apa adanya;
 * - data rusak / tidak konsisten → state awal, tanpa crash.
 */
export function restoreTimer(value: unknown, now: number): TimerState {
  if (!isTimerShape(value)) return createTimer('pomodoro')

  const method = methodById(value.method)
  const base: TimerState = { ...value, method: method.id }

  if (base.running && method.mode === 'countdown') {
    if (base.endTime !== null) {
      // tick menerapkan "sudah lewat" tanpa efek samping — senyap.
      return tick({ ...base, remainingMs: null }, now)
    }
    // Berjalan tanpa endTime: data tidak konsisten → jadikan jaga.
    return pausedFallback(base, method.id)
  }

  if (base.running && method.mode === 'boxing') {
    if (base.endTime !== null) {
      // tick menerapkan "blok sudah lewat" → complete; endTime jadi penanda.
      return tick({ ...base, remainingMs: null }, now)
    }
    // Berjalan tanpa akhir blok: data tidak konsisten → jadikan jaga.
    return pausedFallback(base, method.id)
  }

  if (
    base.running &&
    method.mode === 'countup' &&
    base.phase === 'focus' &&
    base.startedAt !== null
  ) {
    // Hitung maju: elapsed = akumulasi + waktu sejak mulai, tidak negatif.
    return { ...base, endTime: null, startedAt: Math.min(base.startedAt, now) }
  }

  if (base.running) return pausedFallback(base, method.id)

  const idle: TimerState = {
    ...base,
    running: false,
    endTime: method.mode === 'boxing' ? base.endTime : null,
    startedAt: null,
    elapsedMs: Math.max(0, base.elapsedMs),
  }
  if (idle.remainingMs === null) {
    idle.remainingMs = plannedPhaseMs(idle.method, idle.phase)
  }
  return { ...idle, remainingMs: Math.max(0, idle.remainingMs) }
}

/** Baca dari penyimpanan lalu pulihkan; nilai rusak/tidak ada → state awal. */
export function loadTimer(now: number): TimerState {
  return restoreTimer(read<unknown>(STORAGE_NAME, null), now)
}

function pausedFallback(base: TimerState, methodId: string): TimerState {
  const remaining =
    base.remainingMs !== null && base.remainingMs >= 0
      ? base.remainingMs
      : plannedPhaseMs(methodId, base.phase)
  return {
    ...base,
    method: methodId,
    running: false,
    endTime: null,
    startedAt: null,
    remainingMs: remaining,
  }
}
