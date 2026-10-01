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
  /** Task aktif; tampil di baris fase. */
  taskTitle: string | null
}

/**
 * Isi jendela mini (PRD bagian 6): waktu dominan, label fase, satu tombol
 * utama, garis progres tipis. Menggunakan createPortal ke document window
 * mini: satu pohon React → state dan aksi tersambung tanpa pengkabelan
 * ekstra, dan portal container di window lain otomatis diikuti listener
 * React. Logika timer tetap di halaman utama.
 */
export default function MiniWindow({ win, timer, onMiniToggle, taskTitle }: MiniWindowProps) {
  const { state } = timer
  const blocks = useBlocks((state) => state.blocks)
  const isPrompt = isBlockPrompt(state, timer.now)
  const method = methodById(state.method)
  const trackedBlock =
    method.mode === 'boxing' && state.endTime !== null ? blockEndingAt(blocks, state.endTime) : null

  // Spasi/R harus berfungsi saat fokus di window mini: listener di window ini.
  useTimerShortcuts(timer, { onMini: onMiniToggle, host: win })

  // Aksen per fase dan mode terang/gelap mengikuti halaman utama.
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

  const label = isPrompt ? 'Selesai' : primaryLabel(state)
  const action = isPrompt
    ? () => timer.setBoxingEnd(null)
    : label === 'Selesai'
      ? timer.skip
      : label === 'Jeda'
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
        aria-label="Progres sesi"
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
