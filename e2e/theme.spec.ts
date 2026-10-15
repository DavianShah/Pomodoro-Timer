import { expect, test, type Page } from '@playwright/test'

declare global {
  interface Window {
    /** `data-theme` values set during the page session (flash detection). */
    __themeSeen: string[]
    /** CSP violations caught by `securitypolicyviolation`. */
    __cspViolations: string[]
    /** Marker that can only be set when inline scripts are not blocked. */
    __inlineRan?: boolean
  }
}

/** Record every data-theme value set — proof there is no flash. */
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

test('theme choice survives a reload, booted before first paint', async ({ page }) => {
  trackThemeValues(page)
  await page.goto('/')
  await page.getByRole('radio', { name: 'Dark' }).check({ force: true })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  // The first value set = dark (by theme-boot.js), not light then dark.
  const seen = await page.evaluate(() => window.__themeSeen)
  expect(seen[0]).toBe('dark')
  expect(seen).not.toContain('light')

  // theme-boot.js finishes fetching before the first-paint entry.
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
    throw new Error(`timing not measurable: ${JSON.stringify(timing)}`)
  }
  expect(timing.boot).toBeLessThan(timing.firstPaint)
})

test('system theme follows the OS preference and changes when the OS changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('mini window follows the dark theme', async ({ page }) => {
  // Force the fallback path: real PiP cannot be tested headless.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'documentPictureInPicture', {
      value: undefined,
      configurable: true,
    })
  })
  await page.goto('/')
  await page.getByRole('radio', { name: 'Dark' }).check({ force: true })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  const popupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Mini window' }).click()
  const popup = await popupPromise
  await expect(popup.locator('html')).toHaveAttribute('data-theme', 'dark')
  await popup.close()
})

test('zero CSP violations while using the app; inline scripts are blocked', async ({ page }) => {
  await page.addInitScript(() => {
    window.__cspViolations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push(`${event.violatedDirective} → ${event.blockedURI}`)
    })
  })
  await page.goto('/')

  // Exercise several render paths: stats panel, theme switch, open the hints.
  await page.getByRole('button', { name: 'Statistics', exact: true }).click()
  await expect(page.locator('#panel-statistik')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('radio', { name: 'Dark' }).check({ force: true })
  await page.getByRole('button', { name: '?', exact: true }).click()
  await expect(page.locator('#petunjuk-shortcut')).toBeVisible()

  const violations = await page.evaluate(() => window.__cspViolations)
  expect(violations).toEqual([])

  // Enforcement proof: an injected inline script is indeed blocked by the CSP meta.
  await page.evaluate(() => {
    const script = document.createElement('script')
    script.textContent = 'window.__inlineRan = true'
    document.head.appendChild(script)
  })
  expect(await page.evaluate(() => window.__inlineRan)).toBeUndefined()
  await expect.poll(() => page.evaluate(() => window.__cspViolations.length)).toBeGreaterThan(0)
})
