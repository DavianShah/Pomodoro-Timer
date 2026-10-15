import { useEffect, useMemo, useRef, useState } from 'react'
import ThemeToggle from './ThemeToggle'
import MiniWindow from './MiniWindow'
import TaskPanel from './TaskPanel'
import StatsPanel from './StatsPanel'
import JadwalPanel from './JadwalPanel'
import PengaturanPanel from './PengaturanPanel'
import { customMethod, METHOD_CONFIGS, MINUTE, methodById, methodDetail } from '@/timer/methods'
import {
  blockEndMs,
  blockEndingAt,
  currentBlock,
  formatBlockRange,
  formatMin,
  nextBlock,
} from '@/timer/blocks'
import { formatClock } from '@/timer/engine'
import {
  boxingStatus,
  isBlockPrompt,
  primaryLabel,
  sessionProgress,
  sessionStatus,
} from '@/timer/labels'
import { useTimer } from '@/timer/useTimer'
import { useMiniWindow } from '@/timer/useMiniWindow'
import { useTimerShortcuts } from '@/timer/useShortcuts'
import UpdateNotice from '@/pwa/UpdateNotice'
import { useInstall } from '@/pwa/install'
import { useTasks } from '@/state/tasks'
import { useSettings } from '@/state/settings'
import { useBlocks } from '@/state/blocks'
import { loadSessionsThrough } from '@/data/sessions'
import { completedCountForMethod } from '@/stats/aggregate'
import { localDateKey } from '@/timer/sessionRecord'

