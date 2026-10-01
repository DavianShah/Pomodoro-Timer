/**
 * Store state task (F9). Komponen memanggil store ini; store memanggil
 * repository `src/data` — Dexie tidak pernah tersentuh UI. Setiap kegagalan
 * IndexedDB ditandai lewat `databaseAvailable` di settings (satu banner
 * role="status" untuk seluruh aplikasi) dan tidak pernah melempar ke UI.
 */
import { create } from 'zustand'
import type { TaskRow } from '@/db/db'
import { addTask, listTasks, removeTask, renameTask, setTaskDone } from '@/data/tasks'
import { useSettings } from './settings'

interface TasksState {
  tasks: TaskRow[]
  /** Panel task terbuka. */
  open: boolean
  load: () => Promise<void>
  /** Muat ulang daftar (dipanggil setelah rekaman sesi agar hitungan segar). */
  refresh: () => Promise<void>
  toggleOpen: () => void
  add: (title: string) => Promise<void>
  rename: (id: string, title: string) => Promise<void>
  toggleDone: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  /** Pilih/lepas task aktif untuk sesi fokus. */
  setActive: (id: string) => void
}

function markUnavailable(error: unknown): void {
  console.warn('Ritme: task tidak bisa diakses', error)
  useSettings.setState({ databaseAvailable: false })
}

export const useTasks = create<TasksState>()((set, get) => {
  const reload = async (): Promise<void> => {
    try {
      const tasks = await listTasks()
      set({ tasks })
      const active = useSettings.getState().settings.activeTaskId
      if (active !== null && !tasks.some((task) => task.id === active)) {
        useSettings.getState().setActiveTask(null)
      }
    } catch (error) {
      markUnavailable(error)
    }
  }

  return {
    tasks: [],
    open: false,
    load: reload,
    refresh: reload,
    toggleOpen: () => set({ open: !get().open }),
    add: async (title) => {
      const trimmed = title.trim()
      if (!trimmed) return
      try {
        await addTask(trimmed)
        await reload()
      } catch (error) {
        markUnavailable(error)
      }
    },
    rename: async (id, title) => {
      const trimmed = title.trim()
      if (!trimmed) return
      try {
        await renameTask(id, trimmed)
        await reload()
      } catch (error) {
        markUnavailable(error)
      }
    },
    toggleDone: async (id) => {
      const task = get().tasks.find((item) => item.id === id)
      if (!task) return
      try {
        await setTaskDone(id, task.doneAt ? null : Date.now())
        await reload()
      } catch (error) {
        markUnavailable(error)
      }
    },
    remove: async (id) => {
      try {
        await removeTask(id)
        if (useSettings.getState().settings.activeTaskId === id) {
          useSettings.getState().setActiveTask(null)
        }
        await reload()
      } catch (error) {
        markUnavailable(error)
      }
    },
    setActive: (id) => {
      const current = useSettings.getState().settings.activeTaskId
      useSettings.getState().setActiveTask(current === id ? null : id)
    },
  }
})
