import { describe, expect, it } from 'vitest'
import { contrastRatio, hexToRgb, meetsAA } from '@/lib/contrast'
import { TOKENS } from '@/styles/tokens.generated'

describe('hexToRgb', () => {
  it('menerima heks 6 digit dan 3 digit', () => {
    expect(hexToRgb('#1B1A17')).toEqual({ r: 27, g: 26, b: 23 })
    expect(hexToRgb('f2eee6')).toEqual({ r: 242, g: 238, b: 230 })
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('menolak nilai yang bukan warna', () => {
    expect(() => hexToRgb('rgb(1,2,3)')).toThrow()
    expect(() => hexToRgb('#12345')).toThrow()
  })
})

describe('kontras token tema', () => {
  for (const [themeName, theme] of Object.entries(TOKENS)) {
    describe(`tema ${themeName}`, () => {
      const pairs: ReadonlyArray<readonly [label: string, foreground: string, background: string]> =
        [
          ['teks utama di atas latar', theme.ink, theme.paper],
          ['teks utama di atas permukaan naik', theme.ink, theme.paperRaised],
          ['teks sekunder di atas latar', theme.inkMuted, theme.paper],
          ['teks sekunder di atas permukaan naik', theme.inkMuted, theme.paperRaised],
          ['teks tombol utama di atas aksen fokus', theme.inkInverse, theme.accentFocus],
          ['aksen fokus di atas latar', theme.accentFocus, theme.paper],
          ['batang grafik statistik di atas permukaan naik', theme.accentFocus, theme.paperRaised],
          ['batang grafik statistik di atas bilah grafik', theme.accentFocus, theme.paperSunken],
          ['aksen istirahat di atas latar', theme.accentBreak, theme.paper],
          ['aksen istirahat panjang di atas latar', theme.accentLongbreak, theme.paper],
          ['teks tombol di atas aksen istirahat', theme.inkInverse, theme.accentBreak],
          ['teks tombol di atas aksen istirahat panjang', theme.inkInverse, theme.accentLongbreak],
        ]

      for (const [label, foreground, background] of pairs) {
        it(`${label} memenuhi AA`, () => {
          expect(
            meetsAA(foreground, background),
            `${label}: ${contrastRatio(foreground, background).toFixed(2)}:1`,
          ).toBe(true)
        })
      }

      it('batas interaktif di atas latar (>= 3:1, elemen non-teks)', () => {
        expect(
          meetsAA(theme.lineStrong, theme.paper, true),
          `batas interaktif: ${contrastRatio(theme.lineStrong, theme.paper).toFixed(2)}:1`,
        ).toBe(true)
      })

      it('batas interaktif di atas permukaan naik (>= 3:1, elemen non-teks)', () => {
        expect(
          meetsAA(theme.lineStrong, theme.paperRaised, true),
          `batas interaktif di permukaan naik: ${contrastRatio(theme.lineStrong, theme.paperRaised).toFixed(2)}:1`,
        ).toBe(true)
      })

      it('cincin fokus memenuhi 3:1', () => {
        expect(meetsAA(theme.accentFocus, theme.paper, true)).toBe(true)
      })

      it('teks di atas bilah status sistem tetap terbaca', () => {
        expect(
          meetsAA(theme.inkMuted, theme.paperSunken),
          `bilah status: ${contrastRatio(theme.inkMuted, theme.paperSunken).toFixed(2)}:1`,
        ).toBe(true)
      })
    })
  }
})
