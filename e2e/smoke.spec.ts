import { TOKENS } from '../src/styles/tokens.generated'
import { expect, test } from '@playwright/test'

test('layar timer tampil dengan angka yang tidak bergeser', async ({ page }) => {
  await page.goto('/')

  const clock = page.getByRole('heading', { name: '25:00' })
  await expect(clock).toBeVisible()

  const styles = await clock.evaluate((node) => {
    const computed = getComputedStyle(node)
    return {
      fontFamily: computed.fontFamily,
      fontVariantNumeric: computed.fontVariantNumeric,
    }
  })
  expect(styles.fontFamily).toContain('JetBrains Mono')
  expect(styles.fontVariantNumeric).toContain('tabular-nums')

  const accent = await page.evaluate(() =>
    getComputedStyle(document.body).getPropertyValue('--accent').trim(),
  )
  expect(accent).toBe(TOKENS.terang.accentFocus)

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false)
})

test('tidak ada teks yang tumpang tindih atau meluber di layar sempit', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/')

  const report = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('nav button')]
    const rects = buttons.map((b) => b.getBoundingClientRect())
    let overlaps = 0
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i]
        const b = rects[j]
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
          overlaps += 1
        }
      }
    }
    const clipped = [...document.querySelectorAll('main *')].filter(
      (el) => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0,
    ).length
    return {
      overlaps,
      clipped,
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })

  expect(report.overlaps).toBe(0)
  expect(report.clipped).toBe(0)
  expect(report.horizontalOverflow).toBe(false)
})

test('teks tombol metode aktif kontras terhadap latarnya sendiri', async ({ page }) => {
  await page.goto('/')

  const ratio = await page.evaluate((): number => {
    const parse = (value: string): number[] =>
      (value.match(/\d+/g) ?? []).slice(0, 3).map(Number)
    const luminance = (rgb: number[]): number => {
      const [r, g, b] = rgb.map((channel) => {
        const c = channel / 255
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }) as [number, number, number]
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const contrast = (foreground: number[], background: number[]): number => {
      const [high, low] = [luminance(foreground), luminance(background)].sort((x, y) => y - x) as [
        number,
        number,
      ]
      return (high + 0.05) / (low + 0.05)
    }

    const active = document.querySelector('nav button[aria-pressed="true"]')
    if (!(active instanceof HTMLElement)) throw new Error('Tombol metode aktif tidak ditemukan')

    const styles = getComputedStyle(active)
    let node: HTMLElement | null = active
    let surface = styles.backgroundColor
    while (surface === 'rgba(0, 0, 0, 0)' && node.parentElement) {
      node = node.parentElement
      surface = getComputedStyle(node).backgroundColor
    }

    const colors = [...active.querySelectorAll('span')].map((span) => {
      const spanStyles = getComputedStyle(span)
      return contrast(parse(spanStyles.color), parse(surface))
    })
    colors.push(contrast(parse(styles.color), parse(surface)))
    return Math.min(...colors)
  })

  expect(ratio).toBeGreaterThanOrEqual(4.5)
})

test('ganti metode tersimpan setelah muat ulang, tanpa reload', async ({ page }) => {
  await page.goto('/')

  const flowtime = page.getByRole('button', { name: /Flowtime/ })
  await flowtime.click()
  await expect(flowtime).toHaveAttribute('aria-pressed', 'true')
  expect(page.url()).toContain('/')

  await page.reload()
  await expect(page.getByRole('button', { name: /Flowtime/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('pilihan tema gelap dipasang di elemen html', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('radio', { name: 'Gelap' }).check({ force: true })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('radio', { name: 'Terang' }).check({ force: true })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('lompat ke kontrol timer lewat keyboard', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')

  const skip = page.getByRole('link', { name: 'Lompat ke kontrol timer' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#kontrol-timer')).toBeFocused()
})
