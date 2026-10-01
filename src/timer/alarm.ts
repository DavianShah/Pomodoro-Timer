/**
 * Alarm sesi selesai disintesis dengan Web Audio — tanpa berkas audio.
 * AudioContext dibuat/di-unlock pada interaksi pertama user (klik Mulai).
 * Kalau browser menolak unlock, state berubah ke 'blocked' dan layar
 * menampilkan indikator kecil (PRD F5) — bukan kegagalan diam-diam.
 */

export type AlarmState = 'idle' | 'ready' | 'blocked'

let context: AudioContext | null = null
let state: AlarmState = 'idle'
const listeners = new Set<() => void>()

export function getAlarmState(): AlarmState {
  return state
}

export function subscribeAlarm(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function setState(next: AlarmState): void {
  if (next === state) return
  state = next
  for (const listener of listeners) listener()
}

/** Panggil dari handler interaksi user (klik Mulai). */
export function unlockAlarm(): void {
  try {
    context ??= new AudioContext()
  } catch {
    setState('blocked')
    return
  }
  const ctx = context
  if (ctx.state === 'running') {
    setState('ready')
    return
  }
  void ctx.resume().then(
    () => setState(ctx.state === 'running' ? 'ready' : 'blocked'),
    () => setState('blocked'),
  )
}

function beep(ctx: AudioContext, at: number): void {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = 'square'
  oscillator.frequency.setValueAtTime(880, at)
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(at)
  oscillator.stop(at + 0.2)
}

/** Tiga bunyi pendek. Diam kalau audio belum ter-unlock. */
export function playAlarm(): void {
  if (!context || context.state !== 'running') return
  const start = context.currentTime
  beep(context, start)
  beep(context, start + 0.35)
  beep(context, start + 0.7)
}
