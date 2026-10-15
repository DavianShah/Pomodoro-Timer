/**
 * Session-end alarm synthesized with Web Audio — no audio files.
 * The AudioContext is created/unlocked on the user's first interaction
 * (clicking Start). If the browser refuses the unlock, state becomes
 * 'blocked' and the screen shows a small indicator (PRD F5) — never a
 * silent failure.
 *
 * Alarm tones are data configuration (PRD F13): 'beep', 'soft', 'low'.
 * One AudioContext is shared with the ambient sound (`ambient.ts`).
 */

export type AlarmState = 'idle' | 'ready' | 'blocked'
export type AlarmSound = 'beep' | 'soft' | 'low'

interface ToneConfig {
  type: OscillatorType
  frequency: number
  /** Gain peak per beep. */
  peak: number
  /** Length of each beep (seconds). */
  duration: number
  /** Spacing between beeps (seconds). */
  spacing: number
  count: number
}

export const TONE_CONFIGS: Record<AlarmSound, ToneConfig> = {
  beep: { type: 'square', frequency: 880, peak: 0.12, duration: 0.18, spacing: 0.35, count: 3 },
  soft: { type: 'sine', frequency: 587.33, peak: 0.09, duration: 0.35, spacing: 0.45, count: 2 },
  low: {
    type: 'triangle',
    frequency: 349.23,
    peak: 0.12,
    duration: 0.25,
    spacing: 0.4,
    count: 3,
  },
}

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

/** Call from a user interaction handler (clicking Start). */
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

/** Shared AudioContext; null before the first unlock. */
export function getAudioContext(): AudioContext | null {
  return context
}

function beep(ctx: AudioContext, at: number, tone: ToneConfig): void {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = tone.type
  oscillator.frequency.setValueAtTime(tone.frequency, at)
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(tone.peak, at + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + tone.duration)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(at)
  oscillator.stop(at + tone.duration + 0.02)
}

/** Play the alarm for the chosen tone. Silent if audio is not unlocked yet. */
export function playAlarm(sound: AlarmSound = 'beep'): void {
  if (!context || context.state !== 'running') return
  const tone = TONE_CONFIGS[sound]
  const start = context.currentTime
  for (let index = 0; index < tone.count; index += 1) {
    beep(context, start + index * tone.spacing, tone)
  }
}
