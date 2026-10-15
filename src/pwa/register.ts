import { registerSW } from 'virtual:pwa-register'
import { bindUpdateApply, useSwUpdate } from './update'

/**
 * Check for service worker updates every 15 minutes; installation still
 * waits for a user action, and a new version never reloads on its own
 * (PRD F15) — `onNeedRefresh` merely lights up the row in `update.ts`.
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
