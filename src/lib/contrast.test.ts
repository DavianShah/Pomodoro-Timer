import { describe, expect, it } from 'vitest'
import { contrastRatio, hexToRgb, meetsAA } from '@/lib/contrast'
import { TOKENS } from '@/styles/tokens.generated'

describe('hexToRgb', () => {
  it('accepts 6-digit and 3-digit hex', () => {
    expect(hexToRgb('#1B1A17')).toEqual({ r: 27, g: 26, b: 23 })
    expect(hexToRgb('f2eee6')).toEqual({ r: 242, g: 238, b: 230 })
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('rejects values that are not colors', () => {
    expect(() => hexToRgb('rgb(1,2,3)')).toThrow()
    expect(() => hexToRgb('#12345')).toThrow()
  })
})

describe('theme token contrast', () => {
  for (const [themeName, theme] of Object.entries(TOKENS)) {
    describe(`theme ${themeName}`, () => {
      const pairs: ReadonlyArray<readonly [label: string, foreground: string, background: string]> =
        [
          ['primary text on background', theme.ink, theme.paper],
          ['primary text on raised surface', theme.ink, theme.paperRaised],
          ['secondary text on background', theme.inkMuted, theme.paper],
          ['secondary text on raised surface', theme.inkMuted, theme.paperRaised],
          ['primary button text on focus accent', theme.inkInverse, theme.accentFocus],
          ['focus accent on background', theme.accentFocus, theme.paper],
          ['stats chart bar on raised surface', theme.accentFocus, theme.paperRaised],
          ['stats chart bar on chart track', theme.accentFocus, theme.paperSunken],
          ['break accent on background', theme.accentBreak, theme.paper],
          ['long break accent on background', theme.accentLongbreak, theme.paper],
          ['button text on break accent', theme.inkInverse, theme.accentBreak],
          ['button text on long break accent', theme.inkInverse, theme.accentLongbreak],
        ]

      for (const [label, foreground, background] of pairs) {
        it(`${label} meets AA`, () => {
          expect(
            meetsAA(foreground, background),
            `${label}: ${contrastRatio(foreground, background).toFixed(2)}:1`,
          ).toBe(true)
        })
      }

      it('interactive border on background (>= 3:1, non-text elements)', () => {
        expect(
          meetsAA(theme.lineStrong, theme.paper, true),
          `interactive border: ${contrastRatio(theme.lineStrong, theme.paper).toFixed(2)}:1`,
        ).toBe(true)
      })

      it('interactive border on raised surface (>= 3:1, non-text elements)', () => {
        expect(
          meetsAA(theme.lineStrong, theme.paperRaised, true),
          `interactive border on raised surface: ${contrastRatio(theme.lineStrong, theme.paperRaised).toFixed(2)}:1`,
        ).toBe(true)
      })

      it('the focus ring meets 3:1', () => {
        expect(meetsAA(theme.accentFocus, theme.paper, true)).toBe(true)
      })

      it('text on the system status bar stays legible', () => {
        expect(
          meetsAA(theme.inkMuted, theme.paperSunken),
          `status bar: ${contrastRatio(theme.inkMuted, theme.paperSunken).toFixed(2)}:1`,
        ).toBe(true)
      })
    })
  }
})
