/**
 * Konfigurasi metode kerja = data. Mesin timer tidak punya percabangan per
 * metode; menambah metode cukup menambah entri di sini (PRD bagian 3).
 */

export const MINUTE = 60_000

/** Aturan istirahat proporsional Flowtime: langkah pertama yang memuat durasi fokus menang. */
export interface BreakStep {
  /** Batas atas durasi fokus. */
  maxMs: number
  /** true → batas ikut dihitung (<=); false → batas tidak dihitung (<). */
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
      /** null → tanpa istirahat panjang. */
      longBreakMs: number | null
      /** Sesi sebelum istirahat panjang; 1 → tidak pernah. */
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
    // PRD bagian 3: <25 → 5; [25,50) → 8; [50,90] → 10; >90 → 15.
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

/** Metode yang bisa dijalankan mesin: seluruh entri konfigurasi runnable. */
export type RunnableMethod = MethodConfig

/** Id metode berbasis durasi yang boleh dioverride pengguna (PRD F3). */
export type EditableMethodId = 'pomodoro' | '52-17' | 'ultradian'

export const EDITABLE_METHOD_IDS: readonly EditableMethodId[] = ['pomodoro', '52-17', 'ultradian']

/** Konfigurasi Custom (PRD bagian 3): bebas, longBreak/cycle opsional. */
export interface CustomConfig {
  focusMs: number
  breakMs: number
  /** null → tanpa istirahat panjang. */
  longBreakMs: number | null
  /** 1 → tanpa hitungan siklus. */
  cycle: number
}

/** Override durasi per metode; hanya field yang diedit yang disimpan. */
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
 * Batas validasi (menit) — PRD F3: tolak di luar rentang, jangan diam-diam
 * dibulatkan. Satu sumber kebenaran untuk parse pengaturan dan input UI.
 */
export const DURATION_LIMITS = {
  focus: { min: 1, max: 180 },
  break: { min: 1, max: 60 },
  longBreak: { min: 1, max: 120 },
  cycle: { min: 2, max: 8 },
} as const

export type DurationField = keyof typeof DURATION_LIMITS

/** true bila `ms` (kelipatan menit utuh) atau siklus berada di rentang `field`. */
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

// Registry runtime: pengaturan + preset mengubah resolusi metode tanpa
// menyentuh mesin — engine tetap murni per data (PRD bagian 3).
let runtime: MethodRuntime = { durations: {}, custom: null }

/** Terapkan pengaturan terbaru ke registry metode. Dipanggil dari settings. */
export function configureMethods(next: MethodRuntime): void {
  runtime = { durations: next.durations, custom: next.custom }
}

function resolveCountdown(base: (typeof METHOD_CONFIGS)[number]): RunnableMethod {
  if (base.mode !== 'countdown') return base
  const override = runtime.durations[base.id]
  return override ? { ...base, ...override } : base
}

/**
 * Ambil konfigurasi metode. Id tak dikenal atau metode yang belum tersedia
 * (mis. Custom tanpa konfigurasi karena data rusak) jatuh ke Pomodoro
 * supaya mesin tidak pernah menerima konfigurasi kosong.
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
 * Entri pemilih metode untuk Custom — selalu tampil walau konfigurasi
 * belum ada (nilai default untuk baris detail). Mesin memakai `methodById`.
 */
export function customMethod(): RunnableMethod {
  return { id: 'custom', name: 'Custom', mode: 'countdown', ...(runtime.custom ?? DEFAULT_CUSTOM) }
}

/** Nama metode untuk label statistik — tetap "Custom" walau konfigurasi hilang. */
export function methodName(id: string): string {
  if (id === 'custom') return 'Custom'
  return METHOD_CONFIGS.find((method) => method.id === id)?.name ?? METHOD_CONFIGS[0].name
}

/** Baris pendek di pemilih metode, dihitung dari konfigurasi supaya tidak melenceng. */
export function methodDetail(config: MethodConfig): string {
  if (config.mode === 'boxing') return 'Sesuai blok'
  if (config.mode === 'countup') return 'Hitung maju'
  return `${config.focusMs / MINUTE} menit`
}

/** Istirahat Flowtime dari durasi fokus yang baru saja selesai. */
export function breakForFocus(config: MethodConfig, focusMs: number): number | null {
  if (config.mode !== 'countup') return null
  const step = config.focusBreak.find((item) =>
    item.inclusive ? focusMs <= item.maxMs : focusMs < item.maxMs,
  )
  return step?.breakMs ?? config.focusBreak[config.focusBreak.length - 1]!.breakMs
}
