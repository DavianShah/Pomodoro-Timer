/// <reference lib="webworker" />
/**
 * Tick di Web Worker supaya interval tidak ikut di-throttle browser saat
 * tab background (PRD F2). Worker murni jam: menerima perintah run/stop dan
 * mengirim timestamp; mesin timer tetap di halaman utama.
 */

import type { TimerWorkerCommand, TimerWorkerEvent } from './protocol'

const TICK_MS = 250

let interval: number | null = null

function post(event: TimerWorkerEvent): void {
  self.postMessage(event)
}

self.onmessage = (event: MessageEvent<TimerWorkerCommand>) => {
  const message = event.data
  if (message.type === 'run' && interval === null) {
    interval = self.setInterval(() => post({ type: 'tick', now: Date.now() }), TICK_MS)
  } else if (message.type === 'stop' && interval !== null) {
    self.clearInterval(interval)
    interval = null
  }
}
