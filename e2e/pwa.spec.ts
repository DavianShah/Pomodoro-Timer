import { expect, test } from '@playwright/test'

/**
 * Pemasangan PWA (PRD F15): tombol teks di footer hanya muncul saat browser
 * menawarkan pemasangan dan hilang setelah terpasang — tanpa banner.
 * Event browser dipancarkan manual; jalur pemasangan aslinya milik browser.
 */

test('tombol Pasang aplikasi: muncul saat ditawarkan, hilang setelah terpasang', async ({
  page,
}) => {
  await page.goto('/')

  const button = page.getByRole('button', { name: 'Pasang aplikasi' })
  await expect(button).toHaveCount(0)

  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true })
    Object.assign(event, { prompt: async () => {} })
    window.dispatchEvent(event)
  })
  await expect(button).toBeVisible()

  // Satu prompt dari browser; tombol hilang setelah dipakai maupun setelah terpasang.
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
