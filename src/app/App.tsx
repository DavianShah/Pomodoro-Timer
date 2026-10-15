import { useEffect } from 'react'
import TimerScreen from '@/screens/TimerScreen'
import { useSettings } from '@/state/settings'
import { ThemeProvider } from './ThemeProvider'

export default function App() {
  const load = useSettings((state) => state.load)
  const databaseAvailable = useSettings((state) => state.databaseAvailable)

  useEffect(() => {
    void load()
  }, [load])

  return (
    <ThemeProvider>
      <a
        href="#kontrol-timer"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-10 focus:rounded-md focus:border focus:border-line-strong focus:bg-paper-raised focus:px-4 focus:py-2 focus:text-sm"
      >
        Skip to timer controls
      </a>
      {!databaseAvailable && (
        <p role="status" className="bg-paper-sunken px-6 py-3 text-sm text-ink-muted sm:px-10">
          Session history and tasks cannot be saved: browser storage is unavailable. The timer keeps
          running.
        </p>
      )}
      <TimerScreen />
    </ThemeProvider>
  )
}
