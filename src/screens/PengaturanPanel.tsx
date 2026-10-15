import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  DURATION_LIMITS,
  DEFAULT_CUSTOM,
  EDITABLE_METHOD_IDS,
  MINUTE,
  inDurationRange,
  methodById,
  type DurationField,
  type EditableMethodId,
} from '@/timer/methods'
import {
  isAlarmSound,
  isAmbientSound,
  useSettings,
  type AppSettings,
  type StoredCustom,
} from '@/state/settings'
import { playAlarm, unlockAlarm } from '@/timer/alarm'
import {
  listPresets,
  MAX_PRESETS,
  removePreset,
  savePreset,
  type PresetInput,
} from '@/data/presets'
import {
  buildBackup,
  buildSessionsCsv,
  downloadFile,
  exportFileName,
  restoreBackup,
} from '@/data/backup'
import { useTasks } from '@/state/tasks'
import { useBlocks } from '@/state/blocks'
import type { PresetRow } from '@/db/db'

interface PengaturanPanelProps {
  /** Durations may only change while the timer is not running (PRD F3). */
  running: boolean
  onClose: () => void
}

const FIELD_LABEL: Record<DurationField, string> = {
  focus: 'Focus',
  break: 'Break',
  longBreak: 'Long break',
  cycle: 'Cycle',
}

const FIELD_UNIT: Record<DurationField, string> = {
  focus: 'min',
  break: 'min',
  longBreak: 'min',
  cycle: 'sessions',
}

const inputId = (scope: string, field: DurationField): string => `durasi-${scope}-${field}`

function minutes(value: number): string {
  return String(value / MINUTE)
}

/** Effective Custom values (stored or default) for the inputs. */
function customOf(settings: AppSettings): StoredCustom {
  return settings.custom ?? { ...DEFAULT_CUSTOM, presetName: null }
}

/** Draft copies (minutes, as strings) from each field's effective value. */
function makeDrafts(settings: AppSettings): Record<string, string> {
  const drafts: Record<string, string> = {}
  for (const id of EDITABLE_METHOD_IDS) {
    const config = methodById(id)
    drafts[inputId(id, 'focus')] = minutes(config.focusMs)
    drafts[inputId(id, 'break')] = minutes(config.breakMs)
    if (id === 'pomodoro') {
      drafts[inputId(id, 'longBreak')] =
        config.longBreakMs !== null ? minutes(config.longBreakMs) : '15'
    }
  }
  const custom = customOf(settings)
  drafts[inputId('custom', 'focus')] = minutes(custom.focusMs)
  drafts[inputId('custom', 'break')] = minutes(custom.breakMs)
  drafts[inputId('custom', 'longBreak')] =
    custom.longBreakMs !== null ? minutes(custom.longBreakMs) : '15'
  drafts[inputId('custom', 'cycle')] = custom.cycle > 1 ? String(custom.cycle) : '4'
  return drafts
}

interface DurationRowProps {
  scope: string
  field: DurationField
  value: string
  disabled?: boolean
  onChange: (raw: string) => void
}

function DurationRow({ scope, field, value, disabled = false, onChange }: DurationRowProps) {
  const id = inputId(scope, field)
  const { min, max } = DURATION_LIMITS[field]
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <label htmlFor={id} className="text-sm text-ink-muted">
        {FIELD_LABEL[field]}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="angka w-20 rounded-md border border-line-strong bg-paper px-2 py-1.5 text-right text-sm text-ink disabled:cursor-not-allowed disabled:opacity-60"
        />
        <span className="w-10 text-xs text-ink-muted">{FIELD_UNIT[field]}</span>
      </div>
    </div>
  )
}

/**
 * Duration settings panel (PRD F3): per-method overrides, the Custom method
 * with named presets. Labeled number inputs — not sliders; out-of-range
 * values are rejected with a `role="status"` message, never silently rounded.
 */
