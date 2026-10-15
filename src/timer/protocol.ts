/** Message protocol between the main page and the tick Worker. */

export type TimerWorkerCommand = { type: 'run' } | { type: 'stop' }

export type TimerWorkerEvent = { type: 'tick'; now: number }
