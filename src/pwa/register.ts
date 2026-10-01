import { registerSW } from 'virtual:pwa-register'

/** Cek pembaruan service worker tiap 30 menit; pemasangan tetap menunggu aksi user. */
export function initServiceWorker(): void {
  if (import.meta.env.DEV) return
  registerSW({ immediate: false, onRegisteredSW: scheduleUpdateChecks })
}

function scheduleUpdateChecks(_swUrl: string, registration: ServiceWorkerRegistration | undefined) {
  if (!registration) return
  const FIFTEEN_MINUTES = 15 * 60 * 1000
  setInterval(() => {
    void registration.update()
  }, FIFTEEN_MINUTES)
}
