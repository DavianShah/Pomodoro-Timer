import { useCallback, useEffect, useState } from 'react'
import { useSettings } from '@/state/settings'
import {
  createTimer,
  displayMs,
  pause as pausePhase,
  reset as resetTimer,
  skip as skipPhase,
  start as startPhase,
  tick,
  type TimerState,
} from './engine'
import type { TimerWorkerEvent } from './protocol'

export interface TimerApi {
  state: TimerState
  /** Waktu terakhir yang diketahui layar (epoch ms). */
  now: number
  /** Nilai jam: sisa waktu, atau durasi berjalan untuk hitung maju. */
  display: number
  /** false saat timer berjalan — metode tidak boleh diganti di tengah jalan. */
  methodEditable: boolean
  start: () => void
  pause: () => void
  skip: () => void
  reset: () => void
}

/**
 * Sambungan mesin timer ke React: state reducer murni di engine.ts, jam dari
 * Worker (interval tidak di-throttle), aksi memakai Date.now() sebagai jam.
 */
export function useTimer(): TimerApi {
  const methodId = useSettings((state) => state.settings.lastMethod)
  const [state, setState] = useState<TimerState>(() => createTimer(methodId))
  const [now, setNow] = useState(() => Date.now())

  // Ganti metode hanya saat idle (PRD F3), termasuk saat settings selesai
  // dimuat dari penyimpanan. Pola "adjust state during render" dari React
  // (https://react.dev/learn/you-might-not-need-an-effect) — bukan efek.
  const [prevMethodId, setPrevMethodId] = useState(methodId)
  if (prevMethodId !== methodId && !state.running) {
    setPrevMethodId(methodId)
    setState(createTimer(methodId))
  }

  useEffect(() => {
    if (!state.running) return undefined
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<TimerWorkerEvent>) => {
      if (event.data.type !== 'tick') return
      setNow(event.data.now)
      setState((prev) => tick(prev, event.data.now))
    }
    worker.postMessage({ type: 'run' })
    return () => {
      worker.terminate()
    }
  }, [state.running])

  const apply = useCallback((transition: (current: TimerState, at: number) => TimerState) => {
    const at = Date.now()
    setNow(at)
    setState((prev) => transition(prev, at))
  }, [])

  const start = useCallback(() => apply(startPhase), [apply])
  const pause = useCallback(() => apply(pausePhase), [apply])
  const skip = useCallback(() => apply(skipPhase), [apply])
  const reset = useCallback(() => apply((current) => resetTimer(current)), [apply])

  return {
    state,
    now,
    display: displayMs(state, now),
    methodEditable: !state.running,
    start,
    pause,
    skip,
    reset,
  }
}
