import { afterEach, describe, expect, it } from 'vitest'
import { clear, isStoredValue, read, write } from '@/lib/storage'
import { DEFAULT_SETTINGS, parseSettings, resolveTheme } from '@/state/settings'

afterEach(() => {
  localStorage.clear()
})

describe('parseSettings', () => {
  it('memakai default untuk nilai yang rusak', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('pomodoro')).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings({ theme: 'neon', lastMethod: 42 })).toEqual(DEFAULT_SETTINGS)
  })

  it('menjaga nilai yang sah dan mengisi sisanya dari default', () => {
    expect(parseSettings({ theme: 'dark', lastMethod: 'flowtime' })).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'dark',
      lastMethod: 'flowtime',
    })
    expect(parseSettings({ theme: 'light' })).toEqual({
      ...DEFAULT_SETTINGS,
      theme: 'light',
    })
    expect(parseSettings({ lastMethod: '' })).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings({ activeTaskId: 't9' })).toEqual({
      ...DEFAULT_SETTINGS,
      activeTaskId: 't9',
    })
  })
})

describe('resolveTheme', () => {
  it('mengikuti sistem hanya saat pilihan system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })
})

describe('storage', () => {
  it('menerima nilai JSON dan menolak yang lain', () => {
    expect(isStoredValue('a')).toBe(true)
    expect(isStoredValue(0)).toBe(true)
    expect(isStoredValue(false)).toBe(true)
    expect(isStoredValue(null)).toBe(true)
    expect(isStoredValue({ theme: 'dark', nested: [1, 'x'] })).toBe(true)
    expect(isStoredValue(() => 'x')).toBe(false)
    expect(isStoredValue({ bad: Symbol('s') })).toBe(false)
  })

  it('menyimpan nilai beserta versi skemanya', () => {
    write('tema', 3, 'dark')
    expect(JSON.parse(localStorage.getItem('ritme.v1.tema') ?? 'null')).toEqual({
      v: 3,
      value: 'dark',
    })
    expect(read('tema', 'light')).toBe('dark')
  })

  it('kembali ke fallback saat data rusak atau validator menolak', () => {
    localStorage.setItem('ritme.v1.tema', 'bukan json')
    expect(read('tema', 'light')).toBe('light')

    localStorage.setItem('ritme.v1.tema', JSON.stringify({ v: 1, value: 7 }))
    expect(read<string>('tema', 'light', (v): v is string => typeof v === 'string')).toBe('light')
  })

  it('clear menghapus kunci', () => {
    write('tema', 1, 'dark')
    clear('tema')
    expect(read('tema', 'light')).toBe('light')
  })
})
