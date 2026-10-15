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
 * Record a focus-session end from a manual action. Skip/reset during the
 * focus phase (including idle — the builder rejects zero durations) is a
 * session end; other phases are not a recording concern.
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
  // Boxing closes a session without a phase change — endsFocusSession detects it.
  if (endsFocusSession(prev, next)) void recordFocusSession(prev, action, at)
}

export interface TimerApi {
  state: TimerState
  /** Last time known to the screen (epoch ms). */
  now: number
  /** Clock value: remaining time, or elapsed duration for count-up. */
  display: number
  /** false while the timer runs — the method cannot change mid-run. */
  methodEditable: boolean
  /** true when the browser refuses the audio unlock — a small indicator is shown. */
  soundBlocked: boolean
  start: () => void
  pause: () => void
  skip: () => void
  reset: () => void
  /** Time Boxing: set/clear the block end while not running (prompt). */
  setBoxingEnd: (endMs: number | null) => void
  /** Time Boxing: resume from a freshly extended block (auto-resume). */
  resumeAt: (endMs: number) => void
}

/**
 * Timer-engine wiring to React: pure state reducer in engine.ts, clock from
 * the Worker (interval not throttled), actions use Date.now() as the clock.
 * Restores from localStorage on load (F8), saves every transition, and runs
 * the finished-session effects (F5): alarm, notification, tab-title marker.
 */
export function useTimer(): TimerApi {
  const methodId = useSettings((state) => state.settings.lastMethod)
  const [state, setState] = useState<TimerState>(() => {
    // Method registry (durations/Custom) from localStorage first — synchronous,
    // before restore uses methodById (PRD F3).
    configureMethodsFromLocal()
    const raw = read<unknown>('timer', null)
    const at = Date.now()
    const restored = restoreTimer(raw, at)
    // Focus that ended while the tab was closed: record once. The id derives
    // from the same raw state → a double restore does not duplicate the session.
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

  // Synchronous reference for the worker/action path; the effect below syncs
  // it after commit (render-adjust changes only happen while idle, when the
  // worker is not running).
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })
  useEffect(() => subscribeAlarm(() => setAlarmState(getAlarmState())), [])

  // Wake Lock (F14): the screen stays on while the timer runs and the setting is on.
  const wakeLockEnabled = useSettings((state) => state.settings.wakeLock)
  useWakeLock(state.running && wakeLockEnabled)

  // Ambient sound (F13): follows run state and the audio unlock result.
  // Waiting for alarmState 'ready' closes the unlock race (asynchronous
  // AudioContext resume).
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

  // Method changes only while idle (PRD F3), including when settings finish
  // loading from storage. A restored timer is not overwritten when its method
  // matches. "Adjust state during render" pattern — not an effect.
  const [prevMethodId, setPrevMethodId] = useState(methodId)
  if (prevMethodId !== methodId && !state.running) {
    setPrevMethodId(methodId)
    if (state.method !== methodId) setState(createTimer(methodId))
  }

  // Method durations changed (settings panel / settings load) → the next
  // re-render is triggered by this subscription; the key is tracked even while
  // running so changes made mid-session do not reset a paused timer.
  const durations = useSettings((state) => state.settings.durations)
  const customConfig = useSettings((state) => state.settings.custom)
  const durationKey = `${JSON.stringify(durations)}|${JSON.stringify(customConfig)}`
  const [prevDurationKey, setPrevDurationKey] = useState(durationKey)
  if (prevDurationKey !== durationKey) {
    setPrevDurationKey(durationKey)
    // Only the focus phase is rebuilt; a paused break finishes with the
    // stored remaining time, then uses the new duration.
    if (!state.running && state.phase === 'focus') setState(createTimer(state.method))
  }

  // Save every transition: a tick that completes nothing returns the same
  // reference → the effect does not run → no write per second.
  useEffect(() => {
    saveTimer(state)
  }, [state])

  // Time Boxing: endTime = today's block end — synced from the store while
  // idle, not during a running session (endTime is the anchor) or a prompt
  // (it is a marker). "Adjust state during render" pattern as above.
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

  // Past midnight: today's blocks must be reloaded (external path).
  useEffect(() => {
    if (methodById(state.method).mode !== 'boxing') return
    if (useBlocks.getState().date !== localDateKey(now)) void useBlocks.getState().load()
  }, [state.method, now])

  // Time Boxing idle: the clock ticks every second (countdown to block end).
  useEffect(() => {
    if (methodById(state.method).mode !== 'boxing' || state.running) return undefined
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [state.method, state.running])

  // Tab title (PRD F5).
  useEffect(() => {
    document.title = documentTitle(
      state,
      displayMs(state, now),
      completionMarker,
      document.visibilityState === 'hidden',
    )
  }, [state, now, completionMarker])

  // The marker disappears as soon as the user returns to the tab.
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
          if (settings.notifications) notifyPhaseDone(boxingEnd ? 'Block' : phaseLabel(prev.phase))
          if (document.visibilityState === 'hidden') {
            setCompletionMarker(boxingEnd ? 'Block finished' : `${phaseLabel(next.phase)} ready`)
          }
          if (endsFocusSession(prev, next)) {
            // Recording from the transition, not the tick: one session per focus end.
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
    // Time Boxing: the covered block becomes running.
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

  // Resume from a freshly extended block: set the new end, then run.
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
