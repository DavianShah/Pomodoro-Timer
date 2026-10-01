import { useEffect, useMemo, useRef, useState } from 'react'
import ThemeToggle from './ThemeToggle'
import MiniWindow from './MiniWindow'
import TaskPanel from './TaskPanel'
import StatsPanel from './StatsPanel'
import JadwalPanel from './JadwalPanel'
import { METHOD_CONFIGS, MINUTE, methodById, methodDetail } from '@/timer/methods'
import { blockEndMs, blockEndingAt, formatBlockRange } from '@/timer/blocks'
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
import { useTasks } from '@/state/tasks'
import { useSettings } from '@/state/settings'
import { useBlocks } from '@/state/blocks'

export default function TimerScreen() {
  const setLastMethod = useSettings((state) => state.setLastMethod)
  const loadTasks = useTasks((state) => state.load)
  const tasksOpen = useTasks((state) => state.open)
  const toggleTasks = useTasks((state) => state.toggleOpen)
  const tasks = useTasks((state) => state.tasks)
  const blocksOpen = useBlocks((state) => state.open)
  const toggleBlocks = useBlocks((state) => state.toggleOpen)
  const loadBlocks = useBlocks((state) => state.load)
  const blocks = useBlocks((state) => state.blocks)
  const activeTaskId = useSettings((state) => state.settings.activeTaskId)
  const activeTaskTitle = tasks.find((task) => task.id === activeTaskId)?.title
  const timer = useTimer()
  const { state } = timer

  const method = useMemo(() => methodById(state.method), [state.method])

  // Warna aksen mengikuti fase (PRD bagian 7).
  useEffect(() => {
    document.documentElement.dataset.phase = state.phase
  }, [state.phase])

  // Task & blok hari ini sekali per layar; panel membaca store yang sama.
  useEffect(() => {
    void loadTasks()
    void loadBlocks()
  }, [loadTasks, loadBlocks])

  const [showHelp, setShowHelp] = useState(false)

  const mini = useMiniWindow(state.running)

  // Panel ditutup lewat Escape → tombolnya kembali menerima fokus. Panel
  // statistik (F10/F11) dan panel task saling menutup; fokus tidak rebutan.
  const taskButtonRef = useRef<HTMLButtonElement>(null)
  const tasksWasOpen = useRef(tasksOpen)
  const [statsOpen, setStatsOpen] = useState(false)
  const statsButtonRef = useRef<HTMLButtonElement>(null)
  const statsWasOpen = useRef(statsOpen)
  const jadwalButtonRef = useRef<HTMLButtonElement>(null)
  const jadwalWasOpen = useRef(blocksOpen)

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

  const toggleTasksPanel = (): void => {
    if (!tasksOpen) {
      setStatsOpen(false)
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
    setStatsOpen(true)
  }

  const toggleJadwal = (): void => {
    if (!blocksOpen) {
      useTasks.setState({ open: false })
      setStatsOpen(false)
    }
    toggleBlocks()
  }

  useTimerShortcuts(timer, { onMini: mini.toggle, onTasks: toggleTasksPanel })

  const [promptBusy, setPromptBusy] = useState(false)
  const countupFocus = method.mode === 'countup' && state.phase === 'focus'
  const label = primaryLabel(state)
  const primary = {
    label,
    action: label === 'Selesai' ? timer.skip : label === 'Jeda' ? timer.pause : timer.start,
  }

  const now = timer.now
  // Prompt blok berakhir (Time Boxing): pilihan inline — panel mungkin tertutup.
  const isPrompt = isBlockPrompt(state, now)
  const trackedBlock =
    method.mode === 'boxing' && state.endTime !== null ? blockEndingAt(blocks, state.endTime) : null

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
      </header>

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

      <main className="flex flex-1 flex-col justify-center px-6 pb-10 sm:px-10">
        <h1 className="angka text-center text-[clamp(5.5rem,21vw,17rem)]">
          {formatClock(timer.display)}
        </h1>

        <p aria-live="polite" className="mt-6 text-center text-sm text-ink-muted">
          {status}
        </p>
        {activeTaskTitle && (
          <p className="mt-1 text-center text-xs text-ink-muted">{activeTaskTitle}</p>
        )}

        <div
          id="kontrol-timer"
          tabIndex={-1}
          className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
        >
          {!isPrompt && (
            <button
              type="button"
              onClick={primary.action}
              className="rounded-md bg-accent px-7 py-3 text-base font-semibold text-ink-inverse transition-colors hover:bg-accent-strong"
            >
              {primary.label}
            </button>
          )}
          {countupFocus && state.running && (
            <button
              type="button"
              onClick={timer.pause}
              className="rounded-md border border-line-strong px-5 py-3 text-sm text-ink-muted transition-colors hover:border-ink-muted"
            >
              Jeda
            </button>
          )}
          <button
            type="button"
            aria-pressed={mini.win !== null}
            onClick={mini.toggle}
            className="rounded-md border border-line-strong px-5 py-3 text-sm text-ink-muted transition-colors hover:border-ink-muted"
          >
            Jendela mini
          </button>
          <button
            ref={taskButtonRef}
            type="button"
            aria-expanded={tasksOpen}
            aria-controls="panel-task"
            onClick={toggleTasksPanel}
            className="rounded-md border border-line-strong px-5 py-3 text-sm text-ink-muted transition-colors hover:border-ink-muted"
          >
            Task
          </button>
          <button
            ref={statsButtonRef}
            type="button"
            aria-expanded={statsOpen}
            aria-controls="panel-statistik"
            onClick={toggleStats}
            className="rounded-md border border-line-strong px-5 py-3 text-sm text-ink-muted transition-colors hover:border-ink-muted"
          >
            Statistik
          </button>
          <button
            ref={jadwalButtonRef}
            type="button"
            aria-expanded={blocksOpen}
            aria-controls="panel-jadwal"
            onClick={toggleJadwal}
            className="rounded-md border border-line-strong px-5 py-3 text-sm text-ink-muted transition-colors hover:border-ink-muted"
          >
            Jadwal
          </button>
        </div>

        {isPrompt && (
          <div
            role="status"
            className="mt-4 flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm"
          >
            <span className="text-ink-muted">
              {trackedBlock !== null
                ? `Blok ${formatBlockRange(trackedBlock)} berakhir.`
                : 'Blok berakhir.'}
            </span>
            {trackedBlock !== null && (
              <>
                <button
                  type="button"
                  onClick={lanjut15}
                  disabled={promptBusy}
                  className="rounded-md border border-line-strong px-4 py-2 text-sm text-ink transition-colors hover:border-ink-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Lanjut 15 menit
                </button>
                <button
                  type="button"
                  onClick={geserBlok}
                  disabled={promptBusy}
                  className="rounded-md border border-line-strong px-4 py-2 text-sm text-ink transition-colors hover:border-ink-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Geser blok berikutnya
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => timer.setBoxingEnd(null)}
              disabled={promptBusy}
              className="rounded-md border border-line-strong px-4 py-2 text-sm text-ink transition-colors hover:border-ink-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              Selesai
            </button>
          </div>
        )}

        {timer.soundBlocked && (
          <p role="status" className="mt-4 w-full text-center text-xs text-ink-muted">
            Suara alarm belum aktif
          </p>
        )}

        {mini.blocked && (
          <p role="status" className="mt-4 w-full text-center text-xs text-ink-muted">
            Popup diblokir — jendela mini tidak terbuka
          </p>
        )}

        <nav aria-label="Pilih metode" className="mt-16 border-t border-line pt-5">
          <ul className="flex flex-wrap justify-center gap-2">
            {METHOD_CONFIGS.map((item, index) => {
              const active = item.id === method.id
              const selectable = timer.methodEditable
              return (
                <li key={item.id} style={{ flexBasis: '9rem' }} className="min-w-0">
                  <button
                    type="button"
                    aria-pressed={active}
                    disabled={!selectable}
                    onClick={() => setLastMethod(item.id)}
                    className={
                      'grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 overflow-hidden rounded-md border px-4 py-2 text-left text-sm text-ink transition-colors ' +
                      (selectable ? '' : 'cursor-not-allowed ') +
                      (active
                        ? 'border-ink bg-ink text-paper'
                        : 'border-line-strong hover:border-ink-muted')
                    }
                  >
                    <span className="angka row-span-2 self-center text-base">{index + 1}</span>
                    <span className="font-semibold">{item.name}</span>
                    <span className="text-xs opacity-70">{methodDetail(item)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      </main>

      <footer className="border-t border-line px-6 py-4 sm:px-10">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <ThemeToggle />
          <div className="flex items-center gap-4">
            <p className="text-sm text-ink-muted">M5a: time boxing jalan.</p>
            <a
              href="/LICENSES.md"
              target="_blank"
              rel="noreferrer"
              className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              Lisensi font
            </a>
            <button
              type="button"
              aria-expanded={showHelp}
              aria-controls="petunjuk-shortcut"
              onClick={() => setShowHelp((open) => !open)}
              className="h-8 w-8 shrink-0 rounded-md border border-line-strong text-sm text-ink-muted transition-colors hover:border-ink-muted"
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
            <li>Spasi · mulai/jeda</li>
            <li>R · reset</li>
            <li>S · lewati</li>
            <li>M · jendela mini</li>
            <li>1–5 · ganti metode</li>
            <li>T · task</li>
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
    </div>
  )
}
