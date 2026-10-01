import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_KEY, STORAGE_VERSION } from '@/app/constants'
import { db } from '@/db/db'
import { write } from '@/lib/storage'
import { DEFAULT_SETTINGS, useSettings } from './settings'

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
