import { TOKENS } from '../src/styles/tokens.generated'
import { expect, test } from '@playwright/test'

test('timer screen shows a clock whose digits do not shift', async ({ page }) => {
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
  expect(accent).toBe(TOKENS.light.accentFocus)

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false)
})

test('no text overlaps or overflows on a narrow screen', async ({ page }) => {
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

test('the active method tab text contrasts against its own background', async ({ page }) => {
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

    const active = document
      .querySelector('[role="radiogroup"] input:checked')
      ?.closest('label')
    if (!(active instanceof HTMLElement)) throw new Error('Active method tab not found')

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

test('method change survives a reload, without a page reload', async ({ page }) => {
  await page.goto('/')

  const flowtime = page.getByRole('radio', { name: /Flowtime/ })
  await flowtime.check({ force: true })
  await expect(flowtime).toBeChecked()
  expect(page.url()).toContain('/')

  await page.reload()
  await expect(page.getByRole('radio', { name: /Flowtime/ })).toBeChecked()
})

test('dark theme choice is set on the html element', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('radio', { name: 'Dark' }).check({ force: true })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('radio', { name: 'Light' }).check({ force: true })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('tab to the timer controls via keyboard', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')

  const skip = page.getByRole('link', { name: 'Skip to timer controls' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#kontrol-timer')).toBeFocused()
})

test('timer runs and stops when paused', async ({ page }) => {
  await page.goto('/')
  const clock = page.locator('h1')
  await expect(clock).toHaveText('25:00')

  const flowtime = page.getByRole('radio', { name: /Flowtime/ })
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  // While running, the method cannot be changed (PRD F3).
  await expect(flowtime).toBeDisabled()
  await expect(clock).not.toHaveText('25:00')
  const frozen = await clock.textContent()

  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.waitForTimeout(1_500)
  await expect(clock).toHaveText(frozen ?? '')
  await expect(flowtime).toBeEnabled()
})

test('Flowtime counts up, Finish sets up a proportional break', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: /Flowtime/ }).check({ force: true })

  const clock = page.locator('h1')
  await expect(clock).toHaveText('00:00')

  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(clock).not.toHaveText('00:00')
  await expect(page.getByRole('button', { name: 'Finish', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  // Focus <25 minutes → 5-minute break (PRD section 3).
  await expect(page.getByRole('button', { name: 'Start break' })).toBeVisible()
  await expect(clock).toHaveText('05:00')
  await expect(page.getByText('Break', { exact: true })).toBeVisible()

  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
  )
  expect(accent).toBe(TOKENS.light.accentBreak)
})

test('reload while running still resumes the remaining time', async ({ page }) => {
  await page.goto('/')
  const clock = page.locator('h1')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.waitForTimeout(1_200)
  await expect(clock).not.toHaveText('25:00')

  await page.reload()
  // Recovered: still running, time keeps counting down, not back to 25:00.
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  await expect(clock).not.toHaveText('25:00')
  const resumed = await clock.textContent()
  await page.waitForTimeout(1_200)
  await expect(clock).not.toHaveText(resumed ?? '')
})

test('shortcuts: space start/pause, digits change method, R reset, S skip', async ({ page }) => {
  await page.goto('/')
  const clock = page.locator('h1')
  // Shortcut listeners are attached in a React effect after the first paint.
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  await page.waitForTimeout(200)

  // Space from body: start, then pause (no scroll, one action per press).
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()

  // Digits while idle: change method; a method without a cycle has no session row.
  await page.keyboard.press('3')
  await expect(page.getByRole('radio', { name: /Ultradian/ })).toBeChecked()
  await expect(page.getByText('Focus', { exact: true })).toBeVisible()
  await expect(page.getByText(/Session \d/)).toHaveCount(0)

  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  await page.keyboard.press('r')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  await expect(clock).toHaveText('90:00')

  await page.keyboard.press('1')
  await page.keyboard.press('s')
  await expect(page.getByText('Break · Session 1 of 4', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start break' })).toBeVisible()

  // On-screen shortcut hints.
  await page.getByRole('button', { name: '?' }).click()
  await expect(page.getByText('Space · start/pause')).toBeVisible()

  // Space while focus is on the main action button: one action via the
  // shortcut (native activation prevented), no double.
  await page.getByRole('button', { name: 'Start break' }).click()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Start break' })).toBeVisible()
})

test('Space without blur after clicking Start: pauses exactly once, not twice', async ({ page }) => {
  await page.goto('/')
  const clock = page.locator('h1')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()

  // Focus stays on the main button now labeled Pause — without blur.
  await page.waitForTimeout(1_100)
  await page.keyboard.press('Space')

  // Back to paused, not "pause then start again" via native activation.
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0)
  const paused = await clock.textContent()
  await page.waitForTimeout(1_300)
  await expect(clock).toHaveText(paused ?? '')
})

test('tab title: app name while idle, remaining time while running', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Ritme')

  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page).toHaveTitle(/^\d+:\d\d · Focus$/)

  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(page).toHaveTitle('Ritme')
})

test('mini window popup fallback: synced, actions reach the main page, reset on close', async ({
  page,
}) => {
  // Force the fallback path: real PiP cannot be tested headless (checklist in README).
  await page.addInitScript(() => {
    Object.defineProperty(window, 'documentPictureInPicture', {
      value: undefined,
      configurable: true,
    })
  })
  await page.goto('/')

  const miniButton = page.getByRole('button', { name: 'Mini window' })
  await expect(miniButton).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: 'Start', exact: true }).click()

  const popupPromise = page.waitForEvent('popup')
  await miniButton.click()
  const popup = await popupPromise
  await expect(miniButton).toHaveAttribute('aria-pressed', 'true')

  // Styles load along: the stylesheet is cloned, digits use the right mono font.
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

  // Same time (max 1 second apart because they are read separately).
  const toSeconds = (text: string | null): number => {
    const [minutes, seconds] = (text ?? '').split(':').map(Number)
    return (minutes ?? 0) * 60 + (seconds ?? 0)
  }
  const mainClock = await page.locator('h1').textContent()
  const popupClock = await popup.locator('.angka').textContent()
  expect(Math.abs(toSeconds(popupClock) - toSeconds(mainClock))).toBeLessThanOrEqual(1)

  // A popup button pauses the main page timer.
  await popup.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()

  // Space from the mini window body: starts again via the mini listeners.
  await popup.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await popup.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()

  // R in the mini window: resets the main page to 25:00.
  await popup.keyboard.press('r')
  await expect(page.locator('h1')).toHaveText('25:00')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()

  // Closed via X → the main page "open" state resets.
  await popup.close()
  await expect(miniButton).toHaveAttribute('aria-pressed', 'false')

  // Open again after closing.
  const secondPopup = page.waitForEvent('popup')
  await miniButton.click()
  expect(await secondPopup).toBeTruthy()
})

test('popup blocked: role=status message on the main screen, not a silent failure', async ({
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

  await page.getByRole('button', { name: 'Mini window' }).click()
  await expect(page.getByText('Popup blocked — mini window did not open')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mini window' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})
