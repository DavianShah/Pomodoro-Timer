import { useCallback, useEffect, useRef, useState } from 'react'
import { configureMethodsFromLocal, useSettings } from '@/state/settings'
import { useBlocks } from '@/state/blocks'
import { read } from '@/lib/storage'
import {
  createTimer,
  displayMs,
  endsFocusSession,
  pause as pausePhase,
  reset as resetTimer,
  setBoxingEnd,
  skip as skipPhase,
  start as startPhase,
  tick,
  type TimerState,
} from './engine'
import { isTimerShape, restoreTimer, saveTimer } from './persist'
import { methodById } from './methods'
import { getAlarmState, playAlarm, subscribeAlarm, unlockAlarm } from './alarm'
import { setAmbientVolume, startAmbient, stopAmbient } from './ambient'
import { useWakeLock } from './useWakeLock'
import { notifyPhaseDone, requestNotifyPermission } from './notify'
import { documentTitle, phaseLabel } from './labels'
import { blockEndMs, currentBlock } from '@/timer/blocks'
import { recordFocusSession } from '@/data/recordFocusSession'
import { localDateKey, type FocusEndAction } from './sessionRecord'
import type { TimerWorkerEvent } from './protocol'

/**
 * Catat ujung sesi fokus dari aksi manual. Lewati/reset saat fase fokus
 * (termasuk idle — builder menolak durasi nol) itu ujung sesi; fase lain
 * bukan urusan pencatatan.
 */
function recordFocusEnd(
  prev: TimerState,
  next: TimerState,
  action: FocusEndAction,
  at: number,
): void {
  if (action === 'reset') {
    if (prev.phase === 'focus') void recordFocusSession(prev, 'reset', at)
    return
  }
  // Boxing menutup sesi tanpa ganti fase — endsFocusSession yang mendeteksi.
  if (endsFocusSession(prev, next)) void recordFocusSession(prev, action, at)
}

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
  /** Time Boxing: setel/bersihkan akhir blok saat tidak berjalan (prompt). */
  setBoxingEnd: (endMs: number | null) => void
  /** Time Boxing: lanjut dari blok yang baru diperpanjang (auto-resume). */
  resumeAt: (endMs: number) => void
}

/**
 * Sambungan mesin timer ke React: state reducer murni di engine.ts, jam dari
 * Worker (interval tidak di-throttle), aksi memakai Date.now() sebagai jam.
 * Pulih dari localStorage saat muat (F8), simpan setiap transisi, dan jalankan
 * efek sesi selesai (F5): alarm, notifikasi, penanda judul tab.
 */
