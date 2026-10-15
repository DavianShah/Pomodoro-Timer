/**
 * WCAG contrast from the actual token values. The numbers in DESIGN.md and
 * public/manifest.webmanifest must match these same values.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

export function hexToRgb(value: string): Rgb {
  const hex = value.trim().replace('#', '')
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => char + char)
          .join('')
      : hex
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Not a 6-digit hex color: ${value}`)
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

function channelToLinear(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(value: string): number {
  const { r, g, b } = hexToRgb(value)
  return (
    0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b)
  )
}

export function contrastRatio(a: string, b: string): number {
  const lumA = relativeLuminance(a)
  const lumB = relativeLuminance(b)
  const [high, low] = lumA >= lumB ? [lumA, lumB] : [lumB, lumA]
  return (high + 0.05) / (low + 0.05)
}

export function meetsAA(a: string, b: string, large = false): boolean {
  return contrastRatio(a, b) >= (large ? 3 : 4.5)
}
