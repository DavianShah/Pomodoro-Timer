/**
 * Dibuat otomatis oleh scripts/check-tokens.mjs dari src/styles/tokens.css.
 * Jangan disunting tangan; ubah token lalu jalankan `node scripts/check-tokens.mjs`.
 */

export interface ThemeTokens {
  paper: string
  paperRaised: string
  paperSunken: string
  ink: string
  inkMuted: string
  inkFaint: string
  line: string
  lineStrong: string
  inkInverse: string
  accentFocus: string
  accentBreak: string
  accentLongbreak: string
}

export const TOKENS: Record<'terang' | 'gelap', ThemeTokens> = {
  "terang": {
    "paper": "#f2eee6",
    "paperRaised": "#faf7f1",
    "paperSunken": "#e6e0d4",
    "ink": "#1b1a17",
    "inkMuted": "#67614f",
    "inkFaint": "#a49c8c",
    "line": "#d3cbbb",
    "lineStrong": "#857a64",
    "inkInverse": "#f2eee6",
    "accentFocus": "#a8441f",
    "accentBreak": "#3f5c39",
    "accentLongbreak": "#7c5a12"
  },
  "gelap": {
    "paper": "#14130f",
    "paperRaised": "#1d1b16",
    "paperSunken": "#0e0d0a",
    "ink": "#f2eee6",
    "inkMuted": "#b3a996",
    "inkFaint": "#6b6559",
    "line": "#3a352b",
    "lineStrong": "#7b7462",
    "inkInverse": "#14130f",
    "accentFocus": "#d4682f",
    "accentBreak": "#6d8c62",
    "accentLongbreak": "#c08f2c"
  }
}

export const MANIFEST_THEME_COLOR = '#f2eee6'
