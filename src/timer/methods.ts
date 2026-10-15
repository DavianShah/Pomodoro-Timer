/**
 * Work-method configuration = data. The timer engine has no per-method
 * branching; adding a method means adding an entry here (PRD section 3).
 */

export const MINUTE = 60_000

/** Flowtime proportional-break rule: the first step containing the focus duration wins. */
export interface BreakStep {
  /** Upper bound of the focus duration. */
  maxMs: number
  /** true → the bound is included (<=); false → excluded (<). */
  inclusive: boolean
  breakMs: number
}

export type MethodConfig =
  | {
      id: string
      name: string
      mode: 'countdown'
      focusMs: number
      breakMs: number
      /** null → no long break. */
      longBreakMs: number | null
      /** Sessions before a long break; 1 → never. */
      cycle: number
    }
  | {
      id: string
      name: string
      mode: 'countup'
      focusBreak: readonly BreakStep[]
      cycle: number
    }
  | { id: string; name: string; mode: 'boxing'; cycle: number }

export const METHOD_CONFIGS = [
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    mode: 'countdown',
    focusMs: 25 * MINUTE,
    breakMs: 5 * MINUTE,
    longBreakMs: 15 * MINUTE,
    cycle: 4,
  },
  {
    id: '52-17',
    name: '52/17',
    mode: 'countdown',
    focusMs: 52 * MINUTE,
    breakMs: 17 * MINUTE,
    longBreakMs: null,
    cycle: 1,
  },
  {
    id: 'ultradian',
    name: 'Ultradian',
    mode: 'countdown',
    focusMs: 90 * MINUTE,
    breakMs: 20 * MINUTE,
    longBreakMs: null,
    cycle: 1,
  },
  {
    id: 'flowtime',
    name: 'Flowtime',
    mode: 'countup',
    // PRD section 3: <25 → 5; [25,50) → 8; [50,90] → 10; >90 → 15.
    focusBreak: [
      { maxMs: 25 * MINUTE, inclusive: false, breakMs: 5 * MINUTE },
      { maxMs: 50 * MINUTE, inclusive: false, breakMs: 8 * MINUTE },
      { maxMs: 90 * MINUTE, inclusive: true, breakMs: 10 * MINUTE },
      { maxMs: Infinity, inclusive: true, breakMs: 15 * MINUTE },
    ],
    cycle: 1,
  },
  { id: 'timeboxing', name: 'Time boxing', mode: 'boxing', cycle: 1 },
] as const satisfies readonly MethodConfig[]

/** Methods the engine can run: every runnable configuration entry. */
export type RunnableMethod = MethodConfig

/** Duration-based method ids the user may override (PRD F3). */
export type EditableMethodId = 'pomodoro' | '52-17' | 'ultradian'

export const EDITABLE_METHOD_IDS: readonly EditableMethodId[] = ['pomodoro', '52-17', 'ultradian']

/** Custom configuration (PRD section 3): free-form, longBreak/cycle optional. */
export interface CustomConfig {
  focusMs: number
  breakMs: number
  /** null → no long break. */
  longBreakMs: number | null
  /** 1 → no cycle counting. */
  cycle: number
}

/** Per-method duration override; only edited fields are stored. */
export interface DurationOverride {
  focusMs: number
  breakMs: number
  longBreakMs?: number
  cycle?: number
}

export interface MethodRuntime {
  durations: Partial<Record<EditableMethodId, DurationOverride>>
  custom: CustomConfig | null
}

export const DEFAULT_CUSTOM: CustomConfig = {
  focusMs: 25 * MINUTE,
  breakMs: 5 * MINUTE,
  longBreakMs: null,
  cycle: 1,
}

/**
 * Validation limits (minutes) — PRD F3: reject out-of-range values, never
 * silently round. Single source of truth for settings parsing and UI inputs.
 */
export const DURATION_LIMITS = {
  focus: { min: 1, max: 180 },
  break: { min: 1, max: 60 },
  longBreak: { min: 1, max: 120 },
  cycle: { min: 2, max: 8 },
} as const

export type DurationField = keyof typeof DURATION_LIMITS

/** true when `ms` (whole-minute multiple) or the cycle lies within `field`'s range. */
export function inDurationRange(field: DurationField, value: number): boolean {
  const { min, max } = DURATION_LIMITS[field]
  const scale = field === 'cycle' ? 1 : MINUTE
  return (
    Number.isInteger(value) &&
    (field === 'cycle' || value % MINUTE === 0) &&
    value >= min * scale &&
    value <= max * scale
  )
}

// Runtime registry: settings + presets change method resolution without
// touching the engine — the engine stays pure per data (PRD section 3).
let runtime: MethodRuntime = { durations: {}, custom: null }

/** Apply the latest settings to the method registry. Called from settings. */
export function configureMethods(next: MethodRuntime): void {
  runtime = { durations: next.durations, custom: next.custom }
}

function resolveCountdown(base: (typeof METHOD_CONFIGS)[number]): RunnableMethod {
  if (base.mode !== 'countdown') return base
  const override = runtime.durations[base.id]
  return override ? { ...base, ...override } : base
}

/**
 * Get a method configuration. An unknown id, or a method not yet available
 * (e.g. Custom without configuration due to corrupt data), falls back to
 * Pomodoro so the engine never receives an empty configuration.
 */
export function methodById(id: EditableMethodId): Extract<RunnableMethod, { mode: 'countdown' }>
export function methodById(id: string): RunnableMethod
export function methodById(id: string): RunnableMethod {
  if (id === 'custom') {
    const custom = runtime.custom
    return custom
      ? { id: 'custom', name: 'Custom', mode: 'countdown', ...custom }
      : resolveCountdown(METHOD_CONFIGS[0])
  }
  const found = METHOD_CONFIGS.find((method) => method.id === id)
  if (!found) return resolveCountdown(METHOD_CONFIGS[0])
  return resolveCountdown(found)
}

/**
 * Method-picker entry for Custom — always shown even without configuration
 * (default values for the detail line). The engine uses `methodById`.
 */
export function customMethod(): RunnableMethod {
  return { id: 'custom', name: 'Custom', mode: 'countdown', ...(runtime.custom ?? DEFAULT_CUSTOM) }
}

/** Method name for stats labels — stays "Custom" even if the configuration is gone. */
export function methodName(id: string): string {
  if (id === 'custom') return 'Custom'
  return METHOD_CONFIGS.find((method) => method.id === id)?.name ?? METHOD_CONFIGS[0].name
}

/** Short line in the method picker, computed from config so it can't drift. */
export function methodDetail(config: MethodConfig): string {
  if (config.mode === 'boxing') return 'Follows blocks'
  if (config.mode === 'countup') return 'Counts up'
  return `${config.focusMs / MINUTE} min`
}

/** Flowtime break for the focus duration that just finished. */
export function breakForFocus(config: MethodConfig, focusMs: number): number | null {
  if (config.mode !== 'countup') return null
  const step = config.focusBreak.find((item) =>
    item.inclusive ? focusMs <= item.maxMs : focusMs < item.maxMs,
  )
  return step?.breakMs ?? config.focusBreak[config.focusBreak.length - 1]!.breakMs
}
