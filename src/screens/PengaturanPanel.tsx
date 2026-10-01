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
import { useSettings, type AppSettings, type StoredCustom } from '@/state/settings'
import {
  listPresets,
  MAX_PRESETS,
  removePreset,
  savePreset,
  type PresetInput,
} from '@/data/presets'
import type { PresetRow } from '@/db/db'

interface PengaturanPanelProps {
  /** Durasi hanya boleh diubah saat timer tidak berjalan (PRD F3). */
  running: boolean
  onClose: () => void
}

const FIELD_LABEL: Record<DurationField, string> = {
  focus: 'Fokus',
  break: 'Istirahat',
  longBreak: 'Istirahat panjang',
  cycle: 'Siklus',
}

const FIELD_UNIT: Record<DurationField, string> = {
  focus: 'menit',
  break: 'menit',
  longBreak: 'menit',
  cycle: 'sesi',
}

const inputId = (scope: string, field: DurationField): string => `durasi-${scope}-${field}`

function minutes(value: number): string {
  return String(value / MINUTE)
}

/** Nilai efektif Custom (penyimpanan atau default) untuk input. */
function customOf(settings: AppSettings): StoredCustom {
  return settings.custom ?? { ...DEFAULT_CUSTOM, presetName: null }
}

/** Salinan draft (menit, string) dari nilai efektif tiap field. */
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
 * Panel pengaturan durasi (PRD F3): override per metode, metode Custom
 * dengan preset bernama. Input angka berlabel — bukan slider; nilai di luar
 * rentang ditolak dengan pesan `role="status"`, tidak dibulatkan diam-diam.
 */
export default function PengaturanPanel({ running, onClose }: PengaturanPanelProps) {
  const settings = useSettings((state) => state.settings)
  const settingsLoaded = useSettings((state) => state.settingsLoaded)
  const databaseAvailable = useSettings((state) => state.databaseAvailable)
  const setDuration = useSettings((state) => state.setDuration)
  const setCustom = useSettings((state) => state.setCustom)
  const setLastMethod = useSettings((state) => state.setLastMethod)
  const resetDurations = useSettings((state) => state.resetDurations)

  const [drafts, setDrafts] = useState<Record<string, string>>(() => makeDrafts(settings))
  const [status, setStatus] = useState('')
  const [presetName, setPresetName] = useState('')
  const [presets, setPresets] = useState<PresetRow[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.focus()
  }, [])

  // Pengaturan selesai dimuat setelah panel terbuka → samakan draft.
  // Pola "adjust state during render" (bukan efek), sama seperti useTimer.
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

  const applyCustom = (patch: Partial<StoredCustom>): void => {
    setCustom({ ...customOf(useSettings.getState().settings), ...patch, presetName: null })
  }

  /** Terapkan nilai valid ke pengaturan; di luar rentang → tolak + pesan. */
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
      setStatus('Harus bilangan bulat')
      return
    }
    // Input menit; inDurationRange bekerja dalam ms (siklus tetap satuan sesi).
    const amount = field === 'cycle' ? value : value * MINUTE
    if (!inDurationRange(field, amount)) {
      const { min, max } = DURATION_LIMITS[field]
      setStatus(`${FIELD_LABEL[field]} harus ${min}–${max} ${FIELD_UNIT[field]}`)
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
      setStatus('Nama preset diisi')
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
        setStatus(`Maksimal ${MAX_PRESETS} preset`)
        return
      }
      setStatus(`Preset "${name}" tersimpan`)
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
    setStatus(`Preset "${preset.name}" dipakai`)
  }

  const deletePreset = (preset: PresetRow): void => {
    void removePreset(preset.id).then(() => {
      const custom = useSettings.getState().settings.custom
      if (custom !== null && custom.presetName === preset.name) {
        setCustom({ ...custom, presetName: null })
      }
      setStatus(`Preset "${preset.name}" dihapus`)
      refreshPresets()
    })
  }

  const resetAll = (): void => {
    resetDurations()
    setDrafts(makeDrafts(useSettings.getState().settings))
    setStatus('Durasi kembali ke bawaan')
  }

  const pomodoro = methodById('pomodoro')
  const custom = customOf(settings)

  return (
    <aside
      id="panel-pengaturan"
      aria-label="Pengaturan"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
      }}
      className="fixed inset-y-0 right-0 z-40 flex w-80 max-w-full flex-col border-l border-line bg-paper-raised"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="label">Pengaturan</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-line-strong px-3 py-1 text-xs text-ink-muted transition-colors hover:border-ink-muted"
        >
          Tutup
        </button>
      </div>

      <p role="status" className="min-h-6 px-4 pt-2 text-xs text-ink-muted">
        {status}
      </p>

      {/* Gulir keyboard: wilayah overflow harus bisa difokus tanpa mouse. */}
      <div ref={scrollRef} tabIndex={0} className="flex-1 overflow-y-auto px-4 pb-4">
        {running && (
          <p className="mb-2 text-xs text-ink-muted">Durasi bisa diubah saat timer berhenti.</p>
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
          <p className="pt-1 text-xs text-ink-muted">Siklus {pomodoro.cycle} sesi.</p>
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
            <span>Istirahat panjang</span>
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
            <span>Siklus</span>
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
              Preset nonaktif — penyimpanan browser tidak tersedia.
            </p>
          ) : (
            <>
              <form onSubmit={submitPreset} className="flex items-end gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor="preset-nama" className="block text-sm text-ink-muted">
                    Nama preset
                  </label>
                  <input
                    id="preset-nama"
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                    placeholder="mis. Pagi"
                    autoComplete="off"
                    className="mt-1 w-full rounded-md border border-line-strong bg-paper px-2 py-1.5 text-sm text-ink placeholder:text-ink-muted"
                  />
                </div>
                <button
                  type="submit"
                  disabled={running}
                  className="rounded-md border border-line-strong px-3 py-2 text-xs text-ink transition-colors hover:border-ink-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Simpan preset
                </button>
              </form>
              <ul className="divide-y divide-line">
                {presets.length === 0 && (
                  <li className="py-2 text-sm text-ink-muted">Belum ada preset.</li>
                )}
                {presets.map((preset) => (
                  <li key={preset.id} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{preset.name}</span>
                      <span className="angka block text-xs text-ink-muted">
                        {minutes(preset.focusMs)}/{minutes(preset.breakMs)} menit
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => choosePreset(preset)}
                      className="rounded-md border border-line-strong px-2 py-1 text-xs text-ink-muted transition-colors hover:border-ink-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Pakai
                    </button>
                    <button
                      type="button"
                      onClick={() => deletePreset(preset)}
                      className="rounded-md border border-line-strong px-2 py-1 text-xs text-ink-muted transition-colors hover:border-ink-muted"
                    >
                      Hapus
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <div className="border-t border-line pt-3">
          <button
            type="button"
            onClick={resetAll}
            className="rounded-md border border-line-strong px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-ink-muted"
          >
            Kembalikan bawaan
          </button>
        </div>
      </div>
    </aside>
  )
}
