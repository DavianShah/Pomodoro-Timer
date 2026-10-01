import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Audit aksesibilitas (PRD F10 + M5b): axe-core WCAG 2.1 A/AA di dua tema,
 * jalur layar utama, panel, dan jendela mini; ditambah perilaku yang tidak
 * ditangkap axe (cincin fokus keyboard, aria-live tanpa pengumuman per
 * detik, reduced motion).
 *
 * Yang menggagalkan: pelanggaran serious/critical. Sisanya dicatat ke log.
 */

const THEMES = ['Terang', 'Gelap'] as const

async function setTheme(page: Page, name: (typeof THEMES)[number]): Promise<void> {
  await page.getByRole('radio', { name }).check({ force: true })
}

/** Tunggu transisi latar (300ms) selesai: axe membaca warna di tengah jalan. */
async function settleBackground(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()
        const match = /^#([0-9a-f]{6})$/i.exec(paper)
        if (match === null) return false
        const value = Number.parseInt(match[1], 16)
        const rgb = `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`
        return getComputedStyle(document.body).backgroundColor === rgb
      }),
    )
    .toBe(true)
}

async function scan(page: Page, label: string): Promise<void> {
  await settleBackground(page)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  )
  const minor = results.violations.filter((violation) => !blocking.includes(violation))
  if (minor.length > 0) {
    // Di bawah ambang (moderate/minor): dicatat di anotasi laporan, tidak menggagalkan.
    test.info().annotations.push({
      type: 'axe-below-threshold',
      description: `${label}: ${minor
        .map((violation) => `${violation.id} (${violation.nodes.length})`)
        .join(', ')}`,
    })
  }

  expect(
    blocking.map((violation) => {
      const first = violation.nodes[0]
      return `${violation.impact} ${violation.id}: ${violation.nodes.length} node → ${String(first?.target)}\n${first?.failureSummary ?? ''}`
    }),
    `axe serious/critical di ${label}`,
  ).toEqual([])
}

interface Screen {
  name: string
  open: (page: Page) => Promise<void>
  close: (page: Page) => Promise<void>
}

/** Panel: buka lewat tombol, tutup lewat Escape — tunggu sampai benar-benar berubah. */
function panel(name: string): Screen {
  const toggle = (page: Page) => page.getByRole('button', { name, exact: true })
  return {
    name: `panel ${name.toLowerCase()}`,
    open: async (page) => {
      await toggle(page).click()
      await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true')
    },
    close: async (page) => {
      await page.keyboard.press('Escape')
      await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
    },
  }
}

const help: Screen = {
  name: 'petunjuk shortcut',
  open: async (page) => {
    await page.getByRole('button', { name: '?', exact: true }).click()
    await expect(page.locator('#petunjuk-shortcut')).toBeVisible()
  },
  // Petunjuk bukan panel: ditutup lewat tombolnya, bukan Escape.
  close: async (page) => {
    await page.getByRole('button', { name: '?', exact: true }).click()
    await expect(page.locator('#petunjuk-shortcut')).toBeHidden()
  },
}

const SCREENS: Screen[] = [
  { name: 'layar timer', open: async () => {}, close: async () => {} },
  panel('Task'),
  panel('Statistik'),
  panel('Jadwal'),
  panel('Pengaturan'),
  help,
]

for (const screen of SCREENS) {
  test(`axe: ${screen.name} — terang dan gelap`, async ({ page }) => {
    await page.goto('/')

    for (const theme of THEMES) {
      await setTheme(page, theme)
      await screen.open(page)
      await scan(page, `${screen.name} / ${theme}`)
      await screen.close(page)
    }
  })
}

test('axe: jendela mini — terang dan gelap', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'documentPictureInPicture', {
      value: undefined,
      configurable: true,
    })
  })
  await page.goto('/')

  for (const theme of THEMES) {
    await setTheme(page, theme)
    const popupPromise = page.waitForEvent('popup')
    await page.getByRole('button', { name: 'Jendela mini' }).click()
    const popup = await popupPromise
    await expect(popup.locator('.angka')).toBeVisible()
    await scan(popup, `jendela mini / ${theme}`)

    await popup.close()
    await expect(page.getByRole('button', { name: 'Jendela mini' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  }
})

test('keyboard: radio tema punya cincin fokus yang terlihat', async ({ page }) => {
  await page.goto('/')

  let reached = false
  for (let step = 0; step < 40 && !reached; step += 1) {
    await page.keyboard.press('Tab')
    reached = await page.evaluate(
      () =>
        document.activeElement instanceof HTMLInputElement &&
        document.activeElement.type === 'radio',
    )
  }
  expect(reached, 'radio tema tidak terjangkau lewat Tab').toBe(true)

  const ring = await page.evaluate(() => {
    const input = document.activeElement
    const label = input instanceof HTMLInputElement ? input.closest('label') : null
    if (label === null) return null
    const style = getComputedStyle(label)
    return { style: style.outlineStyle, width: style.outlineWidth }
  })
  expect(ring?.style).toBe('solid')
  expect(Number.parseInt(ring?.width ?? '0', 10)).toBeGreaterThanOrEqual(2)
})

test('keyboard: aksi utama Mulai terjangkau lewat Tab', async ({ page }) => {
  await page.goto('/')

  let reached = false
  for (let step = 0; step < 30 && !reached; step += 1) {
    await page.keyboard.press('Tab')
    reached = await page.evaluate(
      () =>
        document.activeElement instanceof HTMLButtonElement &&
        document.activeElement.textContent?.trim() === 'Mulai',
    )
  }
  expect(reached, 'tombol Mulai tidak terjangkau lewat Tab').toBe(true)
})

test('aria-live: pengumuman hanya saat status berubah, bukan tiap detik', async ({ page }) => {
  await page.goto('/')
  const status = page.locator('main [aria-live="polite"]')
  await expect(status).toBeVisible()

  await page.getByRole('button', { name: 'Mulai', exact: true }).click()
  const running = await status.textContent()

  // Sisa waktu tiap detik tidak boleh masuk ke live region.
  await page.waitForTimeout(2_500)
  expect(await status.textContent()).toBe(running)

  // Perubahan fase tetap diumumkan.
  await page.keyboard.press('s')
  await expect(status).not.toHaveText(running ?? 'zzz')
})

test('reduced motion: transisi dimatikan', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  // Angka dinilai dalam detik: minifikasi bisa menulis 0ms sebagai 0s.
  const styles = await page.evaluate(() => {
    const toSeconds = (raw: string): number => {
      const value = Number.parseFloat(raw)
      return raw.trim().endsWith('ms') ? value / 1000 : value
    }
    return {
      modeTransition: toSeconds(
        getComputedStyle(document.documentElement).getPropertyValue('--mode-transition'),
      ),
      bodyTransition: toSeconds(getComputedStyle(document.body).transitionDuration),
    }
  })
  expect(styles.modeTransition).toBe(0)
  expect(styles.bodyTransition).toBeLessThan(0.001)
})
