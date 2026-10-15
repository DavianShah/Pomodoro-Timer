import { expect, test, type Page } from '@playwright/test'

/**
 * Wake Lock (PRD F14): the screen stays awake while the timer runs, can be
 * turned off via the footer setting, and the choice survives a reload.
 * navigator.wakeLock is mocked so it does not depend on engine support.
 */

declare global {
  interface Window {
    /** wakeLock calls for this page (init script before the app). */
    __wakeLock: { requested: number; released: number }
  }
}

function mockWakeLock(page: Page): void {
  void page.addInitScript(() => {
    const counts = { requested: 0, released: 0 }
    window.__wakeLock = counts
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: (): Promise<{ release: () => Promise<void> }> => {
          counts.requested += 1
          return Promise.resolve({
            release: (): Promise<void> => {
              counts.released += 1
              return Promise.resolve()
            },
          })
        },
      },
    })
  })
}

const counts = (page: Page): Promise<{ requested: number; released: number }> =>
  page.evaluate(() => window.__wakeLock)

test('wake lock: requested while running, released on stop or when the setting is off', async ({
  page,
}) => {
  mockWakeLock(page)
  await page.goto('/')

  const checkbox = page.getByRole('checkbox', {
    name: 'Keep the screen awake while the timer runs',
  })
  await expect(checkbox).toBeChecked()

  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect.poll(async () => (await counts(page)).requested).toBe(1)

  // Turned off mid-run → released immediately.
  await checkbox.uncheck()
  await expect.poll(async () => (await counts(page)).released).toBeGreaterThanOrEqual(1)
  expect((await counts(page)).requested).toBe(1)

  // Turned on again while the timer is still running → requested again.
  await checkbox.check()
  await expect.poll(async () => (await counts(page)).requested).toBe(2)

  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect.poll(async () => (await counts(page)).released).toBeGreaterThanOrEqual(2)
  expect((await counts(page)).requested).toBe(2)
})

test('wake lock setting survives a reload', async ({ page }) => {
  mockWakeLock(page)
  await page.goto('/')

  const checkbox = page.getByRole('checkbox', {
    name: 'Keep the screen awake while the timer runs',
  })
  await checkbox.uncheck()
  await page.reload()

  await expect(
    page.getByRole('checkbox', { name: 'Keep the screen awake while the timer runs' }),
  ).not.toBeChecked()
})
