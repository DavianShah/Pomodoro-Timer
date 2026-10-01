import { useSwUpdate } from './update'

/**
 * Baris pembaruan service worker (PRD F15): satu baris `role="status"`,
 * user yang memutuskan muat ulang. Tidak ditampilkan selama timer
 * berjalan — muncul begitu timer berhenti.
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
      <span className="text-ink-muted">Versi baru tersedia.</span>
      <button
        type="button"
        onClick={reload}
        className="rounded-md border border-line-strong px-4 py-2 text-sm text-ink transition-colors hover:border-ink-muted"
      >
        Muat ulang
      </button>
    </div>
  )
}
