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
    const parse = (value: string): number[] => (value.match(/\d+/g) ?? []).slice(0, 3).map(Number)
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

test('timer berjalan dan berhenti saat dijeda', async ({ page }) => {
  await page.goto('/')
  const clock = page.locator('h1')
  await expect(clock).toHaveText('25:00')

  const flowtime = page.getByRole('button', { name: /Flowtime/ })
  await page.getByRole('button', { name: 'Mulai', exact: true }).click()

  // Saat berjalan, metode tidak boleh bisa diganti (PRD F3).
  await expect(flowtime).toBeDisabled()
  await expect(clock).not.toHaveText('25:00')
  const frozen = await clock.textContent()

  await page.getByRole('button', { name: 'Jeda', exact: true }).click()
  await page.waitForTimeout(1_500)
  await expect(clock).toHaveText(frozen ?? '')
  await expect(flowtime).toBeEnabled()
})

test('Flowtime hitung maju, Selesai menyiapkan istirahat proporsional', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Flowtime/ }).click()

  const clock = page.locator('h1')
  await expect(clock).toHaveText('0:00')

  await page.getByRole('button', { name: 'Mulai', exact: true }).click()
  await expect(clock).not.toHaveText('0:00')
  await expect(page.getByRole('button', { name: 'Selesai', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Selesai', exact: true }).click()
  // Fokus <25 menit → istirahat 5 menit (PRD bagian 3).
  await expect(page.getByRole('button', { name: 'Mulai istirahat' })).toBeVisible()
  await expect(clock).toHaveText('5:00')
  await expect(page.getByText('Istirahat', { exact: true })).toBeVisible()

  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
  )
  expect(accent).toBe(TOKENS.terang.accentBreak)
})

test('reload saat timer jalan tetap melanjutkan sisa waktu', async ({ page }) => {
  await page.goto('/')
  const clock = page.locator('h1')
  await page.getByRole('button', { name: 'Mulai', exact: true }).click()
  await page.waitForTimeout(1_200)
  await expect(clock).not.toHaveText('25:00')

  await page.reload()
  // Pulih: masih jalan, sisa waktu berlanjut, bukan kembali ke 25:00.
  await expect(page.getByRole('button', { name: 'Jeda', exact: true })).toBeVisible()
  await expect(clock).not.toHaveText('25:00')
  const resumed = await clock.textContent()
  await page.waitForTimeout(1_200)
  await expect(clock).not.toHaveText(resumed ?? '')
})

