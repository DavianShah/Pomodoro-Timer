import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettings } from '@/state/settings'
import { read } from '@/lib/storage'
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
import { restoreTimer, saveTimer } from './persist'
import { getAlarmState, playAlarm, subscribeAlarm, unlockAlarm } from './alarm'
import { notifyPhaseDone, requestNotifyPermission } from './notify'
import { documentTitle, phaseLabel } from './labels'
import type { TimerWorkerEvent } from './protocol'

export interface TimerApi {
  state: TimerState
  /** Waktu terakhir yang diketahui layar (epoch ms). */
  now: number
  /** Nilai jam: sisa waktu, atau durasi berjalan untuk hitung maju. */
  display: number
  /** false saat timer berjalan — metode tidak boleh diganti di tengah jalan. */
  methodEditable: boolean
  /** true kalau browser menolak unlock audio — indikator kecil ditampilkan. */
  soundBlocked: boolean
  start: () => void
  pause: () => void
  skip: () => void
  reset: () => void
}

/**
 * Sambungan mesin timer ke React: state reducer murni di engine.ts, jam dari
 * Worker (interval tidak di-throttle), aksi memakai Date.now() sebagai jam.
 * Pulih dari localStorage saat muat (F8), simpan setiap transisi, dan jalankan
 * efek sesi selesai (F5): alarm, notifikasi, penanda judul tab.
 */
export function useTimer(): TimerApi {
  const methodId = useSettings((state) => state.settings.lastMethod)
  const [state, setState] = useState<TimerState>(() =>
    restoreTimer(read<unknown>('timer', null), Date.now()),
  )
  const [now, setNow] = useState(() => Date.now())
  const [completionMarker, setCompletionMarker] = useState<string | null>(null)
  const [alarmState, setAlarmState] = useState(getAlarmState)

  // Referensi sinkron untuk jalur worker/aplikasi aksi; efek di bawah
  // menyamakannya setelah commit (perubahan lewat render-adjust hanya terjadi
  // saat idle, ketika worker tidak berjalan).
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })
  useEffect(() => subscribeAlarm(() => setAlarmState(getAlarmState())), [])

  // Ganti metode hanya saat idle (PRD F3), termasuk saat settings selesai
  // dimuat dari penyimpanan. Timer yang dipulih tidak ditimpa kalau metodenya
  // sama. Pola "adjust state during render" — bukan efek.
  const [prevMethodId, setPrevMethodId] = useState(methodId)
  if (prevMethodId !== methodId && !state.running) {
    setPrevMethodId(methodId)
    if (state.method !== methodId) setState(createTimer(methodId))
  }

  // Simpan tiap transisi: tick yang tidak menyelesaikan mengembalikan
  // referensi sama → efek tidak jalan → tidak ada tulis per detik.
  useEffect(() => {
    saveTimer(state)
  }, [state])

  // Judul tab (PRD F5).
  useEffect(() => {
    document.title = documentTitle(
      state,
      displayMs(state, now),
      completionMarker,
      document.visibilityState === 'hidden',
    )
  }, [state, now, completionMarker])

  // Penanda hilang begitu user kembali ke tab.
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') setCompletionMarker(null)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    if (!state.running) return undefined
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<TimerWorkerEvent>) => {
      if (event.data.type !== 'tick') return
      const at = event.data.now
      const prev = stateRef.current
      const next = tick(prev, at)
      stateRef.current = next
      setNow(at)
      setState(next)
      if (next !== prev && next.phase !== prev.phase) {
        playAlarm()
        notifyPhaseDone(phaseLabel(prev.phase))
        if (document.visibilityState === 'hidden') {
          setCompletionMarker(`${phaseLabel(next.phase)} siap`)
        }
      }
    }
    worker.postMessage({ type: 'run' })
    return () => {
      worker.terminate()
    }
  }, [state.running])

  const apply = useCallback((transition: (current: TimerState, at: number) => TimerState) => {
    const at = Date.now()
    const next = transition(stateRef.current, at)
    stateRef.current = next
    setNow(at)
    setState(next)
  }, [])

  const start = useCallback(() => {
    apply(startPhase)
    setCompletionMarker(null)
    unlockAlarm()
    requestNotifyPermission()
  }, [apply])

  const pause = useCallback(() => apply(pausePhase), [apply])
  const skip = useCallback(() => apply(skipPhase), [apply])
  const reset = useCallback(() => apply((current) => resetTimer(current)), [apply])

  return {
    state,
    now,
    display: displayMs(state, now),
    methodEditable: !state.running,
    soundBlocked: alarmState === 'blocked',
    start,
    pause,
    skip,
    reset,
  }
}
