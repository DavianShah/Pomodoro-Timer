import { create } from 'zustand'
import { DEFAULT_METHOD, SETTINGS_KEY, STORAGE_VERSION } from '@/app/constants'
import { db } from '@/db/db'
import { read, storageWorks, write } from '@/lib/storage'
import type { AlarmSound } from '@/timer/alarm'
import { DEFAULT_AMBIENT_VOLUME, type AmbientSound } from '@/timer/ambient'
import {
  configureMethods,
  DEFAULT_CUSTOM,
  DURATION_LIMITS,
  EDITABLE_METHOD_IDS,
  inDurationRange,
  type CustomConfig,
  type DurationOverride,
  type EditableMethodId,
} from '@/timer/methods'

export type ThemeChoice = 'system' | 'light' | 'dark'

/** Simpanan Custom di pengaturan: nilai + nama preset sumber (null = buatan tangan). */
export interface StoredCustom extends CustomConfig {
  presetName: string | null
}

export interface AppSettings {
  theme: ThemeChoice
  lastMethod: string
  /** Task aktif untuk sesi fokus berikutnya; null = tanpa task (F9). */
  activeTaskId: string | null
  /** Wake Lock: layar tetap menyala saat timer jalan (F14). */
  wakeLock: boolean
  /** Nada alarm sesi selesai (F13). */
  alarmSound: AlarmSound
  /** Alarm berbunyi saat sesi selesai (F13). */
  alarmEnabled: boolean
  /** Notifikasi browser saat sesi selesai (F5/F13). */
  notifications: boolean
  /** Suara ambient saat timer berjalan (F13). */
  ambient: AmbientSound
  /** Volume ambient 0–1. */
  ambientVolume: number
  /** Override durasi per metode (F3); absen = bawaan metode. */
  durations: Partial<Record<EditableMethodId, DurationOverride>>
  /** Konfigurasi metode Custom; null = korup/tidak ada — engine jatuh ke Pomodoro. */
  custom: StoredCustom | null
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  lastMethod: DEFAULT_METHOD,
  activeTaskId: null,
  wakeLock: true,
  alarmSound: 'bip',
  alarmEnabled: true,
  notifications: true,
  ambient: 'off',
  ambientVolume: DEFAULT_AMBIENT_VOLUME,
  durations: {},
  custom: { ...DEFAULT_CUSTOM, presetName: null },
}

const ALARM_SOUNDS: readonly AlarmSound[] = ['bip', 'lembut', 'rendah']
const AMBIENT_SOUNDS: readonly AmbientSound[] = ['off', 'hujan', 'kipas', 'brown']

export const isAlarmSound = (value: unknown): value is AlarmSound =>
  typeof value === 'string' && (ALARM_SOUNDS as readonly string[]).includes(value)

export const isAmbientSound = (value: unknown): value is AmbientSound =>
  typeof value === 'string' && (AMBIENT_SOUNDS as readonly string[]).includes(value)

const isTheme = (value: unknown): value is ThemeChoice =>
  value === 'system' || value === 'light' || value === 'dark'

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/**
 * Parse satu override durasi: focus+break wajib valid; longBreak/cycle
 * opsional dan divalidasi hanya bila ada. Tidak utuh → null (bawaan).
 */
function parseOverride(value: unknown): DurationOverride | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (!isFiniteNumber(raw.focusMs) || !inDurationRange('focus', raw.focusMs)) return null
  if (!isFiniteNumber(raw.breakMs) || !inDurationRange('break', raw.breakMs)) return null
  const override: DurationOverride = { focusMs: raw.focusMs, breakMs: raw.breakMs }
  if (raw.longBreakMs !== undefined && raw.longBreakMs !== null) {
    if (!isFiniteNumber(raw.longBreakMs) || !inDurationRange('longBreak', raw.longBreakMs))
      return null
    override.longBreakMs = raw.longBreakMs
  }
  if (raw.cycle !== undefined && raw.cycle !== null) {
    if (!isFiniteNumber(raw.cycle) || !inDurationRange('cycle', raw.cycle)) return null
    override.cycle = raw.cycle
  }
  return override
}

