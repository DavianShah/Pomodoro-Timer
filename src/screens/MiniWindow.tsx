import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { formatClock } from '@/timer/engine'
import { MINI_ROOT_ID, syncThemeAndPhase } from '@/timer/miniWindow'
import {
  boxingStatus,
  isBlockPrompt,
  phaseLabel,
  primaryLabel,
  sessionProgress,
} from '@/timer/labels'
import { blockEndingAt } from '@/timer/blocks'
import { MINUTE, methodById } from '@/timer/methods'
import { useBlocks } from '@/state/blocks'
import { useTimerShortcuts } from '@/timer/useShortcuts'
import type { TimerApi } from '@/timer/useTimer'

interface MiniWindowProps {
  win: Window
  timer: TimerApi
  onMiniToggle: () => void
  /** Active task; shown in the phase row. */
  taskTitle: string | null
}

/**
 * Mini window contents (PRD section 6): dominant time, phase label, one main
 * button, a thin progress line. Uses createPortal into the mini window's
 * document: one React tree → state and actions stay connected with no extra
 * wiring, and a portal container in another window automatically follows
 * React listeners. Timer logic stays in the main page.
 */
export default function MiniWindow({ win, timer, onMiniToggle, taskTitle }: MiniWindowProps) {
  const { state } = timer
  const blocks = useBlocks((state) => state.blocks)
  const isPrompt = isBlockPrompt(state, timer.now)
  const method = methodById(state.method)
  const trackedBlock =
    method.mode === 'boxing' && state.endTime !== null ? blockEndingAt(blocks, state.endTime) : null

  // Space/R must work while focus is in the mini window: listeners on this window.
  useTimerShortcuts(timer, { onMini: onMiniToggle, host: win })

  // Per-phase accent and light/dark mode follow the main page.
  useEffect(() => {
    const apply = (): void =>
      syncThemeAndPhase(document.documentElement, win.document.documentElement)
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-phase'],
    })
    return () => observer.disconnect()
  }, [win])

  const target = win.document.getElementById(MINI_ROOT_ID)
  if (target === null) return null

  const label = isPrompt ? 'Finish' : primaryLabel(state)
  const action = isPrompt
    ? () => timer.setBoxingEnd(null)
    : label === 'Finish'
      ? timer.skip
      : label === 'Pause'
        ? timer.pause
        : timer.start
  const progress = sessionProgress(
    state,
    timer.display,
    trackedBlock !== null ? (trackedBlock.endMin - trackedBlock.startMin) * MINUTE : undefined,
  )

  return createPortal(
    <div className="flex h-dvh flex-col gap-1 px-4 py-3">
      <div
        role="progressbar"
        aria-label="Session progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        className="h-[2px] w-full bg-paper-sunken"
      >
        <div
          className="h-full bg-accent transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <p className="truncate text-xs text-ink-muted">
        {method.mode === 'boxing'
          ? boxingStatus(state, blocks, timer.now)
          : phaseLabel(state.phase)}
        {taskTitle ? ` · ${taskTitle}` : ''}
      </p>

      <p className="angka flex flex-1 items-center justify-center text-center text-[clamp(2.5rem,18vw,3.5rem)]">
        {formatClock(timer.display)}
      </p>

      <button
        type="button"
        data-primary-action=""
        onClick={action}
        className="w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-ink-inverse transition-colors hover:bg-accent-strong"
      >
        {label}
      </button>
    </div>,
    target,
  )
}
