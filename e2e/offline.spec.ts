import { expect, test } from '@playwright/test'

/**
 * PWA offline (PRD F15 + section 10): the service worker installs all assets
 * on first load (fonts included), then the app still opens without a network.
 */

test('offline: precache assets are complete and the app keeps working without a network', async ({
  page,
  context,
}) => {
  await page.goto('/')

  // SW active; reload so the page is controlled by the SW (needed for offline navigation).
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
  // Fonts are precached too: typography stays the same offline.
  expect(cachedPaths.some((path) => path.endsWith('.woff2'))).toBe(true)

  await context.setOffline(true)
  await page.reload()

  await expect(page.getByRole('heading', { name: '25:00' })).toBeVisible()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()

  // The mono font loads from cache, not from the network.
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  expect(await page.evaluate(() => document.fonts.check('16px "JetBrains Mono"'))).toBe(true)

  await context.setOffline(false)
})
