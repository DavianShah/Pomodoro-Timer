import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_KEY, STORAGE_VERSION } from '@/app/constants'
import { db } from '@/db/db'
import { write } from '@/lib/storage'
import { DEFAULT_CUSTOM, MINUTE } from '@/timer/methods'
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
