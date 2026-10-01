import { useMemo } from 'react'
import ThemeToggle from './ThemeToggle'
import { METHOD_OPTIONS } from '@/app/methods'
import { useSettings } from '@/state/settings'

const FALLBACK_METHOD = METHOD_OPTIONS[0]!

export default function TimerScreen() {
  const lastMethod = useSettings((state) => state.settings.lastMethod)
  const setLastMethod = useSettings((state) => state.setLastMethod)

  const method = useMemo(
    () => METHOD_OPTIONS.find((m) => m.id === lastMethod) ?? FALLBACK_METHOD,
    [lastMethod],
  )

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
        aria-valuenow={0}
        className="h-[2px] w-full bg-paper-sunken"
      >
        <div className="h-full w-0 bg-accent" />
      </div>

      <main className="flex flex-1 flex-col justify-center px-6 pb-10 sm:px-10">
        <h1 className="angka text-center text-[clamp(5.5rem,21vw,17rem)]">25:00</h1>

        <p className="mt-6 text-center text-sm text-ink-muted">
          Mesin timer, siklus, dan pemulihan state masuk di milestone M1.
        </p>

        <div
          id="kontrol-timer"
          tabIndex={-1}
          className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
        >
          <button
            type="button"
            aria-disabled="true"
            className="cursor-not-allowed rounded-md bg-paper-sunken px-7 py-3 text-base font-semibold text-ink-muted"
          >
            Mulai
          </button>
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
            {METHOD_OPTIONS.map((item, index) => {
              const active = item.id === method.id
              return (
                <li key={item.id} style={{ flexBasis: '9rem' }} className="min-w-0">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setLastMethod(item.id)}
                    className={
                      'w-full min-w-0 overflow-hidden grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 rounded-md border px-4 py-2 text-left text-sm text-ink transition-colors ' +
                      (active
                        ? 'border-ink bg-ink text-paper'
                        : 'border-line hover:border-line-strong')
                    }
                  >
                    <span className="angka row-span-2 self-center text-base">{index + 1}</span>
                    <span className="font-semibold">{item.name}</span>
                    <span className="text-xs opacity-70">{item.detail}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      </main>

      <footer className="border-t border-line px-6 py-4 sm:px-10">
        <p className="text-sm text-ink-muted">M0: kerangka dan token desain sudah berdiri.</p>
      </footer>
    </div>
  )
}