export default function PengaturanPanel({ running, onClose }: PengaturanPanelProps) {
  const settings = useSettings((state) => state.settings)
  const settingsLoaded = useSettings((state) => state.settingsLoaded)
  const databaseAvailable = useSettings((state) => state.databaseAvailable)
  const setDuration = useSettings((state) => state.setDuration)
  const setCustom = useSettings((state) => state.setCustom)
  const setLastMethod = useSettings((state) => state.setLastMethod)
  const resetDurations = useSettings((state) => state.resetDurations)
  const setAlarmSound = useSettings((state) => state.setAlarmSound)
  const setAlarmEnabled = useSettings((state) => state.setAlarmEnabled)
  const setNotifications = useSettings((state) => state.setNotifications)
  const setAmbient = useSettings((state) => state.setAmbient)
  const setAmbientVolume = useSettings((state) => state.setAmbientVolume)

  const [drafts, setDrafts] = useState<Record<string, string>>(() => makeDrafts(settings))
  const [status, setStatus] = useState('')
  const [presetName, setPresetName] = useState('')
  const [presets, setPresets] = useState<PresetRow[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.focus()
  }, [])

  // Settings finish loading after the panel opens → sync the drafts.
  // "Adjust state during render" pattern (not an effect), same as useTimer.
  const [prevLoaded, setPrevLoaded] = useState(settingsLoaded)
  if (settingsLoaded !== prevLoaded) {
    setPrevLoaded(settingsLoaded)
    if (settingsLoaded) setDrafts(makeDrafts(settings))
  }

  useEffect(() => {
    if (!databaseAvailable) return
    void listPresets()
      .then(setPresets)
      .catch(() => setPresets([]))
  }, [databaseAvailable])

  const refreshPresets = (): void => {
    void listPresets()
      .then(setPresets)
      .catch(() => setPresets([]))
  }

  // Export/import data (F19). Import merges per id; settings are not included.
  const [dataBusy, setDataBusy] = useState(false)

  const exportSessions = (): void => {
    setDataBusy(true)
    void buildSessionsCsv()
      .then((csv) => {
        downloadFile(exportFileName('sessions', 'csv'), csv, 'text/csv;charset=utf-8')
        setStatus('Session CSV downloaded')
      })
      .catch(() => setStatus('Export failed'))
      .finally(() => setDataBusy(false))
  }

  const exportBackupFile = (): void => {
    setDataBusy(true)
    void buildBackup()
      .then((data) => {
        downloadFile(
          exportFileName('backup', 'json'),
          JSON.stringify(data, null, 2),
          'application/json',
        )
        setStatus('Backup downloaded')
      })
      .catch(() => setStatus('Export failed'))
      .finally(() => setDataBusy(false))
  }

  const importBackupFile = (file: File | undefined): void => {
    if (file === undefined || dataBusy) return
    setDataBusy(true)
    void file
      .text()
      .then((text) => restoreBackup(text))
      .then((result) => {
        if (!result.ok) {
          setStatus(result.error)
          return
        }
        const { counts } = result
        setStatus(
          `Restored: ${counts.sessions} sessions, ${counts.tasks} tasks` +
            (counts.skipped > 0 ? ` · skipped ${counts.skipped}` : ''),
        )
        // Stores showing data refresh too; stats read when opened.
        void useTasks.getState().refresh()
        void useBlocks.getState().refresh()
        refreshPresets()
      })
      .catch(() => setStatus('File could not be read'))
      .finally(() => setDataBusy(false))
  }

  const applyCustom = (patch: Partial<StoredCustom>): void => {
    setCustom({ ...customOf(useSettings.getState().settings), ...patch, presetName: null })
  }

  /** Apply a valid value to settings; out of range → reject + message. */
  const updateField = (scope: string, field: DurationField, raw: string): void => {
    const id = inputId(scope, field)
    setDrafts((prev) => ({ ...prev, [id]: raw }))
    const trimmed = raw.trim()
    if (trimmed === '') {
      setStatus('')
      return
    }
    const value = Number(trimmed)
    if (!Number.isInteger(value)) {
      setStatus('Must be a whole number')
      return
    }
    // Input is in minutes; inDurationRange works in ms (cycle stays in sessions).
    const amount = field === 'cycle' ? value : value * MINUTE
    if (!inDurationRange(field, amount)) {
      const { min, max } = DURATION_LIMITS[field]
      setStatus(`${FIELD_LABEL[field]} must be ${min}–${max} ${FIELD_UNIT[field]}`)
      return
    }
    setStatus('')
    if (scope === 'custom') {
      if (field === 'focus') applyCustom({ focusMs: amount })
      else if (field === 'break') applyCustom({ breakMs: amount })
      else if (field === 'longBreak') applyCustom({ longBreakMs: amount })
      else applyCustom({ cycle: amount })
      return
    }
    const methodId = scope as EditableMethodId
    const config = methodById(methodId)
    const override =
      methodId === 'pomodoro'
        ? {
            focusMs: config.focusMs,
            breakMs: config.breakMs,
            longBreakMs: config.longBreakMs ?? 15 * MINUTE,
          }
        : { focusMs: config.focusMs, breakMs: config.breakMs }
    if (field === 'focus') override.focusMs = amount
    else if (field === 'break') override.breakMs = amount
    else if (field === 'longBreak' && 'longBreakMs' in override) override.longBreakMs = amount
    setDuration(methodId, override)
  }

  const submitPreset = (event: FormEvent): void => {
    event.preventDefault()
    const name = presetName.trim()
    if (name === '') {
      setStatus('Preset name is required')
      return
    }
    const custom = customOf(useSettings.getState().settings)
    const input: PresetInput = {
      name,
      focusMs: custom.focusMs,
      breakMs: custom.breakMs,
      longBreakMs: custom.longBreakMs,
      cycle: custom.cycle,
    }
    void savePreset(input).then((result) => {
      if (!result.ok) {
        setStatus(`Maximum ${MAX_PRESETS} presets`)
        return
      }
      setStatus(`Preset "${name}" saved`)
      setPresetName('')
      setCustom({ ...custom, presetName: name })
      refreshPresets()
    })
  }

  const choosePreset = (preset: PresetRow): void => {
    if (running) return
    setCustom({
      focusMs: preset.focusMs,
      breakMs: preset.breakMs,
      longBreakMs: preset.longBreakMs ?? null,
      cycle: preset.cycle ?? 1,
      presetName: preset.name,
    })
    setLastMethod('custom')
    setDrafts(makeDrafts(useSettings.getState().settings))
    setStatus(`Preset "${preset.name}" applied`)
  }

  const deletePreset = (preset: PresetRow): void => {
    void removePreset(preset.id).then(() => {
      const custom = useSettings.getState().settings.custom
      if (custom !== null && custom.presetName === preset.name) {
        setCustom({ ...custom, presetName: null })
      }
      setStatus(`Preset "${preset.name}" deleted`)
      refreshPresets()
    })
  }

  const resetAll = (): void => {
    resetDurations()
    setDrafts(makeDrafts(useSettings.getState().settings))
    setStatus('Durations reset to defaults')
  }

  const pomodoro = methodById('pomodoro')
  const custom = customOf(settings)

  return (
    <aside
      id="panel-pengaturan"
      aria-label="Settings"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
      className="fixed inset-y-0 right-0 z-40 flex w-80 max-w-full flex-col border-l border-line bg-paper-raised"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="label">Settings</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-line-strong px-3 py-1 text-xs text-ink-muted transition-colors hover:border-ink-muted"
        >
          Close
        </button>
      </div>

      <p role="status" className="min-h-6 px-4 pt-2 text-xs text-ink-muted">
        {status}
      </p>

      {/* Keyboard scrolling: an overflow region must be focusable without a mouse. */}
      <div ref={scrollRef} tabIndex={0} className="flex-1 overflow-y-auto px-4 pb-4">
        {running && (
          <p className="mb-2 text-xs text-ink-muted">Durations can be changed while the timer is stopped.</p>
        )}

        <section className="border-b border-line py-3">
          <h3 className="label">Pomodoro</h3>
          <DurationRow
            scope="pomodoro"
            field="focus"
            value={drafts[inputId('pomodoro', 'focus')] ?? ''}
            disabled={running}
            onChange={(raw) => updateField('pomodoro', 'focus', raw)}
          />
          <DurationRow
            scope="pomodoro"
            field="break"
            value={drafts[inputId('pomodoro', 'break')] ?? ''}
            disabled={running}
            onChange={(raw) => updateField('pomodoro', 'break', raw)}
          />
          <DurationRow
            scope="pomodoro"
            field="longBreak"
            value={drafts[inputId('pomodoro', 'longBreak')] ?? ''}
            disabled={running}
            onChange={(raw) => updateField('pomodoro', 'longBreak', raw)}
          />
          <p className="pt-1 text-xs text-ink-muted">Cycle of {pomodoro.cycle} sessions.</p>
        </section>

        <section className="border-b border-line py-3">
          <h3 className="label">52/17</h3>
          <DurationRow
            scope="52-17"
            field="focus"
            value={drafts[inputId('52-17', 'focus')] ?? ''}
            disabled={running}
            onChange={(raw) => updateField('52-17', 'focus', raw)}
          />
          <DurationRow
            scope="52-17"
            field="break"
            value={drafts[inputId('52-17', 'break')] ?? ''}
            disabled={running}
            onChange={(raw) => updateField('52-17', 'break', raw)}
          />
        </section>

        <section className="border-b border-line py-3">
          <h3 className="label">Ultradian</h3>
          <DurationRow
            scope="ultradian"
            field="focus"
            value={drafts[inputId('ultradian', 'focus')] ?? ''}
            disabled={running}
            onChange={(raw) => updateField('ultradian', 'focus', raw)}
          />
          <DurationRow
            scope="ultradian"
            field="break"
            value={drafts[inputId('ultradian', 'break')] ?? ''}
            disabled={running}
            onChange={(raw) => updateField('ultradian', 'break', raw)}
          />
        </section>

        <section className="border-b border-line py-3">
          <h3 className="label">Custom</h3>
          <DurationRow
            scope="custom"
            field="focus"
            value={drafts[inputId('custom', 'focus')] ?? ''}
            disabled={running}
            onChange={(raw) => updateField('custom', 'focus', raw)}
          />
          <DurationRow
            scope="custom"
            field="break"
            value={drafts[inputId('custom', 'break')] ?? ''}
            disabled={running}
            onChange={(raw) => updateField('custom', 'break', raw)}
          />
          <label className="flex items-center justify-between gap-3 py-1.5 text-sm text-ink-muted">
            <span>Long break</span>
            <input
              id="custom-long-toggle"
              type="checkbox"
              checked={custom.longBreakMs !== null}
              disabled={running}
              onChange={(event) =>
                applyCustom({ longBreakMs: event.target.checked ? 15 * MINUTE : null })
              }
              className="h-4 w-4 accent-accent"
            />
          </label>
          <DurationRow
            scope="custom"
            field="longBreak"
            value={drafts[inputId('custom', 'longBreak')] ?? ''}
            disabled={running || custom.longBreakMs === null}
            onChange={(raw) => updateField('custom', 'longBreak', raw)}
          />
          <label className="flex items-center justify-between gap-3 py-1.5 text-sm text-ink-muted">
            <span>Cycle</span>
            <input
              id="custom-cycle-toggle"
              type="checkbox"
              checked={custom.cycle > 1}
              disabled={running}
              onChange={(event) => applyCustom({ cycle: event.target.checked ? 4 : 1 })}
              className="h-4 w-4 accent-accent"
            />
          </label>
          <DurationRow
            scope="custom"
            field="cycle"
            value={drafts[inputId('custom', 'cycle')] ?? ''}
            disabled={running || custom.cycle <= 1}
            onChange={(raw) => updateField('custom', 'cycle', raw)}
          />
        </section>

        <section className="py-3">
          <h3 className="label">Preset</h3>
          {!databaseAvailable ? (
            <p className="py-2 text-sm text-ink-muted">
              Presets disabled — browser storage is unavailable.
            </p>
          ) : (
            <>
              <form onSubmit={submitPreset} className="flex items-end gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor="preset-nama" className="block text-sm text-ink-muted">
                    Preset name
                  </label>
                  <input
                    id="preset-nama"
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                    placeholder="e.g. Morning"
                    autoComplete="off"
                    className="mt-1 w-full rounded-md border border-line-strong bg-paper px-2 py-1.5 text-sm text-ink placeholder:text-ink-muted"
                  />
                </div>
                <button
                  type="submit"
                  disabled={running}
                  className="rounded-md border border-line-strong px-3 py-2 text-xs text-ink transition-colors hover:border-ink-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Save preset
                </button>
              </form>
              <ul className="divide-y divide-line">
                {presets.length === 0 && (
                  <li className="py-2 text-sm text-ink-muted">No presets yet.</li>
                )}
                {presets.map((preset) => (
                  <li key={preset.id} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{preset.name}</span>
                      <span className="angka block text-xs text-ink-muted">
                        {minutes(preset.focusMs)}/{minutes(preset.breakMs)} min
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => choosePreset(preset)}
                      className="rounded-md border border-line-strong px-2 py-1 text-xs text-ink-muted transition-colors hover:border-ink-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Use
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePreset(preset)}
                      className="rounded-md border border-line-strong px-2 py-1 text-xs text-ink-muted transition-colors hover:border-ink-muted"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="border-b border-line py-3">
          <h3 className="label">Sound</h3>
          <label className="flex items-center justify-between gap-3 py-1.5 text-sm text-ink-muted">
            <span>Alarm when a session finishes</span>
            <input
              type="checkbox"
              checked={settings.alarmEnabled}
              onChange={(event) => setAlarmEnabled(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
          </label>
          <div className="flex items-center justify-between gap-3 py-1.5">
            <label htmlFor="suara-alarm" className="text-sm text-ink-muted">
              Alarm tone
            </label>
            <div className="flex items-center gap-2">
              <select
                id="suara-alarm"
                value={settings.alarmSound}
                disabled={!settings.alarmEnabled}
                onChange={(event) => {
                  if (isAlarmSound(event.target.value)) setAlarmSound(event.target.value)
                }}
                className="rounded-md border border-line-strong bg-paper px-2 py-1.5 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="beep">Beep</option>
                <option value="soft">Soft</option>
                <option value="low">Low</option>
              </select>
              <button
                type="button"
                disabled={!settings.alarmEnabled}
                onClick={() => {
                  unlockAlarm()
                  playAlarm(settings.alarmSound)
                }}
                className="rounded-md border border-line-strong px-2 py-1.5 text-xs text-ink-muted transition-colors hover:border-ink-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                Preview
              </button>
            </div>
          </div>
          <label className="flex items-center justify-between gap-3 py-1.5 text-sm text-ink-muted">
            <span>Browser notifications</span>
            <input
              type="checkbox"
              checked={settings.notifications}
              onChange={(event) => setNotifications(event.target.checked)}
              className="h-4 w-4 accent-accent"
            />
          </label>
          <div className="flex items-center justify-between gap-3 py-1.5">
            <label htmlFor="suara-ambient" className="text-sm text-ink-muted">
              Ambient
            </label>
            <select
              id="suara-ambient"
              value={settings.ambient}
              onChange={(event) => {
                if (isAmbientSound(event.target.value)) setAmbient(event.target.value)
              }}
              className="rounded-md border border-line-strong bg-paper px-2 py-1.5 text-sm text-ink"
            >
              <option value="off">Off</option>
              <option value="rain">Rain</option>
              <option value="fan">Fan</option>
              <option value="brown">Brown noise</option>
            </select>
          </div>
          <div className="flex items-center justify-between gap-3 py-1.5">
            <label htmlFor="suara-volume" className="text-sm text-ink-muted">
              Ambient volume
            </label>
            <input
              id="suara-volume"
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(settings.ambientVolume * 100)}
              disabled={settings.ambient === 'off'}
              onChange={(event) => setAmbientVolume(Number(event.target.value) / 100)}
              className="w-32 accent-accent disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
          <p className="pt-1 text-xs text-ink-muted">
            Ambient plays while the timer runs. All sounds are synthesized on-device.
          </p>
        </section>

        <section className="border-b border-line py-3">
          <h3 className="label">Data</h3>
          {!databaseAvailable ? (
            <p className="py-2 text-sm text-ink-muted">
              Data disabled — browser storage is unavailable.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2 py-2">
              <button
                type="button"
                disabled={dataBusy}
                onClick={exportSessions}
                className="rounded-md border border-line-strong px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-ink-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                Export sessions (CSV)
              </button>
              <button
                type="button"
                disabled={dataBusy}
                onClick={exportBackupFile}
                className="rounded-md border border-line-strong px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-ink-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                Export backup
              </button>
              <label className="cursor-pointer rounded-md border border-line-strong px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-ink-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
                Restore backup
                <input
                  type="file"
                  accept="application/json,.json"
                  disabled={dataBusy}
                  onChange={(event) => {
                    importBackupFile(event.target.files?.[0])
                    event.target.value = ''
                  }}
                  className="sr-only"
                />
              </label>
            </div>
          )}
          <p className="pt-1 text-xs text-ink-muted">
            Backup includes tasks, sessions, blocks, and presets. Import merges, never deletes.
          </p>
        </section>

        <div className="border-t border-line pt-3">
          <button
            type="button"
            onClick={resetAll}
            className="rounded-md border border-line-strong px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-ink-muted"
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </aside>
  )
}
