/**
 * Web Notification for finished sessions (PRD F5).
 * Permission is requested when the user first presses Start — once only,
 * no repeated nagging (guard on permission === 'default').
 */

import { APP_TITLE } from './labels'

export function requestNotifyPermission(): void {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'default') return
  void Notification.requestPermission().catch(() => undefined)
}

/**
 * Send a notification only when the tab is not active and visible.
 * Active tab → sound + UI change is enough.
 */
export function notifyPhaseDone(doneLabel: string): void {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible' && document.hasFocus()) return
  try {
    new Notification(APP_TITLE, { body: `${doneLabel} finished` })
  } catch {
    // Browsers may throw for notifications without a Service Worker; ignore.
  }
}
