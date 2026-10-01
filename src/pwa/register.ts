import { registerSW } from 'virtual:pwa-register'
import { bindUpdateApply, useSwUpdate } from './update'

/**
 * Cek pembaruan service worker tiap 15 menit; pemasangan tetap menunggu
 * aksi user, dan versi baru tidak memuat ulang sendiri (PRD F15) —
 * `onNeedRefresh` cukup menyalakan baris di `update.ts`.
 */
export function initServiceWorker(): void {
  if (import.meta.env.DEV) return
  bindUpdateApply(
    registerSW({
      immediate: false,
      onNeedRefresh: () => useSwUpdate.setState({ ready: true }),
      onRegisteredSW: scheduleUpdateChecks,
    }),
  )
}

function scheduleUpdateChecks(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
  if (!registration) return
  const FIFTEEN_MINUTES = 15 * 60 * 1000
  setInterval(() => {
    void registration.update()
  }, FIFTEEN_MINUTES)
}
