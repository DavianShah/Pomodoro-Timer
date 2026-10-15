/**
 * Suara ambient (PRD F13): hujan, kipas, brown noise — disintesis dengan
 * Web Audio, tanpa berkas audio dan tanpa dependensi. Loop dimulai saat
 * timer berjalan dan berhenti saat jeda/selesai; satu sumber suara.
 *
 * Konfigurasi tiap jenis adalah data (filter + modulasi); menambah jenis
 * cukup menambah entri, pola yang sama dengan metode timer.
 */
import { getAudioContext } from './alarm'

export type AmbientSound = 'off' | 'hujan' | 'kipas' | 'brown'

export interface AmbientConfig {
  noise: 'white' | 'brown'
  filterType: BiquadFilterType
  frequency: number
  q: number
  /** Modulasi amplitudo lambat supaya tidak terdengar seperti statis. */
  lfoHz: number
  lfoDepth: number
  /** Gain dasar sebelum volume pengguna. */
  gain: number
}

export const AMBIENT_CONFIGS: Record<Exclude<AmbientSound, 'off'>, AmbientConfig> = {
  hujan: {
    noise: 'white',
    filterType: 'highpass',
    frequency: 500,
    q: 0.7,
    lfoHz: 0.15,
    lfoDepth: 0.1,
    gain: 0.35,
  },
  kipas: {
    noise: 'brown',
    filterType: 'lowpass',
    frequency: 420,
    q: 0.5,
    lfoHz: 0.07,
    lfoDepth: 0.08,
    gain: 0.9,
  },
  brown: {
    noise: 'brown',
    filterType: 'lowpass',
    frequency: 900,
    q: 0.5,
    lfoHz: 0,
    lfoDepth: 0,
    gain: 0.9,
  },
}

export const DEFAULT_AMBIENT_VOLUME = 0.4

let source: AudioBufferSourceNode | null = null
let gainNode: GainNode | null = null
let lfo: OscillatorNode | null = null
let current: AmbientSound = 'off'
let baseGain = 1
let volume = DEFAULT_AMBIENT_VOLUME
let whiteBuffer: AudioBuffer | null = null
let brownBuffer: AudioBuffer | null = null

function noiseBuffer(ctx: AudioContext, kind: 'white' | 'brown'): AudioBuffer {
  const cached = kind === 'white' ? whiteBuffer : brownBuffer
  if (cached !== null) return cached
  // Empat detik: cukup panjang supaya loop tidak terasa berulang.
  const length = Math.floor(ctx.sampleRate * 4)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let index = 0; index < length; index += 1) {
    const white = Math.random() * 2 - 1
    if (kind === 'white') {
      data[index] = white
    } else {
      // Random walk (integrasi white noise) = brown noise.
      last = (last + 0.02 * white) / 1.02
      data[index] = last * 3.5
    }
  }
  if (kind === 'white') whiteBuffer = buffer
  else brownBuffer = buffer
  return buffer
}

export function getAmbientSound(): AmbientSound {
  return current
}

/** Mulai/looping jenis ambient. 'off' = berhenti. Diam kalau audio terkunci. */
export function startAmbient(kind: AmbientSound): void {
  if (kind === 'off') {
    stopAmbient()
    return
  }
  const ctx = getAudioContext()
  if (!ctx || ctx.state !== 'running') return
  if (current === kind && source !== null) return
  stopAmbient()

  const config = AMBIENT_CONFIGS[kind]
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx, config.noise)
  src.loop = true

  const filter = ctx.createBiquadFilter()
  filter.type = config.filterType
  filter.frequency.value = config.frequency
  filter.Q.value = config.q

  const gain = ctx.createGain()
  baseGain = config.gain
  gain.gain.value = baseGain * volume

  src.connect(filter).connect(gain).connect(ctx.destination)

  if (config.lfoHz > 0) {
    const lfoOsc = ctx.createOscillator()
    lfoOsc.frequency.value = config.lfoHz
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = config.lfoDepth
    lfoOsc.connect(lfoGain).connect(gain.gain)
    lfoOsc.start()
    lfo = lfoOsc
  }

  src.start()
  source = src
  gainNode = gain
  current = kind
}

export function stopAmbient(): void {
  if (source !== null) {
    try {
      source.stop()
    } catch {
      // Sudah berhenti — bukan kesalahan.
    }
    source.disconnect()
  }
  lfo?.stop()
  lfo = null
  gainNode?.disconnect()
  gainNode = null
  source = null
  current = 'off'
}

/** Volume 0–1; perubahan langsung terasa saat bersuara (ramp pendek). */
export function setAmbientVolume(next: number): void {
  volume = Math.min(1, Math.max(0, next))
  const ctx = getAudioContext()
  if (gainNode !== null && ctx !== null) {
    gainNode.gain.setTargetAtTime(baseGain * volume, ctx.currentTime, 0.05)
  }
}