export function useTimer(): TimerApi {
  const methodId = useSettings((state) => state.settings.lastMethod)
  const [state, setState] = useState<TimerState>(() => {
    // Registry metode (durasi/Custom) dari localStorage dulu — sinkron,
    // sebelum restore memakai methodById (PRD F3).
    configureMethodsFromLocal()
    const raw = read<unknown>('timer', null)
    const at = Date.now()
    const restored = restoreTimer(raw, at)
    // Fokus yang berakhir selama tab tertutup: catat sekali. Id diturunkan
    // dari state mentah yang sama → pemulihan ganda tidak menggandakan sesi.
    const boxingClosed =
      isTimerShape(raw) &&
      raw.running &&
      methodById(raw.method).mode === 'boxing' &&
      !restored.running
    if (
      isTimerShape(raw) &&
      raw.phase === 'focus' &&
      raw.running &&
      (restored.phase !== 'focus' || boxingClosed)
    ) {
      void recordFocusSession(raw, 'auto', at)
    }
    return restored
  })
  const [now, setNow] = useState(() => Date.now())
  const blocks = useBlocks((state) => state.blocks)
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

  // Wake Lock (F14): layar menyala selama timer jalan dan pengaturan hidup.
  const wakeLockEnabled = useSettings((state) => state.settings.wakeLock)
  useWakeLock(state.running && wakeLockEnabled)

  // Suara ambient (F13): ikut status jalan dan hasil unlock audio. Menunggu
  // alarmState 'ready' menutup balapan unlock (resume AudioContext asinkron).
  const ambient = useSettings((state) => state.settings.ambient)
  const ambientVolume = useSettings((state) => state.settings.ambientVolume)
  useEffect(() => {
    if (state.running && ambient !== 'off' && alarmState === 'ready') startAmbient(ambient)
    else stopAmbient()
    return stopAmbient
  }, [state.running, ambient, alarmState])
  useEffect(() => {
    setAmbientVolume(ambientVolume)
  }, [ambientVolume])

  // Ganti metode hanya saat idle (PRD F3), termasuk saat settings selesai
  // dimuat dari penyimpanan. Timer yang dipulih tidak ditimpa kalau metodenya
  // sama. Pola "adjust state during render" — bukan efek.
  const [prevMethodId, setPrevMethodId] = useState(methodId)
  if (prevMethodId !== methodId && !state.running) {
    setPrevMethodId(methodId)
    if (state.method !== methodId) setState(createTimer(methodId))
  }

  // Durasi metode berubah (panel pengaturan / muat pengaturan) → render ulang
  // berikut terpicu oleh langganan ini; kunci dilacak walau berjalan supaya
  // perubahan yang terjadi saat sesi berjalan tidak me-reset timer dijeda.
  const durations = useSettings((state) => state.settings.durations)
  const customConfig = useSettings((state) => state.settings.custom)
  const durationKey = `${JSON.stringify(durations)}|${JSON.stringify(customConfig)}`
  const [prevDurationKey, setPrevDurationKey] = useState(durationKey)
  if (prevDurationKey !== durationKey) {
    setPrevDurationKey(durationKey)
    // Hanya fase fokus yang dibangun ulang; istirahat yang sedang jaga
    // selesai dengan sisa yang tersimpan, lalu memakai durasi baru.
    if (!state.running && state.phase === 'focus') setState(createTimer(state.method))
  }

  // Simpan tiap transisi: tick yang tidak menyelesaikan mengembalikan
  // referensi sama → efek tidak jalan → tidak ada tulis per detik.
  useEffect(() => {
    saveTimer(state)
  }, [state])

  // Time Boxing: endTime = akhir blok hari ini — sinkron dari store selama
  // idle, tidak saat sesi berjalan (endTime jangkar) atau prompt (penanda).
  // Pola "adjust state during render" seperti ganti metode di atas.
  if (
    methodById(state.method).mode === 'boxing' &&
    !state.running &&
    !(state.endTime !== null && state.endTime <= now) &&
    useBlocks.getState().date === localDateKey(now)
  ) {
    const block = currentBlock(blocks, now)
    const endMs = block !== null ? blockEndMs(block) : null
    if (endMs !== state.endTime) setState(setBoxingEnd(state, endMs))
  }

  // Lewat tengah malam: blok hari ini perlu dimuat ulang (jalur eksternal).
  useEffect(() => {
    if (methodById(state.method).mode !== 'boxing') return
    if (useBlocks.getState().date !== localDateKey(now)) void useBlocks.getState().load()
  }, [state.method, now])

  // Time Boxing idle: jam berdetak tiap detik (hitung mundur ke akhir blok).
  useEffect(() => {
    if (methodById(state.method).mode !== 'boxing' || state.running) return undefined
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [state.method, state.running])

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
      if (next !== prev) {
        const phaseChanged = next.phase !== prev.phase
        const boxingEnd = methodById(prev.method).mode === 'boxing' && prev.running && !next.running
        if (phaseChanged || boxingEnd) {
          const settings = useSettings.getState().settings
          if (settings.alarmEnabled) playAlarm(settings.alarmSound)
          if (settings.notifications) notifyPhaseDone(boxingEnd ? 'Blok' : phaseLabel(prev.phase))
          if (document.visibilityState === 'hidden') {
            setCompletionMarker(boxingEnd ? 'Blok selesai' : `${phaseLabel(next.phase)} siap`)
          }
          if (endsFocusSession(prev, next)) {
            // Pencatatan dari transisi, bukan tick: satu sesi per akhir fokus.
            void recordFocusSession(prev, 'auto', at)
          }
        }
      }
    }
    worker.postMessage({ type: 'run' })
    return () => {
      worker.terminate()
    }
  }, [state.running])

  const apply = useCallback(
    (transition: (current: TimerState, at: number) => TimerState, endAction?: FocusEndAction) => {
      const at = Date.now()
      const prev = stateRef.current
      const next = transition(prev, at)
      stateRef.current = next
      setNow(at)
      setState(next)
      if (endAction !== undefined) recordFocusEnd(prev, next, endAction, at)
    },
    [],
  )

  const start = useCallback(() => {
    apply(startPhase)
    setCompletionMarker(null)
    unlockAlarm()
    if (useSettings.getState().settings.notifications) requestNotifyPermission()
    // Time Boxing: blok yang dicover berstatus running.
    if (methodById(stateRef.current.method).mode === 'boxing' && stateRef.current.running) {
      void useBlocks.getState().markRunning(Date.now())
    }
  }, [apply])

  const pause = useCallback(() => apply(pausePhase), [apply])
  const skip = useCallback(() => apply(skipPhase, 'skip'), [apply])
  const reset = useCallback(() => apply((current) => resetTimer(current), 'reset'), [apply])

  const setBoxingEndAction = useCallback(
    (endMs: number | null) => apply((current) => setBoxingEnd(current, endMs)),
    [apply],
  )

  // Lanjut dari blok yang baru diperpanjang: setel akhir baru lalu jalan.
  const resumeAt = useCallback(
    (endMs: number) => {
      apply((current, at) => startPhase(setBoxingEnd(current, endMs), at))
      setCompletionMarker(null)
      unlockAlarm()
      if (useSettings.getState().settings.notifications) requestNotifyPermission()
    },
    [apply],
  )

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
    setBoxingEnd: setBoxingEndAction,
    resumeAt,
  }
}
