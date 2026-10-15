/** Values that are safe to store in localStorage. Timer intervals do not go here. */
export type StoredValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | StoredValue[]
  | { [key: string]: StoredValue | undefined }

const KEY_PREFIX = 'ritme.v1.'

export interface PersistedRecord {
  v: number
  value: unknown
}

/** localStorage blocked or quota-limited: probed only once per page load. */
let storageProbe: boolean | null = null

export function storageWorks(): boolean {
  if (storageProbe !== null) return storageProbe
  const probe = `${KEY_PREFIX}probe`
  try {
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    storageProbe = true
  } catch {
    storageProbe = false
  }
  return storageProbe
}

export function read<T>(name: string, fallback: T, validate?: (value: unknown) => value is T): T {
  if (!storageWorks()) return fallback
  const raw = localStorage.getItem(`${KEY_PREFIX}${name}`)
  if (raw === null) return fallback
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || !('value' in parsed)) return fallback
    const { value } = parsed as PersistedRecord
    if (validate && !validate(value)) return fallback
    return value as T
  } catch {
    return fallback
  }
}

export function write(name: string, version: number, value: unknown): void {
  if (!storageWorks()) return
  try {
    localStorage.setItem(
      `${KEY_PREFIX}${name}`,
      JSON.stringify({ v: version, value } satisfies PersistedRecord),
    )
  } catch {
    // Quota full: the timer keeps running, only preferences are not saved.
    storageProbe = false
  }
}

export function clear(name: string): void {
  if (!storageWorks()) return
  localStorage.removeItem(`${KEY_PREFIX}${name}`)
}

/** true for any value that can round-trip through JSON unchanged. */
export function isStoredValue(value: unknown): value is StoredValue {
  if (value === null || value === undefined) return true
  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') return true
  if (Array.isArray(value)) return value.every(isStoredValue)
  if (type !== 'object') return false
  return Object.values(value as Record<string, unknown>).every(isStoredValue)
}
