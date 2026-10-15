import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_KEY, STORAGE_VERSION } from '@/app/constants'
import { db } from '@/db/db'
import { write } from '@/lib/storage'
import { DEFAULT_CUSTOM, MINUTE } from '@/timer/methods'
import { DEFAULT_AMBIENT_VOLUME } from '@/timer/ambient'
import { DEFAULT_SETTINGS, parseSettings, useSettings } from './settings'

describe('parse durations and Custom (PRD F3)', () => {
  it('valid overrides are kept; out-of-range falls back to default', () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      durations: {
        pomodoro: { focusMs: 40 * MINUTE, breakMs: 10 * MINUTE },
        '52-17': { focusMs: 999 * MINUTE, breakMs: 10 * MINUTE },
        ultradian: { focusMs: 90 * MINUTE, breakMs: 'ten' },
      },
    })

    expect(parsed.durations.pomodoro).toEqual({ focusMs: 40 * MINUTE, breakMs: 10 * MINUTE })
    expect(parsed.durations['52-17']).toBeUndefined()
    expect(parsed.durations.ultradian).toBeUndefined()
  })

  it('corrupt Custom → null (restore falls back to Pomodoro)', () => {
    expect(parseSettings({ ...DEFAULT_SETTINGS, custom: 'broken' }).custom).toBeNull()
    expect(parseSettings({ ...DEFAULT_SETTINGS, custom: { focusMs: 0 } }).custom).toBeNull()
    expect(
      parseSettings({ ...DEFAULT_SETTINGS, custom: { ...DEFAULT_CUSTOM, focusMs: 999 * MINUTE } })
        .custom,
    ).toBeNull()
  })

  it('missing Custom (old storage) → default; cycle 1 = no cycle', () => {
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

  it('a valid Custom carries the preset name', () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      custom: { ...DEFAULT_CUSTOM, presetName: 'Recovery' },
    })
    expect(parsed.custom?.presetName).toBe('Recovery')
  })
})

describe('parse sound and ambient (PRD F13)', () => {
  it('valid values are kept as-is', () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      alarmSound: 'soft',
      alarmEnabled: false,
      notifications: false,
      ambient: 'rain',
      ambientVolume: 0.7,
    })
    expect(parsed.alarmSound).toBe('soft')
    expect(parsed.alarmEnabled).toBe(false)
    expect(parsed.notifications).toBe(false)
    expect(parsed.ambient).toBe('rain')
    expect(parsed.ambientVolume).toBe(0.7)
  })

  it('broken/unknown values → defaults', () => {
    const parsed = parseSettings({
      ...DEFAULT_SETTINGS,
      alarmSound: 'gong',
      alarmEnabled: 'yes',
      notifications: 1,
      ambient: 'water',
      ambientVolume: 5,
    })
    expect(parsed.alarmSound).toBe('beep')
    expect(parsed.alarmEnabled).toBe(true)
    expect(parsed.notifications).toBe(true)
    expect(parsed.ambient).toBe('off')
    expect(parsed.ambientVolume).toBe(DEFAULT_AMBIENT_VOLUME)
  })

  it('old storage without sound fields → default', () => {
    const parsed = parseSettings({ theme: 'dark', lastMethod: 'pomodoro' })
    expect(parsed.alarmSound).toBe('beep')
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
  it('a user choice during loading is not overwritten by the stored value', async () => {
    const loading = useSettings.getState().load()
    // The theme is clicked before IndexedDB finishes reading (the race the e2e tests cover).
    useSettings.getState().setTheme('dark')
    await loading

    expect(useSettings.getState().settings.theme).toBe('dark')
    expect(useSettings.getState().settingsLoaded).toBe(true)
  })

  it('no change during loading: the stored value wins', async () => {
    useSettings.getState().setTheme('dark')
    useSettings.setState({ settings: { ...DEFAULT_SETTINGS }, settingsLoaded: false })

    await useSettings.getState().load()
    expect(useSettings.getState().settings.theme).toBe('dark')
  })

  it('empty/partial settings fall back to defaults', async () => {
    write(SETTINGS_KEY, STORAGE_VERSION, 'not-an-object')
    await db.settings.delete('app')
    await useSettings.getState().load()
    expect(useSettings.getState().settings).toEqual(DEFAULT_SETTINGS)
  })
})

describe('setAmbientVolume', () => {
  it('is clamped to the 0–1 range', () => {
    useSettings.getState().setAmbientVolume(2)
    expect(useSettings.getState().settings.ambientVolume).toBe(1)
    useSettings.getState().setAmbientVolume(-1)
    expect(useSettings.getState().settings.ambientVolume).toBe(0)
  })
})