test('shortcut: spasi mulai/jeda, angka ganti metode, R reset, S lewati', async ({ page }) => {
  await page.goto('/')
  const clock = page.locator('h1')
  // Listener shortcut dipasang di efek React setelah paint pertama.
  await expect(page.getByRole('button', { name: 'Mulai', exact: true })).toBeVisible()
  await page.waitForTimeout(200)

  // Spasi dari body: mulai, lalu jeda (tanpa scroll, satu aksi per tekan).
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Jeda', exact: true })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Mulai', exact: true })).toBeVisible()

  // Angka saat idle: ganti metode; metode tanpa siklus tanpa baris sesi.
  await page.keyboard.press('3')
  await expect(page.getByRole('button', { name: /Ultradian/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText('Fokus', { exact: true })).toBeVisible()
  await expect(page.getByText(/Sesi \d/)).toHaveCount(0)

  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Jeda', exact: true })).toBeVisible()
  await page.keyboard.press('r')
  await expect(page.getByRole('button', { name: 'Mulai', exact: true })).toBeVisible()
  await expect(clock).toHaveText('90:00')

  await page.keyboard.press('1')
  await page.keyboard.press('s')
  await expect(page.getByText('Istirahat · Sesi 1 dari 4', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mulai istirahat' })).toBeVisible()

  // Petunjuk shortcut di layar.
  await page.getByRole('button', { name: '?' }).click()
  await expect(page.getByText('Spasi · mulai/jeda')).toBeVisible()

  // Spasi saat fokus di tombol: satu aksi (native), tanpa ganda.
  await page.getByRole('button', { name: 'Mulai istirahat' }).click()
  await expect(page.getByRole('button', { name: 'Jeda', exact: true })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Mulai istirahat' })).toBeVisible()
})

test('judul tab: nama aplikasi saat idle, sisa waktu saat jalan', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Ritme')

  await page.getByRole('button', { name: 'Mulai', exact: true }).click()
  await expect(page).toHaveTitle(/^\d+:\d\d · Fokus$/)

  await page.getByRole('button', { name: 'Jeda', exact: true }).click()
  await expect(page).toHaveTitle('Ritme')
})

test('jendela mini fallback popup: sinkron, aksi ke halaman utama, reset saat ditutup', async ({
  page,
}) => {
  // Paksa jalur fallback: PiP asli tidak bisa diuji headless (checklist di README).
  await page.addInitScript(() => {
    Object.defineProperty(window, 'documentPictureInPicture', {
      value: undefined,
      configurable: true,
    })
  })
  await page.goto('/')

  const miniButton = page.getByRole('button', { name: 'Jendela mini' })
  await expect(miniButton).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: 'Mulai', exact: true }).click()

  const popupPromise = page.waitForEvent('popup')
  await miniButton.click()
  const popup = await popupPromise
  await expect(miniButton).toHaveAttribute('aria-pressed', 'true')

  // Gaya ikut termuat: stylesheet diklon, angka memakai font mono yang benar.
  await expect
    .poll(() =>
      popup
        .locator('.angka')
        .evaluate((el) => getComputedStyle(el).fontFamily)
        .catch(() => ''),
    )
    .toContain('JetBrains Mono')
  await expect(popup.locator('html')).toHaveAttribute('data-phase', 'focus')
  const mainTheme = await page.locator('html').getAttribute('data-theme')
  expect(await popup.locator('html').getAttribute('data-theme')).toBe(mainTheme)

  // Waktu yang sama (beda maksimal 1 detik karena baca terpisah).
  const toSeconds = (text: string | null): number => {
    const [minutes, seconds] = (text ?? '').split(':').map(Number)
    return (minutes ?? 0) * 60 + (seconds ?? 0)
  }
  const mainClock = await page.locator('h1').textContent()
  const popupClock = await popup.locator('.angka').textContent()
  expect(Math.abs(toSeconds(popupClock) - toSeconds(mainClock))).toBeLessThanOrEqual(1)

  // Tombol di popup menjeda timer halaman utama.
  await popup.getByRole('button', { name: 'Jeda', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Mulai', exact: true })).toBeVisible()

  // Spasi dari body window mini: mulai lagi lewat listener window mini.
  await popup.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await popup.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Jeda', exact: true })).toBeVisible()

  // R di window mini: reset halaman utama ke 25:00.
  await popup.keyboard.press('r')
  await expect(page.locator('h1')).toHaveText('25:00')
  await expect(page.getByRole('button', { name: 'Mulai', exact: true })).toBeVisible()

  // Ditutup lewat X → state "terbuka" di halaman utama ter-reset.
  await popup.close()
  await expect(miniButton).toHaveAttribute('aria-pressed', 'false')

  // Buka lagi setelah ditutup.
  const secondPopup = page.waitForEvent('popup')
  await miniButton.click()
  expect(await secondPopup).toBeTruthy()
})

test('popup diblokir: pesan role=status di layar utama, bukan gagal diam-diam', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'documentPictureInPicture', {
      value: undefined,
      configurable: true,
    })
    window.open = () => null
  })
  await page.goto('/')

  await page.getByRole('button', { name: 'Jendela mini' }).click()
  await expect(page.getByText('Popup diblokir — jendela mini tidak terbuka')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Jendela mini' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})
