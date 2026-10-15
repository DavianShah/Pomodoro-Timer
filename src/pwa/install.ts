/**
 * PWA installation (PRD F15): the small "Install app" text button in the
 * footer only appears when the browser fires `beforeinstallprompt`, and
 * disappears once installed. No popup, no banner — the browser's default
 * infobar is suppressed via `preventDefault`.
 */
import { create } from 'zustand'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

let deferred: InstallPromptEvent | null = null

export interface InstallState {
  /** true while the browser offers installation. */
  available: boolean
  /** Request installation; the browser prompt may only be called once. */
  prompt: () => void
}

export const useInstall = create<InstallState>(() => ({
  available: false,
  prompt: () => {
    const event = deferred
    deferred = null
    useInstall.setState({ available: false })
    void event?.prompt()
  },
}))

/** Attach listeners once at app start (main.tsx). */
export function initInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as InstallPromptEvent
    useInstall.setState({ available: true })
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    useInstall.setState({ available: false })
  })
}
