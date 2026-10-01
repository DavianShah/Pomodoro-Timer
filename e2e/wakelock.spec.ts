import { expect, test, type Page } from '@playwright/test'

/**
 * Wake Lock (PRD F14): layar tetap menyala selama timer berjalan, bisa
 * dimatikan lewat pengaturan footer, dan pilihannya bertahan setelah muat
 * ulang. navigator.wakeLock di-mock supaya tidak tergantung dukungan mesin.
 */

declare global {
  interface Window {
    /** Panggilan wakeLock halaman ini (init script sebelum aplikasi). */
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

test('wake lock: minta saat jalan, lepas saat berhenti atau pengaturan dimatikan', async ({
  page,
}) => {
  mockWakeLock(page)
  await page.goto('/')

  const checkbox = page.getByRole('checkbox', {
    name: 'Jaga layar tetap menyala saat timer jalan',
  })
  await expect(checkbox).toBeChecked()

  await page.getByRole('button', { name: 'Mulai', exact: true }).click()
  await expect.poll(async () => (await counts(page)).requested).toBe(1)

  // Pengaturan dimatikan di tengah jalan → langsung dilepas.
  await checkbox.uncheck()
  await expect.poll(async () => (await counts(page)).released).toBeGreaterThanOrEqual(1)
  expect((await counts(page)).requested).toBe(1)

  // Dinyalakan lagi saat timer masih jalan → diminta ulang.
  await checkbox.check()
  await expect.poll(async () => (await counts(page)).requested).toBe(2)

  await page.getByRole('button', { name: 'Jeda', exact: true }).click()
  await expect.poll(async () => (await counts(page)).released).toBeGreaterThanOrEqual(2)
  expect((await counts(page)).requested).toBe(2)
})

test('pengaturan wake lock bertahan setelah muat ulang', async ({ page }) => {
  mockWakeLock(page)
  await page.goto('/')

  const checkbox = page.getByRole('checkbox', {
    name: 'Jaga layar tetap menyala saat timer jalan',
  })
  await checkbox.uncheck()
  await page.reload()

  await expect(
    page.getByRole('checkbox', { name: 'Jaga layar tetap menyala saat timer jalan' }),
  ).not.toBeChecked()
})
