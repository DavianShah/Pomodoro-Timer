import { create } from 'zustand'
import { DEFAULT_METHOD, SETTINGS_KEY, STORAGE_VERSION } from '@/app/constants'
import { db } from '@/db/db'
import { read, storageWorks, write } from '@/lib/storage'

export type ThemeChoice = 'system' | 'light' | 'dark'

export interface AppSettings {
  theme: ThemeChoice
  lastMethod: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  lastMethod: DEFAULT_METHOD,
}

const isTheme = (value: unknown): value is ThemeChoice =>
  value === 'system' || value === 'light' || value === 'dark'

export function parseSettings(value: unknown): AppSettings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_SETTINGS }
  const raw = value as Record<string, unknown>
  return {
    theme: isTheme(raw.theme) ? raw.theme : DEFAULT_SETTINGS.theme,
    lastMethod: typeof raw.lastMethod === 'string' && raw.lastMethod ? raw.lastMethod : DEFAULT_METHOD,
  }
}

interface SettingsState {
  settings: AppSettings
  /** false = IndexedDB tidak bisa diandalkan; riwayat sesi mati, timer tetap jalan. */
  databaseAvailable: boolean
  setTheme: (theme: ThemeChoice) => void
  setLastMethod: (method: string) => void
  load: () => Promise<void>
}

function persistLocal(settings: AppSettings): void {
  write(SETTINGS_KEY, STORAGE_VERSION, settings)
}

async function persistDb(settings: AppSettings): Promise<void> {
  try {
    await db.settings.put({ id: 'app', value: settings })
  } catch (error) {
    console.warn('Ritme: pengaturan gagal disimpan ke IndexedDB', error)
    useSettings.setState({ databaseAvailable: false })
  }
}

export const useSettings = create<SettingsState>()((set, get) => {
  const save = (patch: Partial<AppSettings>) => {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    persistLocal(settings)
    void persistDb(settings)
  }

  return {
    settings: { ...DEFAULT_SETTINGS },
    databaseAvailable: true,
    setTheme: (theme) => save({ theme }),
    setLastMethod: (lastMethod) => save({ lastMethod }),
    load: async () => {
      const local = read<AppSettings>(SETTINGS_KEY, { ...DEFAULT_SETTINGS }, (v): v is AppSettings =>
        typeof v === 'object' && v !== null,
      )

      let fromDb: AppSettings | undefined
      try {
        const row = await db.settings.get('app')
        if (row) fromDb = parseSettings(row.value)
      } catch (error) {
        console.warn('Ritme: IndexedDB tidak tersedia', error)
        set({ databaseAvailable: false })
      }

      const settings = fromDb ?? parseSettings(local)
      if (!fromDb) void persistDb(settings)
      set({ settings })
      persistLocal(settings)

      if (!storageWorks()) {
        console.warn('Ritme: localStorage tidak bisa ditulis, preferensi tidak bertahan')
      }
    },
  }
})

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): 'light' | 'dark' {
  return choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice
}
