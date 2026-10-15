import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as AlarmModule from './alarm'
import { TONE_CONFIGS, type AlarmSound } from './alarm'
import type * as AmbientModule from './ambient'
import { AMBIENT_CONFIGS } from './ambient'

/** Stub Web Audio minimal: cukup untuk merangkai loop ambient. */
class FakeAudioContext {
  state = 'running'
  currentTime = 0
  sampleRate = 8000
  destination = { id: 'destination' }

  createBuffer(_channels: number, length: number, sampleRate: number) {
    return {
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length),
    }
  }
  createBufferSource() {
    return {
      buffer: null as unknown,
      loop: false,
      connect: (next: unknown) => next,
      disconnect: () => undefined,
      start: vi.fn(),
      stop: vi.fn(),
    }
  }
  createBiquadFilter() {
    return {
      type: 'lowpass',
      frequency: { value: 0 },
      Q: { value: 0 },
      connect: (next: unknown) => next,
      disconnect: () => undefined,
    }
  }
  createGain() {
    return {
      gain: {
        value: 0,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
      },
      connect: (next: unknown) => next,
      disconnect: () => undefined,
    }
  }
  createOscillator() {
    return {
      frequency: { value: 0, setValueAtTime: vi.fn() },
      connect: (next: unknown) => next,
      disconnect: () => undefined,
      start: vi.fn(),
      stop: vi.fn(),
    }
  }
}

describe('konfigurasi suara', () => {
  it('setiap nada alarm punya bunyi yang bisa dibunyikan', () => {
    for (const sound of Object.keys(TONE_CONFIGS) as AlarmSound[]) {
      expect(TONE_CONFIGS[sound].count).toBeGreaterThan(0)
      expect(TONE_CONFIGS[sound].peak).toBeGreaterThan(0)
    }
  })

  it('setiap ambient punya gain dan filter valid', () => {
    for (const config of Object.values(AMBIENT_CONFIGS)) {
      expect(config.gain).toBeGreaterThan(0)
      expect(config.frequency).toBeGreaterThan(0)
    }
  })
})

describe('ambient tanpa audio context', () => {
  it('start/stop/volume aman dan tidak berbunyi', async () => {
    vi.resetModules()
    const ambient = await import('./ambient')
    expect(() => {
      ambient.startAmbient('hujan')
      ambient.setAmbientVolume(0.5)
      ambient.stopAmbient()
    }).not.toThrow()
    expect(ambient.getAmbientSound()).toBe('off')
  })
})

describe('ambient dengan audio siap', () => {
  let alarm: typeof AlarmModule
  let ambient: typeof AmbientModule

  beforeEach(async () => {
    vi.resetModules()
    globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext
    alarm = await import('./alarm')
    alarm.unlockAlarm()
    ambient = await import('./ambient')
    expect(alarm.getAlarmState()).toBe('ready')
  })

  afterEach(() => {
    ambient.stopAmbient()
    vi.resetModules()
  })

  it('memutar, mengganti, dan menghentikan loop', () => {
    expect(ambient.getAmbientSound()).toBe('off')

    ambient.startAmbient('hujan')
    expect(ambient.getAmbientSound()).toBe('hujan')

    ambient.startAmbient('brown')
    expect(ambient.getAmbientSound()).toBe('brown')

    ambient.startAmbient('off')
    expect(ambient.getAmbientSound()).toBe('off')
  })

  it('volume dijepit dan playAlarm tidak melempar untuk tiap nada', () => {
    ambient.startAmbient('kipas')
    ambient.setAmbientVolume(2)
    ambient.setAmbientVolume(-1)
    expect(() => {
      alarm.playAlarm('bip')
      alarm.playAlarm('lembut')
      alarm.playAlarm('rendah')
    }).not.toThrow()
  })
})
