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
  | { id: string; name: string; mode: 'disabled' }

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
  { id: 'timeboxing', name: 'Time boxing', mode: 'disabled' },
] as const satisfies readonly MethodConfig[]

const FALLBACK: RunnableMethod = METHOD_CONFIGS[0]

/** Metode yang bisa dijalankan mesin: tanpa varian disabled. */
export type RunnableMethod = Exclude<MethodConfig, { mode: 'disabled' }>

/**
 * Ambil konfigurasi metode. Id tak dikenal atau metode yang belum tersedia
 * jatuh ke Pomodoro supaya mesin tidak pernah menerima konfigurasi kosong.
 */
export function methodById(id: string): RunnableMethod {
  const found = METHOD_CONFIGS.find((method) => method.id === id)
  if (!found || found.mode === 'disabled') return FALLBACK
  return found
}

/** Baris pendek di pemilih metode, dihitung dari konfigurasi supaya tidak melenceng. */
export function methodDetail(config: MethodConfig): string {
  if (config.mode === 'disabled') return 'Belum bisa'
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
