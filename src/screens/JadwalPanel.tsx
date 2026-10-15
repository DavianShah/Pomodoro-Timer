/**
 * Schedule panel (F16): a vertical 24-hour timeline with drag to create
 * blocks and a keyboard form to create/edit. Mirrors the TaskPanel pattern
 * (right aside, Escape closes, header + Close button). A block is an accent
 * `border-left` on paper — not a card, not a gradient.
 */
import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import type { BlockRow } from '@/db/db'
import { useBlocks } from '@/state/blocks'
import { useSettings } from '@/state/settings'
import { useTasks } from '@/state/tasks'
import { DAY_MIN, dayMinutesOf, formatBlockRange, formatMin, snapMin } from '@/timer/blocks'

interface JadwalPanelProps {
  onClose: () => void
}

/** 15 minutes = 16 px: a one-line label fits, drag is precise enough. */
const TIMELINE_HEIGHT = '1536px'
/** Hour label every 3 hours (00:00–24:00) — a sparse ruler, not every hour. */
const LABEL_STEP = 3

function percent(minute: number): number {
  return (minute / DAY_MIN) * 100
}

/** Y point → minutes snapped to 15, clamped to the day range. */
function minuteAt(clientY: number, rect: DOMRect): number {
  const ratio = (clientY - rect.top) / rect.height
  const minute = Math.min(Math.max(ratio * DAY_MIN, 0), DAY_MIN)
  return snapMin(minute)
}

/** `HH:MM` → minutes; an unrecognized format = null. */
function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (match === null) return null
  const hour = match[1]
  const minute = match[2]
  if (hour === undefined || minute === undefined) return null
  const h = Number(hour)
  const m = Number(minute)
  if (!Number.isInteger(h) || !Number.isInteger(m) || h > 24 || m > 59 || (h === 24 && m > 0)) {
    return null
  }
  return Math.min(h * 60 + m, DAY_MIN)
}

/** Minutes → `type="time"` input value (24:00 still possible via snap). */
function toTimeValue(minute: number): string {
  return formatMin(Math.min(minute, DAY_MIN - 1))
}

function dateLabel(date: string): string {
  const [year, month, day] = date.split('-')
  const parsed =
    year !== undefined && month !== undefined && day !== undefined
      ? new Date(Number(year), Number(month) - 1, Number(day))
      : new Date()
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed)
}

