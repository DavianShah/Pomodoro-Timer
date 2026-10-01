import { describe, expect, it } from 'vitest'
import { createTimer, skip, start } from './engine'
import { MINUTE, methodById } from './methods'
import {
  APP_TITLE,
  documentTitle,
  phaseLabel,
  primaryLabel,
  sessionProgress,
  sessionStatus,
} from './labels'

const T0 = Date.UTC(2026, 0, 5, 8, 0, 0)

describe('label sesi', () => {
  it('Pomodoro menampilkan posisi di siklus', () => {
    expect(sessionStatus(methodById('pomodoro'), 3, 'focus')).toBe('Fokus · Sesi 3 dari 4')
    expect(sessionStatus(methodById('pomodoro'), 4, 'longBreak')).toBe(
      'Istirahat panjang · Sesi 4 dari 4',
    )
  })

  it('metode tanpa siklus tetap tidak pernah menampilkan posisi sesi', () => {
    expect(sessionStatus(methodById('flowtime'), 1, 'focus')).toBe('Fokus')
    expect(sessionStatus(methodById('52-17'), 1, 'break')).toBe('Istirahat')
    expect(sessionStatus(methodById('ultradian'), 1, 'focus')).toBe('Fokus')
  })

  it('label fase berbahasa Indonesia', () => {
    expect(phaseLabel('focus')).toBe('Fokus')
    expect(phaseLabel('break')).toBe('Istirahat')
    expect(phaseLabel('longBreak')).toBe('Istirahat panjang')
  })

  it('label tombol utama mengikuti fase dan mode metode', () => {
    expect(primaryLabel(createTimer('pomodoro'))).toBe('Mulai')
    expect(primaryLabel(start(createTimer('pomodoro'), T0))).toBe('Jeda')
    const istirahat = skip(start(createTimer('pomodoro'), T0), T0)
    expect(primaryLabel(istirahat)).toBe('Mulai istirahat')
    // Hitung maju yang berjalan ditawarkan sebagai "Selesai".
    expect(primaryLabel(start(createTimer('flowtime'), T0))).toBe('Selesai')
  })

  it('progres sesi: hitung mundur dari rencana fase, hitung maju selalu 0', () => {
    expect(sessionProgress(createTimer('pomodoro'), 25 * MINUTE)).toBe(0)
    expect(sessionProgress(createTimer('pomodoro'), 10 * MINUTE)).toBe(60)
    expect(sessionProgress(start(createTimer('flowtime'), T0), 0)).toBe(0)
  })
})

describe('judul tab', () => {
  it('saat berjalan: sisa waktu + fase', () => {
    const running = start(createTimer('pomodoro'), T0)
    expect(documentTitle(running, 25 * MINUTE, null, false)).toBe('25:00 · Fokus')
  })

  it('saat idle: nama aplikasi', () => {
    expect(documentTitle(createTimer('pomodoro'), 25 * MINUTE, null, false)).toBe(APP_TITLE)
    expect(APP_TITLE).toBe('Ritme')
  })

  it('sesi selesai saat tab tersembunyi: penanda sampai user kembali', () => {
    expect(documentTitle(createTimer('pomodoro'), 5 * MINUTE, 'Istirahat siap', true)).toBe(
      '● Istirahat siap',
    )
    // Sudah kembali ke tab → penanda tidak dipakai lagi.
    expect(documentTitle(createTimer('pomodoro'), 5 * MINUTE, 'Istirahat siap', false)).toBe(
      APP_TITLE,
    )
  })
})
