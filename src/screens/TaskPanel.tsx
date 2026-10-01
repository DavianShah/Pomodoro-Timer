import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useSettings } from '@/state/settings'
import { useTasks } from '@/state/tasks'

interface TaskPanelProps {
  onClose: () => void
}

/**
 * Panel task (F9): daftar bergaris 1px, tanpa ikon — bukan tumpukan kartu.
 * Dirmount hanya saat terbuka (focus input jatuh ke tempatnya sendiri).
 */
export default function TaskPanel({ onClose }: TaskPanelProps) {
  const tasks = useTasks((state) => state.tasks)
  const add = useTasks((state) => state.add)
  const rename = useTasks((state) => state.rename)
  const toggleDone = useTasks((state) => state.toggleDone)
  const remove = useTasks((state) => state.remove)
  const setActive = useTasks((state) => state.setActive)
  const activeTaskId = useSettings((state) => state.settings.activeTaskId)
  const databaseAvailable = useSettings((state) => state.databaseAvailable)

  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submitNew = (event: FormEvent): void => {
    event.preventDefault()
    void add(draft)
    setDraft('')
  }

  const startEdit = (id: string, title: string): void => {
    setEditingId(id)
    setEditDraft(title)
  }

  const submitEdit = (event: FormEvent): void => {
    event.preventDefault()
    if (editingId !== null) void rename(editingId, editDraft)
    setEditingId(null)
  }

  const onRowKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      setEditingId(null)
    }
  }

  return (
    <aside
      id="panel-task"
      aria-label="Task"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
      className="fixed inset-y-0 right-0 z-40 flex w-80 max-w-full flex-col border-l border-line bg-paper-raised"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="label">Task</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-line-strong px-3 py-1 text-xs text-ink-muted transition-colors hover:border-ink-muted"
        >
          Tutup
        </button>
      </div>

      {!databaseAvailable ? (
        <p role="status" className="px-4 py-3 text-sm text-ink-muted">
          Task nonaktif — penyimpanan browser tidak tersedia.
        </p>
      ) : (
        <>
          <form onSubmit={submitNew} className="border-b border-line px-4 py-3">
            <label htmlFor="task-baru" className="sr-only">
              Task baru
            </label>
            <input
              id="task-baru"
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Nama task"
              autoComplete="off"
              className="w-full rounded-md border border-line-strong bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
            />
            <p className="mt-1.5 text-xs text-ink-muted">Enter untuk menambah.</p>
          </form>

          <ul className="flex-1 overflow-y-auto">
            {tasks.length === 0 && (
              <li className="px-4 py-3 text-sm text-ink-muted">Belum ada task.</li>
            )}
            {tasks.map((task) => {
              if (editingId === task.id) {
                return (
                  <li key={task.id} className="border-b border-line px-4 py-2">
                    <form onSubmit={submitEdit} onKeyDown={onRowKeyDown}>
                      <label htmlFor={`ubah-${task.id}`} className="sr-only">
                        Ubah judul task
                      </label>
                      <input
                        id={`ubah-${task.id}`}
                        autoFocus
                        value={editDraft}
                        onChange={(event) => setEditDraft(event.target.value)}
                        className="w-full rounded-md border border-line-strong bg-paper px-2 py-1.5 text-sm text-ink"
                      />
                      <p className="mt-1 text-xs text-ink-muted">Enter simpan, Esc batal.</p>
                    </form>
                  </li>
                )
              }

              const selected = task.id === activeTaskId
              return (
                <li
                  key={task.id}
                  className="flex items-center gap-2 border-b border-line px-3 py-2"
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setActive(task.id)}
                    className={
                      'min-w-0 flex-1 rounded-md border px-2 py-1.5 text-left transition-colors ' +
                      (selected
                        ? 'border-ink bg-ink text-paper'
                        : 'border-transparent hover:bg-paper-sunken')
                    }
                  >
                    <span
                      className={
                        'block truncate text-sm ' +
                        (task.doneAt
                          ? 'text-ink-muted line-through'
                          : selected
                            ? 'text-paper'
                            : 'text-ink')
                      }
                    >
                      {task.title}
                    </span>
                    <span
                      className={
                        'angka block text-xs ' + (selected ? 'opacity-75' : 'text-ink-muted')
                      }
                    >
                      {task.sessionCount} sesi
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleDone(task.id)}
                    className="rounded-md border border-line-strong px-2 py-1 text-xs text-ink-muted transition-colors hover:border-ink-muted"
                  >
                    {task.doneAt ? 'Aktifkan' : 'Selesai'}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(task.id, task.title)}
                    className="rounded-md border border-line-strong px-2 py-1 text-xs text-ink-muted transition-colors hover:border-ink-muted"
                  >
                    Ubah
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(task.id)}
                    className="rounded-md border border-line-strong px-2 py-1 text-xs text-ink-muted transition-colors hover:border-ink-muted"
                  >
                    Hapus
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </aside>
  )
}
