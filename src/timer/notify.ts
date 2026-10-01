/**
 * Web Notification untuk sesi selesai (PRD F5).
 * Izin diminta saat user pertama kali menekan Mulai — sekali saja, tanpa
 * nag berulang (guard permission === 'default').
 */

import { APP_TITLE } from './labels'

export function requestNotifyPermission(): void {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'default') return
  void Notification.requestPermission().catch(() => undefined)
}

/**
 * Kirim notifikasi hanya kalau tab tidak sedang aktif dan terlihat.
 * Tab aktif → cukup suara + perubahan UI.
 */
export function notifyPhaseDone(doneLabel: string): void {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible' && document.hasFocus()) return
  try {
    new Notification(APP_TITLE, { body: `${doneLabel} selesai` })
  } catch {
    // Browser bisa melempar untuk notifikasi tanpa Service Worker; abaikan.
  }
}