export default function TimerScreen() {
  const setLastMethod = useSettings((state) => state.setLastMethod)
  const selectCustom = useSettings((state) => state.selectCustom)
  const loadTasks = useTasks((state) => state.load)
  const tasksOpen = useTasks((state) => state.open)
  const toggleTasks = useTasks((state) => state.toggleOpen)
  const tasks = useTasks((state) => state.tasks)
  const blocksOpen = useBlocks((state) => state.open)
  const toggleBlocks = useBlocks((state) => state.toggleOpen)
  const loadBlocks = useBlocks((state) => state.load)
  const blocks = useBlocks((state) => state.blocks)
  const activeTaskId = useSettings((state) => state.settings.activeTaskId)
  const wakeLockOn = useSettings((state) => state.settings.wakeLock)
  const setWakeLock = useSettings((state) => state.setWakeLock)
  const canInstall = useInstall((state) => state.available)
  const promptInstall = useInstall((state) => state.prompt)
  const activeTaskTitle = tasks.find((task) => task.id === activeTaskId)?.title
  const timer = useTimer()
  const { state } = timer

  const method = useMemo(() => methodById(state.method), [state.method])

  // Accent color follows the phase (PRD section 7).
  useEffect(() => {
    document.documentElement.dataset.phase = state.phase
  }, [state.phase])

  // Tasks & today's blocks once per screen; panels read the same store.
  useEffect(() => {
    void loadTasks()
    void loadBlocks()
  }, [loadTasks, loadBlocks])

  const [showHelp, setShowHelp] = useState(false)

  const mini = useMiniWindow(state.running)

  // Panels close on Escape → their buttons receive focus again. The stats
  // panel (F10/F11) and the task panel close each other; focus is never contested.
  const taskButtonRef = useRef<HTMLButtonElement>(null)
  const tasksWasOpen = useRef(tasksOpen)
  const [statsOpen, setStatsOpen] = useState(false)
  const statsButtonRef = useRef<HTMLButtonElement>(null)
  const statsWasOpen = useRef(statsOpen)
  const jadwalButtonRef = useRef<HTMLButtonElement>(null)
  const jadwalWasOpen = useRef(blocksOpen)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  const settingsWasOpen = useRef(settingsOpen)

  useEffect(() => {
    if (tasksWasOpen.current && !tasksOpen && !statsOpen && !blocksOpen)
      taskButtonRef.current?.focus()
    tasksWasOpen.current = tasksOpen
  }, [tasksOpen, statsOpen, blocksOpen])

  useEffect(() => {
    if (statsWasOpen.current && !statsOpen && !tasksOpen && !blocksOpen)
      statsButtonRef.current?.focus()
    statsWasOpen.current = statsOpen
  }, [statsOpen, tasksOpen, blocksOpen])

  useEffect(() => {
    if (jadwalWasOpen.current && !blocksOpen && !tasksOpen && !statsOpen)
      jadwalButtonRef.current?.focus()
    jadwalWasOpen.current = blocksOpen
  }, [blocksOpen, tasksOpen, statsOpen])

  useEffect(() => {
    if (settingsWasOpen.current && !settingsOpen && !tasksOpen && !statsOpen && !blocksOpen)
      settingsButtonRef.current?.focus()
    settingsWasOpen.current = settingsOpen
  }, [settingsOpen, tasksOpen, statsOpen, blocksOpen])

  const toggleTasksPanel = (): void => {
    if (!tasksOpen) {
      setStatsOpen(false)
      setSettingsOpen(false)
      useBlocks.setState({ open: false })
    }
    toggleTasks()
  }

  const toggleStats = (): void => {
    if (statsOpen) {
      setStatsOpen(false)
      return
    }
    useTasks.setState({ open: false })
    useBlocks.setState({ open: false })
    setSettingsOpen(false)
    setStatsOpen(true)
  }

  const toggleJadwal = (): void => {
    if (!blocksOpen) {
      useTasks.setState({ open: false })
      setStatsOpen(false)
      setSettingsOpen(false)
    }
    toggleBlocks()
  }

  const toggleSettings = (): void => {
    if (!settingsOpen) {
      useTasks.setState({ open: false })
      setStatsOpen(false)
      useBlocks.setState({ open: false })
    }
    setSettingsOpen((open) => !open)
  }

  useTimerShortcuts(timer, { onMini: mini.toggle, onTasks: toggleTasksPanel })

  // Ultradian nudge (PRD section 3): count today's finished sessions when the
  // method is selected; refreshed whenever the phase/running state changes
  // (right after a session finishes).
  const [ultradianToday, setUltradianToday] = useState<number | null>(null)
  useEffect(() => {
    // Stale values are safe: the row only shows while Ultradian is selected.
    if (method.id !== 'ultradian') return undefined
    let cancelled = false
    const today = localDateKey(Date.now())
    void loadSessionsThrough(today)
      .then((sessions) => {
        if (!cancelled) setUltradianToday(completedCountForMethod(sessions, 'ultradian', today))
      })
      .catch(() => {
        if (!cancelled) setUltradianToday(null)
      })
    return () => {
      cancelled = true
    }
  }, [method.id, state.running, state.phase])

  const [promptBusy, setPromptBusy] = useState(false)
  const countupFocus = method.mode === 'countup' && state.phase === 'focus'
  const label = primaryLabel(state)
  const primary = {
    label,
    action: label === 'Finish' ? timer.skip : label === 'Pause' ? timer.pause : timer.start,
  }

  const now = timer.now
  // Block-finished prompt (Time Boxing): inline choices — the panel may be closed.
  const isPrompt = isBlockPrompt(state, now)
  const trackedBlock =
    method.mode === 'boxing' && state.endTime !== null ? blockEndingAt(blocks, state.endTime) : null

  // Time Boxing with no block covering now: there is nothing to start until a
  // block exists (engine.start is a no-op then), so the clock area becomes a
  // block picker instead. The regular status line stays off — the reason
  // paragraph below the digits carries the same information.
  const boxingIdle =
    method.mode === 'boxing' && state.endTime === null && currentBlock(blocks, now) === null
  const next = boxingIdle ? nextBlock(blocks, now) : null

  const openSchedule = (): void => {
    if (!blocksOpen) toggleJadwal()
  }

  const lanjut15 = (): void => {
    if (trackedBlock === null || promptBusy) return
    setPromptBusy(true)
    void useBlocks
      .getState()
      .extend(trackedBlock.id, 15)
      .then((extended) => {
        if (extended !== null) timer.resumeAt(blockEndMs(extended))
      })
      .finally(() => setPromptBusy(false))
  }

  const geserBlok = (): void => {
    if (trackedBlock === null || promptBusy) return
    const overrunMin = Math.max(0, Math.ceil((now - blockEndMs(trackedBlock)) / MINUTE))
    setPromptBusy(true)
    void (async () => {
      try {
        if (overrunMin > 0) await useBlocks.getState().shift(trackedBlock.id, overrunMin)
        timer.setBoxingEnd(null)
      } finally {
        setPromptBusy(false)
      }
    })()
  }

  const progress = sessionProgress(
    state,
    timer.display,
    trackedBlock !== null ? (trackedBlock.endMin - trackedBlock.startMin) * MINUTE : undefined,
  )

  const status =
    method.mode === 'boxing'
      ? boxingStatus(state, blocks, now)
      : sessionStatus(method, state.cycleIndex, state.phase)

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-5 sm:px-10">
        <p className="label">Ritme</p>
        {/* Panel entry points: borderless text buttons (DESIGN.md — borders
            only for separators and input boundaries). */}
        <nav aria-label="Panels" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <button
            ref={taskButtonRef}
            type="button"
            aria-expanded={tasksOpen}
            aria-controls="panel-task"
            onClick={toggleTasksPanel}
            className="text-sm text-ink-muted transition-colors hover:text-ink"
          >
            Task
          </button>
          <button
            ref={statsButtonRef}
            type="button"
            aria-expanded={statsOpen}
            aria-controls="panel-statistik"
            onClick={toggleStats}
            className="text-sm text-ink-muted transition-colors hover:text-ink"
          >
            Statistics
          </button>
          <button
            ref={jadwalButtonRef}
            type="button"
            aria-expanded={blocksOpen}
            aria-controls="panel-jadwal"
            onClick={toggleJadwal}
            className="text-sm text-ink-muted transition-colors hover:text-ink"
          >
            Schedule
          </button>
          <button
            ref={settingsButtonRef}
            type="button"
            aria-expanded={settingsOpen}
            aria-controls="panel-pengaturan"
            onClick={toggleSettings}
            className="text-sm text-ink-muted transition-colors hover:text-ink"
          >
            Settings
          </button>
        </nav>
      </header>

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

      {/* Cycle segment strip (DESIGN.md): one segment per session; the status
          text below the clock announces its position to screen readers. */}
      {method.cycle > 1 && (
        <ol aria-hidden="true" className="flex gap-1 px-6 pt-2 sm:px-10">
          {Array.from({ length: method.cycle }, (_, index) => (
            <li
              key={index}
              className={`h-[3px] flex-1 ${index < state.cycleIndex ? 'bg-accent' : 'bg-paper-sunken'}`}
            />
          ))}
        </ol>
      )}

      <main className="flex flex-1 flex-col justify-center px-6 pb-10 sm:px-10">
        {/* Method picker: text tabs, the active one underlined — no filled
            boxes. Native radios keep the tablist keyboard contract (Tab enters
            the group, arrows move between options) and the shortcut digit
            stays visible as a small hint. */}
        <div
          role="radiogroup"
          aria-label="Choose method"
          className="mx-auto mb-10 flex w-fit max-w-full flex-wrap justify-center gap-x-7 border-b border-line"
        >
          {[...METHOD_CONFIGS, customMethod()].map((item, index) => {
            const active = item.id === method.id
            const selectable = timer.methodEditable
            return (
              <label
                key={item.id}
                className={
                  'flex cursor-pointer items-baseline gap-1.5 border-b-2 pb-2 text-sm transition-colors ' +
                  // Radio input is sr-only: the focus ring is drawn on its label.
                  'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ' +
                  (selectable ? '' : 'cursor-not-allowed ') +
                  (active ? 'border-ink' : 'border-transparent hover:border-line-strong')
                }
              >
                <input
                  type="radio"
                  name="choose-method"
                  value={item.id}
                  checked={active}
                  disabled={!selectable}
                  onChange={() =>
                    item.id === 'custom' ? selectCustom() : setLastMethod(item.id)
                  }
                  className="sr-only"
                />
                {/* Number = shortcut 1–5; Custom only through this picker. */}
                {index < 5 && (
                  <span aria-hidden="true" className="angka text-[0.625rem] text-ink-muted">
                    {index + 1}
                  </span>
                )}
                <span className={active ? 'font-semibold text-ink' : 'text-ink-muted'}>
                  {item.name}
                </span>
                {active && <span className="text-xs text-ink-muted">{methodDetail(item)}</span>}
              </label>
            )
          })}
        </div>

        {boxingIdle ? (
          <h1 className="text-center text-[clamp(2.75rem,9vw,5.5rem)] font-semibold tabular-nums">
            {next !== null ? `Next: ${formatMin(next.startMin)}` : 'No block yet'}
          </h1>
        ) : (
          <h1 className="angka text-center text-[clamp(5.5rem,21vw,17rem)]">
            {formatClock(timer.display)}
          </h1>
        )}

        {boxingIdle ? (
          <p id="boxing-reason" className="mt-6 text-center text-sm text-ink-muted">
            No block is active. Create a block in the Schedule panel to start.
          </p>
        ) : (
          <p aria-live="polite" className="mt-6 text-center text-sm text-ink-muted">
            {status}
          </p>
        )}
        {activeTaskTitle && (
          <p className="mt-1 text-center text-xs text-ink-muted">{activeTaskTitle}</p>
        )}
        {method.id === 'ultradian' && ultradianToday !== null && (
          <p className="mt-1 text-center text-xs text-ink-muted">
            Ultradian today: <span className="angka">{ultradianToday}</span> sessions · suggested
            max 3–4
          </p>
        )}

        <div
          id="kontrol-timer"
          tabIndex={-1}
          className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
        >
          {!isPrompt && (
            <button
              type="button"
              data-primary-action=""
              onClick={primary.action}
              disabled={boxingIdle}
              aria-describedby={boxingIdle ? 'boxing-reason' : undefined}
              className="rounded-md bg-accent px-7 py-3 text-base font-semibold text-ink-inverse transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-paper-sunken disabled:text-ink-muted disabled:hover:bg-paper-sunken"
            >
              {primary.label}
            </button>
          )}
          {boxingIdle && (
            <button
              type="button"
              onClick={openSchedule}
              className="rounded-md border border-line-strong px-5 py-3 text-sm text-ink-muted transition-colors hover:border-ink-muted"
            >
              Create block
            </button>
          )}
          {countupFocus && state.running && (
            <button
              type="button"
              onClick={timer.pause}
              className="px-2 py-3 text-sm text-ink-muted transition-colors hover:text-ink"
            >
              Pause
            </button>
          )}
          <button
            type="button"
            aria-pressed={mini.win !== null}
            onClick={mini.toggle}
            className="rounded-md border border-line-strong px-5 py-3 text-sm text-ink-muted transition-colors hover:border-ink-muted"
          >
            Mini window
          </button>
        </div>

        {isPrompt && (
          <div
            role="status"
            className="mt-4 flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm"
          >
            <span className="text-ink-muted">
              {trackedBlock !== null
                ? `Block ${formatBlockRange(trackedBlock)} finished.`
                : 'Block finished.'}
            </span>
            {trackedBlock !== null && (
              <>
                <button
                  type="button"
                  onClick={lanjut15}
                  disabled={promptBusy}
                  className="px-2 py-2 text-sm text-ink underline underline-offset-2 transition-colors hover:text-ink-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Extend 15 min
                </button>
                <button
                  type="button"
                  onClick={geserBlok}
                  disabled={promptBusy}
                  className="px-2 py-2 text-sm text-ink underline underline-offset-2 transition-colors hover:text-ink-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Shift following blocks
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => timer.setBoxingEnd(null)}
              disabled={promptBusy}
              className="px-2 py-2 text-sm text-ink underline underline-offset-2 transition-colors hover:text-ink-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              Finish
            </button>
          </div>
        )}

        <UpdateNotice running={state.running} />

        {timer.soundBlocked && (
          <p role="status" className="mt-4 w-full text-center text-xs text-ink-muted">
            Sound not enabled yet
          </p>
        )}

        {mini.blocked && (
          <p role="status" className="mt-4 w-full text-center text-xs text-ink-muted">
            Popup blocked — mini window did not open
          </p>
        )}
      </main>

      <footer className="border-t border-line px-6 py-4 sm:px-10">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <ThemeToggle />
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={wakeLockOn}
                onChange={(event) => setWakeLock(event.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              Keep the screen awake while the timer runs
            </label>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/LICENSES.md"
              target="_blank"
              rel="noreferrer"
              className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              Font licenses
            </a>
            {canInstall && (
              <button
                type="button"
                onClick={promptInstall}
                className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                Install app
              </button>
            )}
            <button
              type="button"
              aria-expanded={showHelp}
              aria-controls="petunjuk-shortcut"
              onClick={() => setShowHelp((open) => !open)}
              className="h-8 w-8 shrink-0 text-sm text-ink-muted transition-colors hover:text-ink"
            >
              ?
            </button>
          </div>
        </div>
        {showHelp && (
          <ul
            id="petunjuk-shortcut"
            className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-muted"
          >
            <li>{method.mode === 'boxing' ? 'Space · start' : 'Space · start/pause'}</li>
            <li>R · reset</li>
            <li>{method.mode === 'boxing' ? 'S · finish block' : 'S · skip'}</li>
            <li>M · mini window</li>
            <li>1–5 · change method</li>
            <li>T · tasks</li>
          </ul>
        )}
      </footer>

      {mini.win !== null && (
        <MiniWindow
          win={mini.win}
          timer={timer}
          onMiniToggle={mini.toggle}
          taskTitle={activeTaskTitle ?? null}
        />
      )}
      {tasksOpen && <TaskPanel onClose={toggleTasks} />}
      {statsOpen && <StatsPanel onClose={toggleStats} />}
      {blocksOpen && <JadwalPanel onClose={toggleJadwal} />}
      {settingsOpen && (
        <PengaturanPanel running={state.running} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  )
}
