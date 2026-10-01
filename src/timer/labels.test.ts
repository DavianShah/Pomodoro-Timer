import type { BlockRow } from '@/db/db'
import { describe, expect, it } from 'vitest'
import { createTimer, setBoxingEnd, skip, start } from './engine'
import { MINUTE, methodById } from './methods'
import {
  APP_TITLE,
  boxingStatus,
  documentTitle,
  isBlockPrompt,
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

describe('label Time Boxing', () => {
  const now = new Date(2026, 0, 5, 12, 30).getTime()
  const block: BlockRow = {
    id: 'b1',
    date: '2026-01-05',
    startMin: 11 * 60 + 45,
    endMin: 12 * 60 + 45,
    status: 'running',
  }
  const idle = createTimer('timeboxing')
  const running = start(setBoxingEnd(idle, now + 15 * MINUTE), now - 10 * MINUTE)

  it('status: penanda blok selesai, rentang blok aktif, blok berikutnya', () => {
    const ended = { ...running, running: false, endTime: now - 1_000 }
    expect(boxingStatus(ended, [block], now)).toBe('Blok selesai')
    expect(boxingStatus(running, [block], now)).toBe('Fokus · 11:45–12:45')
    expect(boxingStatus(running, [], now)).toBe('Tidak ada blok berikutnya')
  })

  it('pilihan blok: hanya idle dengan endTime sudah lewat', () => {
    const ended = { ...running, running: false, endTime: now - 1_000 }
    expect(isBlockPrompt(ended, now)).toBe(true)
    expect(isBlockPrompt(running, now)).toBe(false)
    expect(isBlockPrompt({ ...ended, endTime: now + 60_000 }, now)).toBe(false)
  })

  it('progres pakai panjang blok, bukan rencana fase', () => {
    expect(sessionProgress(running, 10 * MINUTE, 30 * MINUTE)).toBe(67)
    expect(sessionProgress(running, 30 * MINUTE, 30 * MINUTE)).toBe(0)
    expect(sessionProgress(idle, 0)).toBe(0)
  })
})
