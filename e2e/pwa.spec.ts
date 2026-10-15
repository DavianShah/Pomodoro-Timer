import { expect, test } from '@playwright/test'

/**
 * PWA install (PRD F15): the footer text button only appears when the browser
 * offers installation and disappears once installed — no banner. Browser
 * events are dispatched manually; the real install path belongs to the browser.
 */

test('Install app button: appears when offered, disappears once installed', async ({ page }) => {
  await page.goto('/')

  const button = page.getByRole('button', { name: 'Install app' })
  await expect(button).toHaveCount(0)

  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true })
    Object.assign(event, { prompt: async () => {} })
    window.dispatchEvent(event)
  })
  await expect(button).toBeVisible()

  // One prompt from the browser; the button disappears after use and after install.
  await button.click()
  await expect(button).toHaveCount(0)

  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true })
    Object.assign(event, { prompt: async () => {} })
    window.dispatchEvent(event)
  })
  await expect(button).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
  await expect(button).toHaveCount(0)
})
