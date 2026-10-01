/**
 * Pemasangan PWA (PRD F15): tombol teks kecil "Pasang aplikasi" di footer
 * hanya muncul kalau browser mengirim `beforeinstallprompt`, dan hilang
 * setelah terpasang. Tanpa popup, tanpa banner — infobar bawaan browser
 * dicegah lewat `preventDefault`.
 */
import { create } from 'zustand'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

let deferred: InstallPromptEvent | null = null

export interface InstallState {
  /** true selama browser menawarkan pemasangan. */
  available: boolean
  /** Minta pemasangan; prompt browser hanya boleh dipanggil sekali. */
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

/** Pasang listener sekali saat aplikasi mulai (main.tsx). */
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
