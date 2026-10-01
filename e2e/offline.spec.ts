import { expect, test } from '@playwright/test'

/**
 * PWA offline (PRD F15 + bagian 10): service worker memasang semua aset
 * saat pertama kali (termasuk font), lalu aplikasi tetap terbuka tanpa jaring.
 */

test('offline: aset prapasang lengkap dan aplikasi tetap jalan tanpa jaring', async ({
  page,
  context,
}) => {
  await page.goto('/')

  // SW aktif; reload supaya halaman dikendalikan SW (diperlukan untuk navigasi offline).
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.ready
    return registration.active !== null
  })
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  const cachedPaths = await page.evaluate(async () => {
    const names = await caches.keys()
    const lists = await Promise.all(
      names.map(async (name) => {
        const requests = await (await caches.open(name)).keys()
        return requests.map((request) => new URL(request.url).pathname)
      }),
    )
    return lists.flat()
  })

  expect(cachedPaths).toContain('/index.html')
  expect(cachedPaths).toContain('/manifest.webmanifest')
  expect(cachedPaths.some((path) => path.endsWith('.js'))).toBe(true)
  expect(cachedPaths.some((path) => path.endsWith('.css'))).toBe(true)
  // Font ikut diprecache: offline pun tipografi tetap sama.
  expect(cachedPaths.some((path) => path.endsWith('.woff2'))).toBe(true)

  await context.setOffline(true)
  await page.reload()

  await expect(page.getByRole('heading', { name: '25:00' })).toBeVisible()
  await page.getByRole('button', { name: 'Mulai', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Jeda', exact: true })).toBeVisible()

  // Font mono termuat dari cache, bukan dari jaring.
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  expect(await page.evaluate(() => document.fonts.check('16px "JetBrains Mono"'))).toBe(true)

  await context.setOffline(false)
})
