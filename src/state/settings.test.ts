import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_KEY, STORAGE_VERSION } from '@/app/constants'
import { db } from '@/db/db'
import { write } from '@/lib/storage'
import { DEFAULT_CUSTOM, MINUTE } from '@/timer/methods'
import { DEFAULT_AMBIENT_VOLUME } from '@/timer/ambient'
import { DEFAULT_SETTINGS, parseSettings, useSettings } from './settings'

describe('parse durasi dan Custom (PRD F3)', () => {
  it('override valid tersimpan; di luar rentang gugur ke bawaan', () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      durations: {
        pomodoro: { focusMs: 40 * MINUTE, breakMs: 10 * MINUTE },
        '52-17': { focusMs: 999 * MINUTE, breakMs: 10 * MINUTE },
        ultradian: { focusMs: 90 * MINUTE, breakMs: 'sepuluh' },
      },
    })

    expect(parsed.durations.pomodoro).toEqual({ focusMs: 40 * MINUTE, breakMs: 10 * MINUTE })
    expect(parsed.durations['52-17']).toBeUndefined()
    expect(parsed.durations.ultradian).toBeUndefined()
  })

  it('Custom korup → null (restore jatuh ke Pomodoro)', () => {
    expect(parseSettings({ ...DEFAULT_SETTINGS, custom: 'rusak' }).custom).toBeNull()
    expect(parseSettings({ ...DEFAULT_SETTINGS, custom: { focusMs: 0 } }).custom).toBeNull()
    expect(
      parseSettings({ ...DEFAULT_SETTINGS, custom: { ...DEFAULT_CUSTOM, focusMs: 999 * MINUTE } })
        .custom,
    ).toBeNull()
  })

  it('Custom absen (penyimpanan lama) → default; siklus 1 = tanpa siklus', () => {
    const plain = { theme: 'system', lastMethod: 'pomodoro' }
    expect(parseSettings(plain).custom).toEqual({ ...DEFAULT_CUSTOM, presetName: null })

    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      custom: { focusMs: 40 * MINUTE, breakMs: 8 * MINUTE, longBreakMs: null, cycle: 1 },
    })
    expect(parsed.custom).toEqual({
      focusMs: 40 * MINUTE,
      breakMs: 8 * MINUTE,
      longBreakMs: null,
      cycle: 1,
      presetName: null,
    })
  })

  it('Custom valid membawa nama preset', () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      custom: { ...DEFAULT_CUSTOM, presetName: 'Pulih' },
    })
    expect(parsed.custom?.presetName).toBe('Pulih')
  })
})

describe('parse suara dan ambient (PRD F13)', () => {
  it('nilai valid tersimpan apa adanya', () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      alarmSound: 'lembut',
      alarmEnabled: false,
      notifications: false,
      ambient: 'hujan',
      ambientVolume: 0.7,
    })
    expect(parsed.alarmSound).toBe('lembut')
    expect(parsed.alarmEnabled).toBe(false)
    expect(parsed.notifications).toBe(false)
    expect(parsed.ambient).toBe('hujan')
    expect(parsed.ambientVolume).toBe(0.7)
  })

  it('nilai rusak/tidak dikenal → bawaan', () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      alarmSound: 'gong',
      alarmEnabled: 'ya',
      notifications: 1,
      ambient: 'air',
      ambientVolume: 5,
    })
    expect(parsed.alarmSound).toBe('bip')
    expect(parsed.alarmEnabled).toBe(true)
    expect(parsed.notifications).toBe(true)
    expect(parsed.ambient).toBe('off')
    expect(parsed.ambientVolume).toBe(DEFAULT_AMBIENT_VOLUME)
  })

  it('penyimpanan lama tanpa field suara → default', () => {
    const parsed = parseSettings({ theme: 'dark', lastMethod: 'pomodoro' })
    expect(parsed.alarmSound).toBe('bip')
    expect(parsed.alarmEnabled).toBe(true)
    expect(parsed.notifications).toBe(true)
    expect(parsed.ambient).toBe('off')
    expect(parsed.ambientVolume).toBe(DEFAULT_AMBIENT_VOLUME)
  })
})

beforeEach(() => {
  localStorage.clear()
  useSettings.setState({
    settings: { ...DEFAULT_SETTINGS },
    settingsLoaded: false,
    databaseAvailable: true,
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('useSettings.load', () => {
  it('pilihan pengguna selama pemuatan tidak ditimpa nilai tersimpan', async () => {
    const loading = useSettings.getState().load()
    // Tema diklik sebelum IndexedDB selesai dibaca (balapan yang diuji e2e).
    useSettings.getState().setTheme('dark')
    await loading

    expect(useSettings.getState().settings.theme).toBe('dark')
    expect(useSettings.getState().settingsLoaded).toBe(true)
  })

  it('tanpa perubahan saat pemuatan, nilai tersimpan yang dipakai', async () => {
    useSettings.getState().setTheme('dark')
    useSettings.setState({ settings: { ...DEFAULT_SETTINGS }, settingsLoaded: false })

    await useSettings.getState().load()
    expect(useSettings.getState().settings.theme).toBe('dark')
  })

  it('pengaturan kosong/tidak utuh jatuh ke default', async () => {
    write(SETTINGS_KEY, STORAGE_VERSION, 'bukan-objek')
    await db.settings.delete('app')
    await useSettings.getState().load()
    expect(useSettings.getState().settings).toEqual(DEFAULT_SETTINGS)
  })
})

describe('setAmbientVolume', () => {
  it('dijepit ke rentang 0–1', () => {
    useSettings.getState().setAmbientVolume(2)
    expect(useSettings.getState().settings.ambientVolume).toBe(1)
    useSettings.getState().setAmbientVolume(-1)
    expect(useSettings.getState().settings.ambientVolume).toBe(0)
  })
})
