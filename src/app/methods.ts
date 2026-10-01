export interface MethodOption {
  id: string
  name: string
  /** Ringkasan durasi tetap; dikosongkan untuk metode yang belum bisa dijalankan. */
  detail: string
  available: boolean
}

export const METHOD_OPTIONS: readonly MethodOption[] = [
  { id: 'pomodoro', name: 'Pomodoro', detail: '25 menit', available: true },
  { id: '52-17', name: '52/17', detail: '52 menit', available: true },
  { id: 'ultradian', name: 'Ultradian', detail: '90 menit', available: true },
  { id: 'flowtime', name: 'Flowtime', detail: 'Hitung maju', available: true },
  { id: 'timeboxing', name: 'Time boxing', detail: 'Belum bisa', available: false },
]

const FALLBACK_METHOD: MethodOption = METHOD_OPTIONS[0]!

export const methodName = (id: string): string =>
  METHOD_OPTIONS.find((method) => method.id === id)?.name ?? FALLBACK_METHOD.name
