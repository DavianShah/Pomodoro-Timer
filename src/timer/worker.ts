/// <reference lib="webworker" />
/**
 * Tick in a Web Worker so the interval is not throttled by the browser
 * while the tab is in the background (PRD F2). The worker is a pure clock:
 * it receives run/stop commands and posts timestamps; the timer engine
 * stays on the main page.
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
