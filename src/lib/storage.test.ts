import { afterEach, describe, expect, it } from 'vitest'
import { clear, isStoredValue, read, write } from '@/lib/storage'
import { DEFAULT_SETTINGS, parseSettings, resolveTheme } from '@/state/settings'

afterEach(() => {
  localStorage.clear()
})

describe('parseSettings', () => {
  it('uses defaults for corrupted values', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('pomodoro')).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings({ theme: 'neon', lastMethod: 42 })).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps valid values and fills the rest from defaults', () => {
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
  it('follows the system only when the choice is system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })
})

describe('storage', () => {
  it('accepts JSON values and rejects the rest', () => {
    expect(isStoredValue('a')).toBe(true)
    expect(isStoredValue(0)).toBe(true)
    expect(isStoredValue(false)).toBe(true)
    expect(isStoredValue(null)).toBe(true)
    expect(isStoredValue({ theme: 'dark', nested: [1, 'x'] })).toBe(true)
    expect(isStoredValue(() => 'x')).toBe(false)
    expect(isStoredValue({ bad: Symbol('s') })).toBe(false)
  })

  it('stores the value along with its schema version', () => {
    write('theme', 3, 'dark')
    expect(JSON.parse(localStorage.getItem('ritme.v1.theme') ?? 'null')).toEqual({
      v: 3,
      value: 'dark',
    })
    expect(read('theme', 'light')).toBe('dark')
  })

  it('falls back when the data is corrupted or the validator rejects it', () => {
    localStorage.setItem('ritme.v1.theme', 'not json')
    expect(read('theme', 'light')).toBe('light')

    localStorage.setItem('ritme.v1.theme', JSON.stringify({ v: 1, value: 7 }))
    expect(read<string>('theme', 'light', (v): v is string => typeof v === 'string')).toBe('light')
  })

  it('clear removes the key', () => {
    write('theme', 1, 'dark')
    clear('theme')
    expect(read('theme', 'light')).toBe('light')
  })
})
