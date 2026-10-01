import { useEffect, useRef, useState } from 'react'
import { loadSessionsThrough } from '@/data/sessions'
import { useTasks } from '@/state/tasks'
import { localDateKey } from '@/timer/sessionRecord'
import {
  buildStats,
  formatFocusMs,
  formatFocusShort,
  type DayStat,
  type GroupStat,
  type StatsView,
} from '@/stats/aggregate'

interface StatsPanelProps {
  onClose: () => void
}

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']

function dayName(key: string): string {
  return DAY_NAMES[new Date(`${key}T12:00:00`).getDay()] ?? ''
}

/**
 * Panel statistik (F10) dan streak (F11): pola sama dengan TaskPanel —
 * aside kanan yang ditutup Escape. Grafik batang SVG buatan sendiri,
 * satu aksen token, tanpa library chart dan tanpa pie.
 */
export default function StatsPanel({ onClose }: StatsPanelProps) {
  const tasks = useTasks((state) => state.tasks)
  const [view, setView] = useState<StatsView | null>(null)
  const [failed, setFailed] = useState(false)
  const panelRef = useRef<HTMLElement>(null)

  // Fokus jatuh ke panel begitu terbuka; Escape di dalam panel menutup.
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // Satu baca lewat indeks `date`; judul task ikut dari store yang sama.
  useEffect(() => {
    let cancelled = false
    const todayKey = localDateKey(Date.now())
    void loadSessionsThrough(todayKey)
      .then((sessions) => {
        if (cancelled) return
        setView(buildStats({ sessions, tasks, todayKey }))
      })
      .catch((error: unknown) => {
        if (cancelled) return
        console.warn('Statistik gagal dibaca', error)
        setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [tasks])

  return (
    <aside
      ref={panelRef}
      id="panel-statistik"
      aria-label="Statistik"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-full flex-col border-l border-line bg-paper-raised sm:w-[27rem]"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="label">Statistik</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-line px-3 py-1 text-xs text-ink-muted transition-colors hover:border-line-strong"
        >
          Tutup
        </button>
      </div>

      {failed ? (
        <p role="status" className="px-4 py-4 text-sm text-ink-muted">
          Statistik tidak bisa dibaca.
        </p>
      ) : view === null ? (
        <p className="px-4 py-4 text-sm text-ink-muted">Memuat.</p>
      ) : !view.hasAnySession ? (
        <p className="px-4 py-4 text-sm text-ink-muted">Belum ada sesi fokus.</p>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <section className="border-b border-line px-4 py-4">
            <h3 className="label">Hari ini</h3>
            <p className="angka mt-2 text-2xl">{formatFocusMs(view.today.focusMs)}</p>
            <p className="mt-1 text-sm text-ink-muted">{view.today.completedCount} sesi selesai</p>
          </section>

          <section className="border-b border-line px-4 py-4">
            <h3 className="label">Streak</h3>
            <p className="mt-2 text-sm">
              Sekarang: <span className="angka">{view.streak.current}</span> hari
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              Terpanjang: <span className="angka">{view.streak.longest}</span> hari
            </p>
          </section>

          <section className="border-b border-line px-4 py-4">
            <h3 className="label">7 hari terakhir</h3>
            <WeekChart days={view.days} total={view.week.focusMs} />
            <p className="angka mt-2 text-sm">
              {formatFocusMs(view.week.focusMs)} · {view.week.completedCount} sesi
            </p>
            <p className="mt-1 text-xs text-ink-muted">tidak selesai: {view.incompleteCount}</p>
          </section>

          {view.methods.length > 0 && (
            <section className="border-b border-line px-4 py-4 last:border-b-0">
              <h3 className="label">Per metode</h3>
              <GroupList items={view.methods} />
            </section>
          )}

          {view.tasks.length > 0 && (
            <section className="border-b border-line px-4 py-4 last:border-b-0">
              <h3 className="label">Per task</h3>
              <GroupList items={view.tasks} />
            </section>
          )}
        </div>
      )}
    </aside>
  )
}

function GroupList({ items }: { items: GroupStat[] }) {
  const top = items[0]?.focusMs ?? 0
  return (
    <ul className="mt-3 space-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{item.label}</span>
            <span className="angka shrink-0 text-xs text-ink-muted">
              {formatFocusMs(item.focusMs)} · {item.completedCount} sesi
            </span>
          </div>
          <div className="mt-1.5 h-1 w-full bg-paper-sunken" aria-hidden="true">
            <div
              className="h-full bg-accent-focus"
              style={{ width: `${top > 0 ? Math.round((item.focusMs / top) * 100) : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function WeekChart({ days, total }: { days: DayStat[]; total: number }) {
  const max = Math.max(...days.map((day) => day.focusMs))
  const plotLeft = 44
  const plotRight = 316
  const plotTop = 26
  const baseline = 116
  const slot = (plotRight - plotLeft) / days.length
  const barWidth = 22
  const last = days.length - 1

  return (
    <>
      <svg
        viewBox="0 0 320 150"
        role="img"
        aria-label={`Grafik fokus 7 hari, total ${formatFocusMs(total)}`}
        className="mt-3 h-auto w-full"
      >
        <text x={40} y={plotTop + 4} textAnchor="end" className="fill-ink-muted text-[10px]">
          {formatFocusShort(max)}
        </text>
        <text x={40} y={baseline} textAnchor="end" className="fill-ink-muted text-[10px]">
          0
        </text>
        <line
          x1={plotLeft}
          y1={baseline}
          x2={plotRight}
          y2={baseline}
          className="stroke-ink-muted"
          strokeWidth={1}
        />
        {days.map((day, index) => {
          const slotX = plotLeft + index * slot
          const center = slotX + slot / 2
          const barX = slotX + (slot - barWidth) / 2
          const barHeight =
            day.focusMs > 0 && max > 0 ? Math.max(3, (day.focusMs / max) * (baseline - plotTop)) : 0
          const valueY = barHeight > 0 ? baseline - barHeight - 5 : baseline - 5
          const dayLabel = index === last ? 'fill-ink' : 'fill-ink-muted'
          return (
            <g key={day.date}>
              {barHeight > 0 && (
                <rect
                  x={barX}
                  y={baseline - barHeight}
                  width={barWidth}
                  height={barHeight}
                  className="fill-accent-focus"
                />
              )}
              <text
                x={center}
                y={valueY}
                textAnchor="middle"
                className="fill-ink-muted text-[10px]"
              >
                {day.focusMs > 0 ? formatFocusShort(day.focusMs) : '0'}
              </text>
              <text x={center} y={132} textAnchor="middle" className={`${dayLabel} text-[10px]`}>
                {dayName(day.date)}
              </text>
              <text x={center} y={145} textAnchor="middle" className={`${dayLabel} text-[10px]`}>
                {day.date.slice(8)}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Angka tetap tersedia sebagai teks untuk pembaca layar. */}
      <table className="sr-only">
        <caption>Waktu fokus per hari, 7 hari terakhir</caption>
        <thead>
          <tr>
            <th scope="col">Tanggal</th>
            <th scope="col">Fokus</th>
            <th scope="col">Sesi selesai</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <th scope="row">{day.date}</th>
              <td>{formatFocusMs(day.focusMs)}</td>
              <td>{day.completedCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
