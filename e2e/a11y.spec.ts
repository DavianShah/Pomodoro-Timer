import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Accessibility audit (PRD F10 + M5b): axe-core WCAG 2.1 A/AA in both themes,
 * the main screen paths, panels, and the mini window; plus behavior axe does
 * not catch (keyboard focus ring, aria-live without per-second announcements,
 * reduced motion).
 *
 * Failing: serious/critical violations. The rest is logged.
 */

const THEMES = ['Light', 'Dark'] as const

async function setTheme(page: Page, name: (typeof THEMES)[number]): Promise<void> {
  await page.getByRole('radio', { name }).check({ force: true })
}

/** Wait for the background transition (300ms) to finish: axe reads colors mid-way. */
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
    // Below threshold (moderate/minor): recorded in report annotations, does not fail.
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
    `axe serious/critical in ${label}`,
  ).toEqual([])
}

interface Screen {
  name: string
  open: (page: Page) => Promise<void>
  close: (page: Page) => Promise<void>
}

/** Panel: open via the button, close via Escape — wait until it really toggles. */
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
  name: 'shortcut help',
  open: async (page) => {
    await page.getByRole('button', { name: '?', exact: true }).click()
    await expect(page.locator('#petunjuk-shortcut')).toBeVisible()
  },
  // Help is not a panel: it closes via its button, not Escape.
  close: async (page) => {
    await page.getByRole('button', { name: '?', exact: true }).click()
    await expect(page.locator('#petunjuk-shortcut')).toBeHidden()
  },
}

const SCREENS: Screen[] = [
  { name: 'timer screen', open: async () => {}, close: async () => {} },
  panel('Task'),
  panel('Statistics'),
  panel('Schedule'),
  panel('Settings'),
  help,
]

for (const screen of SCREENS) {
  test(`axe: ${screen.name} — light and dark`, async ({ page }) => {
    await page.goto('/')

    for (const theme of THEMES) {
      await setTheme(page, theme)
      await screen.open(page)
      await scan(page, `${screen.name} / ${theme}`)
      await screen.close(page)
    }
  })
}

test('axe: mini window — light and dark', async ({ page }) => {
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
    await page.getByRole('button', { name: 'Mini window' }).click()
    const popup = await popupPromise
    await expect(popup.locator('.angka')).toBeVisible()
    await scan(popup, `mini window / ${theme}`)

    await popup.close()
    await expect(page.getByRole('button', { name: 'Mini window' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  }
})

test('keyboard: radio options draw a visible focus ring', async ({ page }) => {
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
  expect(reached, 'radio option not reachable via Tab').toBe(true)

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

test('keyboard: the main Start action is reachable via Tab', async ({ page }) => {
  await page.goto('/')

  let reached = false
  for (let step = 0; step < 30 && !reached; step += 1) {
    await page.keyboard.press('Tab')
    reached = await page.evaluate(
      () =>
        document.activeElement instanceof HTMLButtonElement &&
        document.activeElement.textContent?.trim() === 'Start',
    )
  }
  expect(reached, 'Start button not reachable via Tab').toBe(true)
})

test('aria-live: announcements only on status changes, not every second', async ({ page }) => {
  await page.goto('/')
  const status = page.locator('main [aria-live="polite"]')
  await expect(status).toBeVisible()

  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const running = await status.textContent()

  // Per-second remaining time must not enter the live region.
  await page.waitForTimeout(2_500)
  expect(await status.textContent()).toBe(running)

  // Phase changes are still announced.
  await page.keyboard.press('s')
  await expect(status).not.toHaveText(running ?? 'zzz')
})

test('reduced motion: transitions are disabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  // Numbers are read in seconds: minification may write 0ms as 0s.
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
