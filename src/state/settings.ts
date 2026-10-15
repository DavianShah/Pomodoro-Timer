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

/** Custom store in settings: values + source preset name (null = hand-made). */
export interface StoredCustom extends CustomConfig {
  presetName: string | null
}

export interface AppSettings {
  theme: ThemeChoice
  lastMethod: string
  /** Active task for the next focus session; null = no task (F9). */
  activeTaskId: string | null
  /** Wake Lock: keep the screen awake while the timer runs (F14). */
  wakeLock: boolean
  /** Alarm tone when a session finishes (F13). */
  alarmSound: AlarmSound
  /** The alarm rings when a session finishes (F13). */
  alarmEnabled: boolean
  /** Browser notification when a session finishes (F5/F13). */
  notifications: boolean
  /** Ambient sound while the timer runs (F13). */
  ambient: AmbientSound
  /** Ambient volume 0–1. */
  ambientVolume: number
  /** Per-method duration overrides (F3); absent = method defaults. */
  durations: Partial<Record<EditableMethodId, DurationOverride>>
  /** Custom method configuration; null = corrupt/missing — the engine falls back to Pomodoro. */
  custom: StoredCustom | null
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  lastMethod: DEFAULT_METHOD,
  activeTaskId: null,
  wakeLock: true,
  alarmSound: 'beep',
  alarmEnabled: true,
  notifications: true,
  ambient: 'off',
  ambientVolume: DEFAULT_AMBIENT_VOLUME,
  durations: {},
  custom: { ...DEFAULT_CUSTOM, presetName: null },
}

const ALARM_SOUNDS: readonly AlarmSound[] = ['beep', 'soft', 'low']
const AMBIENT_SOUNDS: readonly AmbientSound[] = ['off', 'rain', 'fan', 'brown']

export const isAlarmSound = (value: unknown): value is AlarmSound =>
  typeof value === 'string' && (ALARM_SOUNDS as readonly string[]).includes(value)

export const isAmbientSound = (value: unknown): value is AmbientSound =>
  typeof value === 'string' && (AMBIENT_SOUNDS as readonly string[]).includes(value)

const isTheme = (value: unknown): value is ThemeChoice =>
  value === 'system' || value === 'light' || value === 'dark'

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/**
 * Parse one duration override: focus+break must be valid; longBreak/cycle
 * are optional and validated only when present. Not intact → null (defaults).
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
    // Cycle 1 = no cycle (toggle off); user input is limited to 2–8.
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
    // Field present but corrupt → null (restore falls back to Pomodoro);
    // absent = old storage → the Custom default.
    custom: 'custom' in raw ? parseCustom(raw.custom) : DEFAULT_SETTINGS.custom,
  }
}

interface SettingsState {
  settings: AppSettings
  /** false = IndexedDB cannot be relied on; session history is off, the timer keeps running. */
  databaseAvailable: boolean
  /** true = stored settings have been read; before that the boot theme must not be overridden by the 'system' default. */
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
  /** Set/clear one method's duration override (null = back to defaults). */
  setDuration: (methodId: EditableMethodId, override: DurationOverride | null) => void
  /** Replace the Custom configuration (used by the settings panel and preset apply). */
  setCustom: (custom: StoredCustom | null) => void
  /** Select the Custom method, filling in the default configuration if missing. */
  selectCustom: () => void
  /** Return all durations (overrides + Custom) to the method defaults. */
  resetDurations: () => void
  load: () => Promise<void>
}

function persistLocal(settings: AppSettings): void {
  write(SETTINGS_KEY, STORAGE_VERSION, settings)
}

/** The method registry is updated on every settings change (PRD F3). */
function applyMethods(settings: AppSettings): void {
  configureMethods({ durations: settings.durations, custom: settings.custom })
}

/** Set the method registry from local settings synchronously (boot path). */
export function configureMethodsFromLocal(): void {
  const local = read<unknown>(SETTINGS_KEY, null)
  applyMethods(parseSettings(local))
}

async function persistDb(settings: AppSettings): Promise<void> {
  try {
    await db.settings.put({ id: 'app', value: settings })
  } catch (error) {
    console.warn('Ritme: failed to save settings to IndexedDB', error)
    useSettings.setState({ databaseAvailable: false })
  }
}

export const useSettings = create<SettingsState>()((set, get) => {
  // Choices made while loading is still in progress (theme clicked before
  // IndexedDB is read) are already saved by save(); the values read below
  // were taken earlier and must not override them.
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
      // localStorage is written synchronously by save() before the IndexedDB
      // queue — the newer source, so it wins when present. IndexedDB is only a
      // backup (it covers the case where localStorage is empty/intact).
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
        console.warn('Ritme: IndexedDB unavailable', error)
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
        console.warn('Ritme: localStorage is not writable, preferences will not persist')
      }
    },
  }
})

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): 'light' | 'dark' {
  return choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice
}
