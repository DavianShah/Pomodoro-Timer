/** Protokol pesan antara halaman utama dan Worker tick. */

export type TimerWorkerCommand = { type: 'run' } | { type: 'stop' }

export type TimerWorkerEvent = { type: 'tick'; now: number }
