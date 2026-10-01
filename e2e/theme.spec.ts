import { expect, test, type Page } from '@playwright/test'

declare global {
  interface Window {
    /** Nilai `data-theme` yang terpasang selama sesi halaman (untuk deteksi kilatan). */
    __themeSeen: string[]
    /** Pelanggaran CSP yang tertangkap `securitypolicyviolation`. */
    __cspViolations: string[]
    /** Penanda yang hanya bisa terisi bila script inline tidak diblokir. */
    __inlineRan?: boolean
  }
}

/** Catat setiap nilai data-theme yang terpasang — bukti tidak ada kilatan. */
function trackThemeValues(page: Page): void {
  void page.addInitScript(() => {
    const seen: string[] = []
    window.__themeSeen = seen
    new MutationObserver(() => {
      const value = document.documentElement.getAttribute('data-theme')
      if (value !== null) seen.push(value)
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-theme'],
    })
  })
}

test('pilihan tema bertahan setelah reload, boot sebelum first-paint', async ({ page }) => {
  trackThemeValues(page)
  await page.goto('/')
  await page.getByRole('radio', { name: 'Gelap' }).check({ force: true })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  // Nilai pertama yang terpasang = dark (oleh theme-boot.js), bukan terang lalu gelap.
  const seen = await page.evaluate(() => window.__themeSeen)
  expect(seen[0]).toBe('dark')
  expect(seen).not.toContain('light')

  // theme-boot.js selesai diambil sebelum catatan first-paint.
  const timing = await page.evaluate(() => {
    const boot = performance
      .getEntriesByType('resource')
      .find((entry) => entry.name.includes('theme-boot.js'))
    const firstPaint = performance
      .getEntriesByType('paint')
      .find((entry) => entry.name === 'first-paint')
    return { boot: boot?.startTime ?? null, firstPaint: firstPaint?.startTime ?? null }
  })
  if (timing.boot === null || timing.firstPaint === null) {
    throw new Error(`timing tidak terukur: ${JSON.stringify(timing)}`)
  }
  expect(timing.boot).toBeLessThan(timing.firstPaint)
})

test('tema sistem mengikuti preferensi OS dan berubah saat OS berubah', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('jendela mini ikut tema gelap', async ({ page }) => {
  // Paksa jalur fallback: PiP asli tidak bisa diuji headless.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'documentPictureInPicture', {
      value: undefined,
      configurable: true,
    })
  })
  await page.goto('/')
  await page.getByRole('radio', { name: 'Gelap' }).check({ force: true })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Jendela mini' }).click()
  const popup = await popupPromise
  await expect(popup.locator('html')).toHaveAttribute('data-theme', 'dark')
  await popup.close()
})

test('nol pelanggaran CSP saat memakai aplikasi; script inline diblokir', async ({ page }) => {
  await page.addInitScript(() => {
    window.__cspViolations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push(`${event.violatedDirective} → ${event.blockedURI}`)
    })
  })
  await page.goto('/')

  // Pakai beberapa jalur render: panel statistik, ganti tema, buka petunjuk.
  await page.getByRole('button', { name: 'Statistik', exact: true }).click()
  await expect(page.locator('#panel-statistik')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('radio', { name: 'Gelap' }).check({ force: true })
  await page.getByRole('button', { name: '?', exact: true }).click()
  await expect(page.locator('#petunjuk-shortcut')).toBeVisible()

  const violations = await page.evaluate(() => window.__cspViolations)
  expect(violations).toEqual([])

  // Bukti penegakan: script inline yang disisipkan memang diblokir meta CSP.
  await page.evaluate(() => {
    const script = document.createElement('script')
    script.textContent = 'window.__inlineRan = true'
    document.head.appendChild(script)
  })
  expect(await page.evaluate(() => window.__inlineRan)).toBeUndefined()
  await expect.poll(() => page.evaluate(() => window.__cspViolations.length)).toBeGreaterThan(0)
})
