import { useEffect, useMemo } from 'react'
import ThemeToggle from './ThemeToggle'
import { METHOD_CONFIGS, methodById, methodDetail } from '@/timer/methods'
import { formatClock, plannedPhaseMs } from '@/timer/engine'
import { useTimer } from '@/timer/useTimer'
import { useSettings } from '@/state/settings'
import type { Phase } from '@/db/db'

const phaseLabel = (phase: Phase): string => {
  if (phase === 'focus') return 'Fokus'
  if (phase === 'break') return 'Istirahat'
  return 'Istirahat panjang'
}

export default function TimerScreen() {
  const setLastMethod = useSettings((state) => state.setLastMethod)
  const timer = useTimer()
  const { state } = timer

  const method = useMemo(() => methodById(state.method), [state.method])

  // Warna aksen mengikuti fase (PRD bagian 7).
  useEffect(() => {
    document.documentElement.dataset.phase = state.phase
  }, [state.phase])

  const countupFocus = method.mode === 'countup' && state.phase === 'focus'
  const primary =
    countupFocus && state.running
      ? { label: 'Selesai', action: timer.skip }
      : state.running
        ? { label: 'Jeda', action: timer.pause }
        : {
            label: state.phase === 'focus' ? 'Mulai' : 'Mulai istirahat',
            action: timer.start,
          }

  const planned = plannedPhaseMs(method.id, state.phase)
  const progress =
    method.mode === 'countdown' && planned > 0
      ? Math.round((1 - Math.min(1, timer.display / planned)) * 100)
      : 0

  const cycle = method.cycle
  const status = [
    phaseLabel(state.phase),
    ...(cycle > 1 ? [`Sesi ${state.cycleIndex} dari ${cycle}`] : []),
  ].join(' · ')

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-5 sm:px-10">
        <p className="label">Ritme</p>
        <ThemeToggle />
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

        <div
          id="kontrol-timer"
          tabIndex={-1}
          className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
        >
          <button
            type="button"
            onClick={primary.action}
            className="rounded-md bg-accent px-7 py-3 text-base font-semibold text-ink-inverse transition-colors hover:bg-accent-strong"
          >
            {primary.label}
          </button>
          {countupFocus && state.running && (
            <button
              type="button"
              onClick={timer.pause}
              className="rounded-md border border-line px-5 py-3 text-sm text-ink-muted transition-colors hover:border-line-strong"
            >
              Jeda
            </button>
          )}
          <button
            type="button"
            aria-disabled="true"
            className="cursor-not-allowed rounded-md border border-line px-5 py-3 text-sm text-ink-muted"
          >
            Jendela mini
          </button>
        </div>

        <nav aria-label="Pilih metode" className="mt-16 border-t border-line pt-5">
          <ul className="flex flex-wrap justify-center gap-2">
            {METHOD_CONFIGS.map((item, index) => {
              const active = item.id === method.id
              const selectable = timer.methodEditable && item.mode !== 'disabled'
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
                        : 'border-line hover:border-line-strong')
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
        <p className="text-sm text-ink-muted">
          M1: mesin timer hitung mundur dan Flowtime sudah jalan.
        </p>
      </footer>
    </div>
  )
}
