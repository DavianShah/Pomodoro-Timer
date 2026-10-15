/**
 * PWA requirement locks (F15) that could silently slip through if files are
 * edited by hand: the manifest meets install requirements, its colors match
 * the tokens, the icon is derived from one SVG with no gradients and token
 * colors, and the theme-color tag in index.html follows the tokens.
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
  it('name, language, display, start_url and colors follow the tokens', () => {
    expect(manifest.name).toBe('Ritme')
    expect(manifest.short_name).toBe('Ritme')
    expect(manifest.lang).toBe('en')
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    expect(manifest.theme_color).toBe(TOKENS.light.paper)
    expect(manifest.background_color).toBe(TOKENS.light.paper)
  })

  it('192, 512, and maskable icons are available', () => {
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

describe('icon', () => {
  it('one simple SVG: no gradients, all colors from tokens', () => {
    expect(iconSvg).not.toMatch(/gradient/i)
    expect(iconSvg).not.toMatch(/\p{Extended_Pictographic}/u)

    const tokenColors = new Set(JSON.stringify(TOKENS).match(/#[0-9a-f]{6}/gi) ?? [])
    const fills = [...iconSvg.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)].map((match) =>
      match[1]!.toLowerCase(),
    )
    expect(fills.length).toBeGreaterThan(0)
    for (const fill of fills) expect(tokenColors.has(fill)).toBe(true)
  })

  it('glyph is padded into the maskable safe zone (scale <= 0.8)', () => {
    const scale = /scale\(([\d.]+)\)/.exec(iconSvg)
    expect(scale).not.toBeNull()
    expect(Number(scale![1])).toBeLessThanOrEqual(0.8)
  })
})

describe('index.html', () => {
  it('theme-color follows the light and dark tokens', () => {
    const colors = [...indexHtml.matchAll(/name="theme-color" content="(#[0-9a-fA-F]{6})"/g)].map(
      (match) => match[1]!.toLowerCase(),
    )
    expect(colors).toEqual([TOKENS.light.paper, TOKENS.dark.paper])
  })
})
