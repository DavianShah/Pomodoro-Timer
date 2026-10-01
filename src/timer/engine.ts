/**
 * Mesin timer murni. Semua transisi menerima `now` (epoch ms) sehingga bisa
 * diuji dengan fake timers. Waktu selalu diturunkan dari `endTime` (timestamp),
 * bukan akumulasi tick — aman terhadap sleep/tab background (PRD F1).
 *
 * Metode = konfigurasi data (`methods.ts`); tidak ada if/else per metode di sini.
 */

import type { Phase } from '@/db/db'
import { breakForFocus, methodById } from './methods'

export interface TimerState {
  /** Id konfigurasi metode yang sedang dipakai. */
  method: string
  phase: Phase
  running: boolean
  /** Posisi sesi dalam siklus, 1-based. */
  cycleIndex: number
  /** Countdown yang sedang berjalan: akhir fase dalam epoch ms. */
  endTime: number | null
  /** Countdown yang tidak berjalan: sisa waktu fase ini. */
  remainingMs: number | null
  /** Hitung maju (Flowtime): akumulasi waktu fokus. */
  elapsedMs: number
  /** Hitung maju yang sedang berjalan: saat mulai. */
  startedAt: number | null
}

/** Rencana durasi fase untuk konfigurasi countdown. */
export function plannedPhaseMs(methodId: string, phase: Phase): number {
  const method = methodById(methodId)
  if (method.mode !== 'countdown') return 0
  if (phase === 'focus') return method.focusMs
  if (phase === 'longBreak') return method.longBreakMs ?? method.breakMs
  return method.breakMs
}

export function createTimer(methodId: string): TimerState {
  const method = methodById(methodId)
  return {
    method: method.id,
    phase: 'focus',
    running: false,
    cycleIndex: 1,
    endTime: null,
    remainingMs: method.mode === 'countdown' ? method.focusMs : 0,
    elapsedMs: 0,
    startedAt: null,
  }
}

export function start(state: TimerState, now: number): TimerState {
  if (state.running) return state
  const method = methodById(state.method)
  // Time Boxing: mulai hanya saat masih di dalam blok (endTime = akhir blok).
  if (method.mode === 'boxing') {
    if (state.endTime === null || state.endTime <= now) return state
    return { ...state, running: true, startedAt: now, remainingMs: null }
  }

  if (method.mode === 'countup' && state.phase === 'focus') {
    return { ...state, running: true, startedAt: now }
  }
  const remaining = state.remainingMs ?? plannedPhaseMs(state.method, state.phase)
  return { ...state, running: true, endTime: now + remaining, remainingMs: null }
}

export function pause(state: TimerState, now: number): TimerState {
  if (!state.running) return state
  // Time Boxing: blok berjalan mengikuti jam dinding — jeda tak berarti.
  if (methodById(state.method).mode === 'boxing') return state

  if (state.endTime !== null) {
    // Countdown: sisa dihitung ulang dari timestamp, bukan dari tick.
    return {
      ...state,
      running: false,
      endTime: null,
      remainingMs: Math.max(0, state.endTime - now),
    }
  }
  // Hitung maju: akumulasikan lalu berhenti.
  const accumulated = state.elapsedMs + (state.startedAt !== null ? now - state.startedAt : 0)
  return { ...state, running: false, startedAt: null, elapsedMs: accumulated }
}

/**
 * Fase selesai (otomatis lewat `tick` atau manual lewat `skip`/`finish`).
 * Fase berikutnya selalu berdiri sebagai tidak berjalan; PRD bagian 5:
 * tombol utama berubah jadi "Mulai istirahat", bukan langsung jalan.
 */
function complete(state: TimerState, now: number): TimerState {
  const method = methodById(state.method)
  if (method.mode === 'boxing') {
    // Akhir blok: berhenti tanpa ganti fase; endTime dipertahankan sebagai
    // penanda "blok selesai" sampai user memilih keluar dari prompt.
    return { ...state, running: false, startedAt: null, elapsedMs: 0, remainingMs: null }
  }

  if (state.phase === 'focus') {
    const focusMs =
      method.mode === 'countup'
        ? state.elapsedMs + (state.startedAt !== null ? now - state.startedAt : 0)
        : method.focusMs
    const cycleDone =
      method.mode === 'countdown' && method.longBreakMs !== null && method.cycle > 1
        ? state.cycleIndex % method.cycle === 0
        : false
    const nextPhase: Phase = cycleDone ? 'longBreak' : 'break'
    const breakMs =
      method.mode === 'countup'
        ? (breakForFocus(method, focusMs) ?? 0)
        : plannedPhaseMs(state.method, nextPhase)
    return {
      ...state,
      phase: nextPhase,
      running: false,
      endTime: null,
      startedAt: null,
      elapsedMs: 0,
      remainingMs: breakMs,
    }
  }

  // Dari istirahat kembali fokus; siklus melingkar.
  return {
    ...state,
    phase: 'focus',
    running: false,
    endTime: null,
    startedAt: null,
    elapsedMs: 0,
    remainingMs: plannedPhaseMs(state.method, 'focus'),
    cycleIndex: (state.cycleIndex % method.cycle) + 1,
  }
}

/** Pulse dari Worker: selesaikan countdown yang sudah lewat `endTime`. */
export function tick(state: TimerState, now: number): TimerState {
  if (state.running && state.endTime !== null && state.endTime <= now) {
    return complete(state, now)
  }
  return state
}

/**
 * Setel akhir blok Time Boxing (epoch ms). Hanya saat tidak berjalan — selama
 * sesi berjalan endTime adalah jangkar sesi. null = tidak ada blok aktif.
 */
export function setBoxingEnd(state: TimerState, endMs: number | null): TimerState {
  if (state.running || state.endTime === endMs) return state
  return { ...state, endTime: endMs, remainingMs: endMs === null ? 0 : null }
}

/** Lewati fase sekarang; untuk Time Boxing menutup blok yang berjalan. */
export function skip(state: TimerState, now: number): TimerState {
  return complete(state, now)
}

/** Reset ke awal metode. */
export function reset(state: TimerState): TimerState {
  return createTimer(state.method)
}

/** True bila transisi menutup sesi fokus: ganti fase, atau blok selesai (boxing). */
export function endsFocusSession(prev: TimerState, next: TimerState): boolean {
  if (prev.phase !== 'focus') return false
  if (prev.phase !== next.phase) return true
  return methodById(prev.method).mode === 'boxing' && prev.running && !next.running
}

/** Sisa waktu (countdown) untuk ditampilkan; 0 bila fase sudah berakhir. */
export function remaining(state: TimerState, now: number): number {
  if (state.endTime !== null) return Math.max(0, state.endTime - now)
  return state.remainingMs ?? 0
}

/** Durasi berjalan (hitung maju). Untuk countdown selalu 0. */
export function elapsed(state: TimerState, now: number): number {
  const method = methodById(state.method)
  if (method.mode !== 'countup' || state.phase !== 'focus') return 0
  return state.elapsedMs + (state.running && state.startedAt !== null ? now - state.startedAt : 0)
}

/**
 * Nilai jam layar. Hitung maju menampilkan elapsed; sisanya menampilkan sisa.
 */
export function displayMs(state: TimerState, now: number): number {
  const method = methodById(state.method)
  if (method.mode === 'countup' && state.phase === 'focus') return elapsed(state, now)
  return remaining(state, now)
}

/** Format `mm:ss` (menit tanpa batas, detik dua digit) — PRD bagian 7. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
