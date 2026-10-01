/**
 * Kunci syarat PWA (F15) yang bisa lolos diam-diam kalau berkas diubah
 * tangan: manifest memenuhi ketentuan pemasangan, warnanya sama dengan
 * token, ikon diturunkan dari satu SVG tanpa gradien dan berwarna token,
 * tag theme-color di index.html ikut token.
 */
import { describe, expect, it } from 'vitest'
import { TOKENS } from '@/styles/tokens.generated'

interface ManifestIcon {
  src: string
  sizes: string
  type: string
  purpose?: string
}

interface Manifest {
  name: string
  short_name: string
  lang: string
  display: string
  start_url: string
  theme_color: string
  background_color: string
  icons: ManifestIcon[]
}

const textAssets = import.meta.glob('../../public/*.{svg,webmanifest}', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const htmlFiles = import.meta.glob('../../index.html', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const pngFiles = Object.keys(import.meta.glob('../../public/*.png'))

const manifest = JSON.parse(textAssets['../../public/manifest.webmanifest']!) as Manifest
const iconSvg = textAssets['../../public/icon.svg']!
const indexHtml = htmlFiles['../../index.html']!

describe('manifest (F15)', () => {
  it('nama, bahasa, display, start_url dan warna ikut token', () => {
    expect(manifest.name).toBe('Ritme')
    expect(manifest.short_name).toBe('Ritme')
    expect(manifest.lang).toBe('id')
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    expect(manifest.theme_color).toBe(TOKENS.terang.paper)
    expect(manifest.background_color).toBe(TOKENS.terang.paper)
  })

  it('ikon 192, 512, dan maskable tersedia', () => {
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: '192x192' }),
        expect.objectContaining({ sizes: '512x512' }),
        expect.objectContaining({ purpose: 'maskable' }),
      ]),
    )
    const assetPaths = [...Object.keys(textAssets), ...pngFiles]
    for (const icon of manifest.icons) {
      expect(assetPaths.some((path) => path.endsWith(icon.src))).toBe(true)
    }
  })
})

describe('ikon', () => {
  it('satu SVG sederhana: tanpa gradien, semua warna dari token', () => {
    expect(iconSvg).not.toMatch(/gradient/i)
    expect(iconSvg).not.toMatch(/\p{Extended_Pictographic}/u)

    const tokenColors = new Set(JSON.stringify(TOKENS).match(/#[0-9a-f]{6}/gi) ?? [])
    const fills = [...iconSvg.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map((match) =>
      match[1]!.toLowerCase(),
    )
    expect(fills.length).toBeGreaterThan(0)
    for (const fill of fills) expect(tokenColors.has(fill)).toBe(true)
  })

  it('glyph dipadatkan ke zona aman maskable (skala <= 0.8)', () => {
    const scale = /scale\(([\d.]+)\)/.exec(iconSvg)
    expect(scale).not.toBeNull()
    expect(Number(scale![1])).toBeLessThanOrEqual(0.8)
  })
})

describe('index.html', () => {
  it('theme-color mengikuti token terang dan gelap', () => {
    const colors = [...indexHtml.matchAll(/name="theme-color" content="(#[0-9a-fA-F]{6})"/g)].map(
      (match) => match[1]!.toLowerCase(),
    )
    expect(colors).toEqual([TOKENS.terang.paper, TOKENS.gelap.paper])
  })
})
