/**
 * Membaca token dari src/styles/tokens.css, lalu menulis src/styles/tokens.generated.ts
 * dan memperbarui blok warna di DESIGN.md. Satu sumber nilai, jadi tabel desain tidak
 * bisa melenceng dari CSS.
 *
 * Jalankan: node scripts/check-tokens.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const cssPath = fileURLToPath(new URL('src/styles/tokens.css', root))
const outPath = fileURLToPath(new URL('src/styles/tokens.generated.ts', root))
const designPath = fileURLToPath(new URL('DESIGN.md', root))
const manifestPath = fileURLToPath(new URL('public/manifest.webmanifest', root))

const css = readFileSync(cssPath, 'utf8')

function blockAfter(marker) {
  const start = css.search(new RegExp(`^${marker.replace(/[.*+?^$()|[\]\\]/g, '\\$&')}\\s*{`, 'm'))
  if (start === -1) throw new Error(`Blok tidak ditemukan: ${marker}`)

  let depth = 0
  let bodyStart = -1
  for (let i = start; i < css.length; i += 1) {
    const char = css[i]
    if (char === '{') {
      depth += 1
      if (depth === 1) bodyStart = i + 1
      continue
    }
    if (char === '}') {
      depth -= 1
      if (depth === 0) return css.slice(bodyStart, i)
    }
  }
  throw new Error(`Blok tidak tertutup: ${marker}`)
}

function varsIn(block) {
  const vars = {}
  for (const match of block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    vars[match[1]] = match[2].toLowerCase()
  }
  return vars
}

const light = varsIn(blockAfter(':root'))
const dark = varsIn(blockAfter("[data-theme='dark']"))

// --accent-focus sengaja mengulang literal --accent (alias var() tidak bisa
// mengunci nilai saat atribut data-phase menimpa --accent). Duplikasi ini dijaga:
// kalau satu berubah tanpa yang lain, lempar error.
for (const [theme, vars] of [
  ['terang', light],
  ['gelap', dark],
]) {
  if (vars['accent-focus'] !== vars.accent) {
    throw new Error(`--accent-focus tidak kembar dengan --accent di tema ${theme}`)
  }
}

const need = (vars, name, theme) => {
  const value = vars[name]
  if (!value) throw new Error(`Token --${name} tidak ada di tema ${theme}`)
  return value
}

const toEntry = (vars, theme) => ({
  paper: need(vars, 'paper', theme),
  paperRaised: need(vars, 'paper-raised', theme),
  paperSunken: need(vars, 'paper-sunken', theme),
  ink: need(vars, 'ink', theme),
  inkMuted: need(vars, 'ink-muted', theme),
  inkFaint: need(vars, 'ink-faint', theme),
  line: need(vars, 'line', theme),
  lineStrong: need(vars, 'line-strong', theme),
  inkInverse: need(vars, 'ink-inverse', theme),
  accentFocus: need(vars, 'accent', theme),
  accentBreak: need(vars, 'accent-break', theme),
  accentLongbreak: need(vars, 'accent-longbreak', theme),
})

const tokens = { terang: toEntry(light, 'terang'), gelap: toEntry(dark, 'gelap') }

const rows = [
  ['paper', 'paper', 'Kertas hangat'],
  ['paper-raised', 'paperRaised', 'Permukaan naik'],
  ['paper-sunken', 'paperSunken', 'Bilah status'],
  ['ink', 'ink', 'Tinta utama'],
  ['ink-muted', 'inkMuted', 'Teks sekunder'],
  ['line', 'line', 'Garis pemisah'],
  ['line-strong', 'lineStrong', 'Batas interaktif (WCAG 1.4.11)'],
  ['accent', 'accentFocus', 'Aksen fokus'],
  ['accent-focus', 'accentFocus', 'Aksen grafik tanpa ikut fase'],
  ['accent-break', 'accentBreak', 'Aksen istirahat'],
  ['accent-longbreak', 'accentLongbreak', 'Aksen istirahat panjang'],
]

const table = [
  '| Token | Terang | Gelap | Catatan |',
  '| --- | --- | --- | --- |',
  ...rows.map(
    ([name, key, note]) =>
      `| \`--${name}\` | \`${tokens.terang[key]}\` | \`${tokens.gelap[key]}\` | ${note} |`,
  ),
].join('\n')

const design = readFileSync(designPath, 'utf8')
const begin = '<!-- tokens:begin -->'
const end = '<!-- tokens:end -->'
const block = `${begin}\n${table}\n${end}`
const next = design.includes(begin)
  ? design.replace(new RegExp(`${begin}[\\s\\S]*?${end}`), block)
  : design
if (!design.includes(begin)) {
  throw new Error(`DESIGN.md tidak punya penanda ${begin} / ${end}`)
}
writeFileSync(designPath, next)

writeFileSync(
  outPath,
  `/**
 * Dibuat otomatis oleh scripts/check-tokens.mjs dari src/styles/tokens.css.
 * Jangan disunting tangan; ubah token lalu jalankan \`node scripts/check-tokens.mjs\`.
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

export const TOKENS: Record<'terang' | 'gelap', ThemeTokens> = ${JSON.stringify(tokens, null, 2)}

export const MANIFEST_THEME_COLOR = '${tokens.terang.paper}'
`,
)

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (manifest.theme_color.toLowerCase() !== tokens.terang.paper) {
  throw new Error(
    `theme_color manifest (${manifest.theme_color}) tidak sama dengan token paper terang (${tokens.terang.paper})`,
  )
}
if (manifest.background_color.toLowerCase() !== tokens.terang.paper) {
  throw new Error(
    `background_color manifest (${manifest.background_color}) tidak sama dengan token paper terang (${tokens.terang.paper})`,
  )
}

console.log('Token tersinkron: tokens.generated.ts dan tabel di DESIGN.md sudah diperbarui.')