function parseDurations(value: unknown): AppSettings['durations'] {
  if (typeof value !== 'object' || value === null) return {}
  const raw = value as Record<string, unknown>
  const durations: AppSettings['durations'] = {}
  for (const id of EDITABLE_METHOD_IDS) {
    const override = parseOverride(raw[id])
    if (override !== null) durations[id] = override
  }
  return durations
}

function parseCustom(value: unknown): StoredCustom | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (!isFiniteNumber(raw.focusMs) || !inDurationRange('focus', raw.focusMs)) return null
  if (!isFiniteNumber(raw.breakMs) || !inDurationRange('break', raw.breakMs)) return null
  let longBreakMs: number | null = null
  if (raw.longBreakMs !== null && raw.longBreakMs !== undefined) {
    if (!isFiniteNumber(raw.longBreakMs) || !inDurationRange('longBreak', raw.longBreakMs))
      return null
    longBreakMs = raw.longBreakMs
  }
  let cycle = 1
  if (raw.cycle !== null && raw.cycle !== undefined) {
    // Siklus 1 = tanpa siklus (toggle mati); input pengguna dibatasi 2–8.
    if (
      !isFiniteNumber(raw.cycle) ||
      !Number.isInteger(raw.cycle) ||
      raw.cycle < 1 ||
      raw.cycle > DURATION_LIMITS.cycle.max
    )
      return null
    cycle = raw.cycle
  }
  return {
    focusMs: raw.focusMs,
    breakMs: raw.breakMs,
    longBreakMs,
    cycle,
    presetName: typeof raw.presetName === 'string' && raw.presetName ? raw.presetName : null,
  }
}

export function parseSettings(value: unknown): AppSettings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_SETTINGS }
  const raw = value as Record<string, unknown>
  return {
    theme: isTheme(raw.theme) ? raw.theme : DEFAULT_SETTINGS.theme,
    lastMethod:
      typeof raw.lastMethod === 'string' && raw.lastMethod ? raw.lastMethod : DEFAULT_METHOD,
    activeTaskId:
      typeof raw.activeTaskId === 'string' && raw.activeTaskId ? raw.activeTaskId : null,
    wakeLock: typeof raw.wakeLock === 'boolean' ? raw.wakeLock : DEFAULT_SETTINGS.wakeLock,
    alarmSound: isAlarmSound(raw.alarmSound) ? raw.alarmSound : DEFAULT_SETTINGS.alarmSound,
    alarmEnabled:
      typeof raw.alarmEnabled === 'boolean' ? raw.alarmEnabled : DEFAULT_SETTINGS.alarmEnabled,
    notifications:
      typeof raw.notifications === 'boolean' ? raw.notifications : DEFAULT_SETTINGS.notifications,
    ambient: isAmbientSound(raw.ambient) ? raw.ambient : DEFAULT_SETTINGS.ambient,
    ambientVolume:
      isFiniteNumber(raw.ambientVolume) && raw.ambientVolume >= 0 && raw.ambientVolume <= 1
        ? raw.ambientVolume
        : DEFAULT_SETTINGS.ambientVolume,
    durations: parseDurations(raw.durations),
    // Field ada tapi rusak → null (restore jatuh ke Pomodoro); absen =
    // penyimpanan lama → default Custom.
    custom: 'custom' in raw ? parseCustom(raw.custom) : DEFAULT_SETTINGS.custom,
  }
}

interface SettingsState {
  settings: AppSettings
  /** false = IndexedDB tidak bisa diandalkan; riwayat sesi mati, timer tetap jalan. */
  databaseAvailable: boolean
  /** true = pengaturan tersimpan sudah terbaca; sebelum itu tema boot tidak boleh ditimpa default 'system'. */
  settingsLoaded: boolean
  setTheme: (theme: ThemeChoice) => void
  setLastMethod: (method: string) => void
  setActiveTask: (taskId: string | null) => void
  setWakeLock: (wakeLock: boolean) => void
  setAlarmSound: (alarmSound: AlarmSound) => void
  setAlarmEnabled: (alarmEnabled: boolean) => void
  setNotifications: (notifications: boolean) => void
  setAmbient: (ambient: AmbientSound) => void
  setAmbientVolume: (ambientVolume: number) => void
  /** Setel/hapus override durasi satu metode (null = kembali bawaan). */
  setDuration: (methodId: EditableMethodId, override: DurationOverride | null) => void
  /** Ganti konfigurasi Custom (dipakai panel pengaturan dan penerapan preset). */
  setCustom: (custom: StoredCustom | null) => void
  /** Pilih metode Custom, mengisi konfigurasi default bila belum ada. */
  selectCustom: () => void
  /** Kembalikan seluruh durasi (override + Custom) ke bawaan metode. */
  resetDurations: () => void
  load: () => Promise<void>
}