export default function JadwalPanel({ onClose }: JadwalPanelProps) {
  const blocks = useBlocks((state) => state.blocks)
  const date = useBlocks((state) => state.date)
  const create = useBlocks((state) => state.create)
  const edit = useBlocks((state) => state.edit)
  const remove = useBlocks((state) => state.remove)
  const tasks = useTasks((state) => state.tasks)
  const databaseAvailable = useSettings((state) => state.databaseAvailable)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [startInput, setStartInput] = useState('09:00')
  const [endInput, setEndInput] = useState('10:00')
  const [taskId, setTaskId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ startMin: number; endMin: number } | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const timelineRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<number | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  // The "now" marker moves slowly; seconds are not needed.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // Focus lands on the panel as soon as it opens (same as the task/stats
  // panels): Escape inside closes it and the Schedule button receives focus again.
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  const taskTitle = (id: string | undefined): string | null =>
    id === undefined ? null : (tasks.find((task) => task.id === id)?.title ?? null)

  const openCreateForm = (): void => {
    const minute = snapMin(Math.min(dayMinutesOf(now), DAY_MIN - 60))
    setEditingId(null)
    setStartInput(toTimeValue(minute))
    setEndInput(toTimeValue(Math.min(minute + 60, DAY_MIN)))
    setTaskId('')
    setError(null)
    setFormOpen(true)
  }

  const startEdit = (block: BlockRow): void => {
    setEditingId(block.id)
    setStartInput(toTimeValue(block.startMin))
    setEndInput(toTimeValue(block.endMin))
    setTaskId(block.taskId ?? '')
    setError(null)
    setFormOpen(true)
    formRef.current?.scrollIntoView({ block: 'start' })
  }

  const closeForm = (): void => {
    setFormOpen(false)
    setEditingId(null)
    setError(null)
  }

  const save = async (): Promise<void> => {
    const startMin = parseTime(startInput)
    const endMin = parseTime(endInput)
    if (startMin === null || endMin === null) {
      setError('Invalid time')
      return
    }
    const fields = { startMin, endMin, ...(taskId !== '' ? { taskId } : {}) }
    const message = editingId !== null ? await edit(editingId, fields) : await create(fields)
    if (message !== null) {
      setError(message)
      return
    }
    closeForm()
  }

  const submitForm = (event: FormEvent): void => {
    event.preventDefault()
    void save()
  }

  const deleteCurrent = (): void => {
    if (editingId === null) return
    void remove(editingId)
    closeForm()
  }

  const onTimelinePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    const rect = timelineRef.current?.getBoundingClientRect()
    if (rect === undefined) return
    // Blocks have their own button — do not start a drag on top of one.
    if (event.target !== event.currentTarget) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const anchor = Math.min(minuteAt(event.clientY, rect), DAY_MIN - 15)
    anchorRef.current = anchor
    setDrag({ startMin: anchor, endMin: anchor + 15 })
  }

  const onTimelinePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const anchor = anchorRef.current
    const rect = timelineRef.current?.getBoundingClientRect()
    if (anchor === null || rect === undefined) return
    const cursor = minuteAt(event.clientY, rect)
    const startMin = Math.min(anchor, cursor)
    const endMin = Math.max(anchor, cursor, startMin + 15)
    setDrag({ startMin, endMin })
  }

  const onTimelinePointerUp = (): void => {
    const anchor = anchorRef.current
    anchorRef.current = null
    if (anchor === null || drag === null) return
    const draft = drag
    setDrag(null)
    void (async (): Promise<void> => {
      const message = await create({ startMin: draft.startMin, endMin: draft.endMin })
      setError(message)
    })()
  }

  const hourLabels: number[] = []
  for (let hour = 0; hour <= 24; hour += LABEL_STEP) hourLabels.push(hour * 60)

  const nowMinute = Math.min(dayMinutesOf(now), DAY_MIN)

  return (
    <aside
      ref={panelRef}
      id="panel-jadwal"
      aria-label="Schedule"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !formOpen) onClose()
      }}
      className="fixed inset-y-0 right-0 z-40 flex w-80 max-w-full flex-col border-l border-line bg-paper-raised"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h2 className="label">Schedule</h2>
          <p className="mt-0.5 text-xs text-ink-muted">{dateLabel(date)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-line-strong px-3 py-1 text-xs text-ink-muted transition-colors hover:border-ink-muted"
        >
          Close
        </button>
      </div>

      {!databaseAvailable ? (
        <p role="status" className="px-4 py-3 text-sm text-ink-muted">
          Schedule disabled — browser storage is unavailable.
        </p>
      ) : (
        <>
          {formOpen ? (
            <form
              id="blok-form"
              ref={formRef}
              onSubmit={submitForm}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation()
                  closeForm()
                }
              }}
              className="border-b border-line px-4 py-3"
            >
              <p className="label">{editingId !== null ? 'Edit block' : 'New block'}</p>
              <div className="mt-2 flex gap-2">
                <label className="min-w-0 flex-1 text-xs text-ink-muted">
                  Start
                  <input
                    id="blok-mulai"
                    type="time"
                    step={900}
                    required
                    value={startInput}
                    onChange={(event) => setStartInput(event.target.value)}
                    className="angka mt-1 w-full rounded-md border border-line-strong bg-paper px-2 py-1.5 text-sm text-ink"
                  />
                </label>
                <label className="min-w-0 flex-1 text-xs text-ink-muted">
                  End
                  <input
                    id="blok-selesai"
                    type="time"
                    step={900}
                    required
                    value={endInput}
                    onChange={(event) => setEndInput(event.target.value)}
                    className="angka mt-1 w-full rounded-md border border-line-strong bg-paper px-2 py-1.5 text-sm text-ink"
                  />
                </label>
              </div>
              <label className="mt-2 block text-xs text-ink-muted">
                Task
                <select
                  id="blok-task"
                  value={taskId}
                  onChange={(event) => setTaskId(event.target.value)}
                  className="mt-1 w-full rounded-md border border-line-strong bg-paper px-2 py-1.5 text-sm text-ink"
                >
                  <option value="">No task</option>
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-3 flex gap-2">
                <button
                  type="submit"
                  className="rounded-md border border-line-strong px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-ink-muted"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-md border border-line-strong px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-ink-muted"
                >
                  Cancel
                </button>
                {editingId !== null && (
                  <button
                    type="button"
                    onClick={deleteCurrent}
                    className="rounded-md border border-line-strong px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-ink-muted"
                  >
                    Delete
                  </button>
                )}
              </div>
              {error !== null && (
                <p role="status" className="mt-2 text-xs text-ink">
                  {error}
                </p>
              )}
            </form>
          ) : (
            <div className="border-b border-line px-4 py-3">
              <button
                type="button"
                onClick={openCreateForm}
                className="rounded-md border border-line-strong px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-ink-muted"
              >
                Add block
              </button>
              {error !== null && (
                <p role="status" className="mt-2 text-xs text-ink">
                  {error}
                </p>
              )}
            </div>
          )}

          {/* Keyboard scrolling: an overflow region must be focusable without a mouse. */}
          <div tabIndex={0} className="flex-1 overflow-y-auto px-4 py-3">
            <div
              id="timeline-blok"
              ref={timelineRef}
              onPointerDown={onTimelinePointerDown}
              onPointerMove={onTimelinePointerMove}
              onPointerUp={onTimelinePointerUp}
              className="relative select-none border-t border-line touch-none"
              style={{ height: TIMELINE_HEIGHT }}
            >
              {hourLabels.map((minute) => (
                <div key={minute} className="pointer-events-none">
                  <span
                    className="angka absolute left-0 -translate-y-1/2 text-[10px] text-ink-muted"
                    style={{ top: `${percent(minute)}%` }}
                  >
                    {formatMin(minute)}
                  </span>
                  <span
                    className="absolute left-12 right-0 h-px bg-line"
                    style={{ top: `${percent(minute)}%` }}
                  />
                </div>
              ))}

              <span
                className="pointer-events-none absolute left-12 right-0 h-px bg-accent"
                style={{ top: `${percent(nowMinute)}%` }}
                aria-hidden="true"
              />

              {blocks.map((block) => {
                const title = taskTitle(block.taskId)
                return (
                  <button
                    key={block.id}
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => startEdit(block)}
                    style={{
                      top: `${percent(block.startMin)}%`,
                      height: `${percent(block.endMin - block.startMin)}%`,
                    }}
                    className="absolute left-12 right-0 flex items-center gap-2 overflow-hidden border-l-2 border-accent bg-paper-sunken px-2 text-left text-[10px] text-ink hover:bg-paper"
                  >
                    <span className="angka shrink-0">{formatBlockRange(block)}</span>
                    {title !== null && <span className="min-w-0 truncate">{title}</span>}
                    {block.status === 'overrun' && (
                      <span className="ml-auto shrink-0 text-ink-muted">overrun</span>
                    )}
                  </button>
                )
              })}

              {drag !== null && (
                <div
                  className="pointer-events-none absolute left-12 right-0 border-l-2 border-accent bg-paper-sunken opacity-60"
                  style={{
                    top: `${percent(drag.startMin)}%`,
                    height: `${percent(drag.endMin - drag.startMin)}%`,
                  }}
                />
              )}
            </div>

            {blocks.length === 0 && (
              <p className="mt-3 text-sm text-ink-muted">No blocks today yet.</p>
            )}
            <p className="mt-3 text-xs text-ink-muted">
              Drag on the timeline to create a block, click a block to edit.
            </p>
          </div>
        </>
      )}
    </aside>
  )
}
