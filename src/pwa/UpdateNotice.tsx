import { useSwUpdate } from './update'

/**
 * Service worker update row (PRD F15): one `role="status"` line, the user
 * decides whether to reload. Hidden while the timer runs — it appears as
 * soon as the timer stops.
 */
export default function UpdateNotice({ running }: { running: boolean }) {
  const ready = useSwUpdate((state) => state.ready)
  const reload = useSwUpdate((state) => state.reload)

  if (!ready || running) return null

  return (
    <div
      role="status"
      className="mt-4 flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm"
    >
      <span className="text-ink-muted">A new version is available.</span>
      <button
        type="button"
        onClick={reload}
        className="rounded-md border border-line-strong px-4 py-2 text-sm text-ink transition-colors hover:border-ink-muted"
      >
        Reload
      </button>
    </div>
  )
}