function persistLocal(settings: AppSettings): void {
  write(SETTINGS_KEY, STORAGE_VERSION, settings)
}

/** Registry metode ikut diperbarui setiap pengaturan berubah (PRD F3). */
function applyMethods(settings: AppSettings): void {
  configureMethods({ durations: settings.durations, custom: settings.custom })
}

/** Atur registry metode dari pengaturan lokal secara sinkron (jalur boot). */
export function configureMethodsFromLocal(): void {
  const local = read<unknown>(SETTINGS_KEY, null)
  applyMethods(parseSettings(local))
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
  // Pilihan yang dibuat saat pemuatan masih berjalan (tema diklik sebelum
  // IndexedDB terbaca) sudah disimpan save(); nilai baca di bawah diambil
  // lebih awal dan tidak boleh menimpanya.
  let changedDuringLoad = false

  const save = (patch: Partial<AppSettings>) => {
    if (!get().settingsLoaded) changedDuringLoad = true
    const settings = { ...get().settings, ...patch }
    set({ settings })
    applyMethods(settings)
    persistLocal(settings)
    void persistDb(settings)
  }

  return {
    settings: { ...DEFAULT_SETTINGS },
    databaseAvailable: true,
    settingsLoaded: false,
    setTheme: (theme) => save({ theme }),
    setLastMethod: (lastMethod) => save({ lastMethod }),
    setActiveTask: (activeTaskId) => save({ activeTaskId }),
    setWakeLock: (wakeLock) => save({ wakeLock }),
    setAlarmSound: (alarmSound) => save({ alarmSound }),
    setAlarmEnabled: (alarmEnabled) => save({ alarmEnabled }),
    setNotifications: (notifications) => save({ notifications }),
    setAmbient: (ambient) => save({ ambient }),
    setAmbientVolume: (ambientVolume) =>
      save({ ambientVolume: Math.min(1, Math.max(0, ambientVolume)) }),
    setDuration: (methodId, override) => {
      const durations = { ...get().settings.durations }
      if (override === null) delete durations[methodId]
      else durations[methodId] = override
      save({ durations })
    },
    setCustom: (custom) => save({ custom }),
    selectCustom: () =>
      save({
        custom: get().settings.custom ?? { ...DEFAULT_CUSTOM, presetName: null },
        lastMethod: 'custom',
      }),
    resetDurations: () => save({ durations: {}, custom: { ...DEFAULT_CUSTOM, presetName: null } }),
    load: async () => {
      changedDuringLoad = false
      // localStorage ditulis sinkron oleh save() sebelum antrian IndexedDB —
      // sumber yang lebih baru, jadi menang bila ada. IndexedDB hanya cadangan
      // (mencadangkan bila localStorage kosong/tidak utuh).
      const rawLocal = read<unknown>(SETTINGS_KEY, null)
      const local =
        rawLocal !== null && typeof rawLocal === 'object' && !Array.isArray(rawLocal)
          ? parseSettings(rawLocal)
          : null

      let fromDb: AppSettings | undefined
      try {
        const row = await db.settings.get('app')
        if (row) fromDb = parseSettings(row.value)
      } catch (error) {
        console.warn('Ritme: IndexedDB tidak tersedia', error)
        set({ databaseAvailable: false })
      }

      if (changedDuringLoad) {
        set({ settingsLoaded: true })
      } else {
        const settings = local ?? fromDb ?? { ...DEFAULT_SETTINGS }
        void persistDb(settings)
        set({ settings, settingsLoaded: true })
        applyMethods(settings)
        persistLocal(settings)
      }

      if (!storageWorks()) {
        console.warn('Ritme: localStorage tidak bisa ditulis, preferensi tidak bertahan')
      }
    },
  }
})

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): 'light' | 'dark' {
  return choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice
}
