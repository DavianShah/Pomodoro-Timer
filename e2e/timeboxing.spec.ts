import { expect, test, type Page } from '@playwright/test'

/**
 * Time Boxing (F16) through the real paths: blocks via form and via drag,
 * starting inside a block, block end overrun → choice row, Extend/Shift,
 * persistence across reloads. No page.clock: the tick clock is in a separate
 * Web Worker — page clock manipulation cannot reach it; crossings are
 * produced with a near endTime (live) or a past endTime (recovery).
 */

interface StoredBlock {
  id: string
  date: string
  startMin: number
  endMin: number
  status: string
}

const pad = (value: number): string => String(value).padStart(2, '0')
const hhmm = (minute: number): string => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`

/** Current minutes according to the device clock (local timezone). */
async function nowMinute(page: Page): Promise<number> {
  return page.evaluate(() => {
    const date = new Date()
    return date.getHours() * 60 + date.getMinutes()
  })
}

/** All block rows straight from the app IndexedDB — no test hooks. */
async function readBlocks(page: Page): Promise<StoredBlock[]> {
  return page.evaluate<StoredBlock[]>(
    () =>
      new Promise<StoredBlock[]>((resolve, reject) => {
        const request = indexedDB.open('ritme')
        request.onsuccess = () => {
          const db = request.result
          const getAll = db.transaction('blocks', 'readonly').objectStore('blocks').getAll()
          getAll.onsuccess = () => {
            const rows = getAll.result as StoredBlock[]
            db.close()
            resolve(rows)
          }
          getAll.onerror = () => {
            db.close()
            reject(getAll.error ?? new Error('failed to read blocks'))
          }
        }
        request.onerror = () => reject(request.error ?? new Error('failed to open db'))
      }),
  )
}

/** Read one value from the raw timer state in localStorage. */
async function timerValue(page: Page, key: string): Promise<unknown> {
  return page.evaluate((name) => {
    const raw = localStorage.getItem('ritme.v1.timer')
    if (raw === null) return null
    const parsed = JSON.parse(raw) as { value: Record<string, unknown> }
    return parsed.value[name]
  }, key)
}

/**
 * Set the block row (absolute times) + raw timer: running with endTime =
 * the end of a block that has ALREADY passed → a reload shows the recovered
 * choice row.
 */
async function craftPrompt(
  page: Page,
  block: { id: string; startMin: number; endMin: number },
  extra?: { id: string; startMin: number; endMin: number },
): Promise<void> {
  await page.evaluate(
    ({ first, second }) => {
      const now = new Date()
      const padLocal = (value: number): string => String(value).padStart(2, '0')
      const date = `${now.getFullYear()}-${padLocal(now.getMonth() + 1)}-${padLocal(now.getDate())}`
      const endMs = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        first.endMin,
      ).getTime()
      localStorage.setItem(
        'ritme.v1.timer',
        JSON.stringify({
          v: 1,
          value: {
            method: 'timeboxing',
            phase: 'focus',
            running: true,
            cycleIndex: 1,
            endTime: endMs,
            remainingMs: null,
            elapsedMs: 0,
            startedAt: endMs - 10 * 60_000,
          },
        }),
      )
      const apply = (row: StoredBlock, times: { startMin: number; endMin: number }): void => {
        row.startMin = times.startMin
        row.endMin = times.endMin
        row.status = 'planned'
        row.date = date
      }
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('ritme')
        request.onsuccess = () => {
          const db = request.result
          const write = db.transaction('blocks', 'readwrite')
          const store = write.objectStore('blocks')
          const getFirst = store.get(first.id)
          getFirst.onsuccess = () => {
            const row = getFirst.result as StoredBlock | undefined
            if (row === undefined) return
            apply(row, first)
            store.put(row)
            if (second !== undefined) {
              const getSecond = store.get(second.id)
              getSecond.onsuccess = () => {
                const other = getSecond.result as StoredBlock | undefined
                if (other === undefined) return
                apply(other, second)
                store.put(other)
              }
            }
          }
          write.oncomplete = () => {
            db.close()
            resolve()
          }
          write.onerror = () => {
            db.close()
            reject(write.error ?? new Error('failed to write blocks'))
          }
        }
        request.onerror = () => reject(request.error ?? new Error('failed to open db'))
      })
    },
    { first: block, second: extra },
  )
}

/** Raw timer: a live end crossing delayMs from now (no block). */
async function craftLiveCrossing(page: Page, delayMs: number): Promise<void> {
  await page.evaluate((delay) => {
    const now = Date.now()
    localStorage.setItem(
      'ritme.v1.timer',
      JSON.stringify({
        v: 1,
        value: {
          method: 'timeboxing',
          phase: 'focus',
          running: true,
          cycleIndex: 1,
          endTime: now + delay,
          remainingMs: null,
          elapsedMs: 0,
          startedAt: now - 5 * 60_000,
        },
      }),
    )
  }, delayMs)
}

const promptRow = (page: Page) =>
  page.locator('main [role="status"]').filter({ hasText: 'finished' })

test('block via form: start inside a block, block end overrun → choice row', async ({ page }) => {
  await page.goto('/')
  const method = page.getByRole('radio', { name: /Time boxing/ })
  await method.check({ force: true })
  await expect(method).toBeChecked()

  // One block COVERING now (≥15 min) — status range 'Focus ·'. End clamped to
  // 23:59 (a time input cannot hold 24:00), so late in the day the block
  // stretches backwards instead of forward.
  const minute = await nowMinute(page)
  const end = Math.min(minute + 15, 1439)
  const start = Math.max(0, Math.min(minute - 1, end - 30))

  await page.getByRole('button', { name: 'Schedule', exact: true }).click()
  const panel = page.locator('#panel-jadwal')
  await expect(panel).toBeVisible()
  const addBlock = async (from: number, to: number): Promise<void> => {
    await page.getByRole('button', { name: 'Add block', exact: true }).click()
    await page.locator('#blok-mulai').fill(hhmm(from))
    await page.locator('#blok-selesai').fill(hhmm(to))
    await page.getByRole('button', { name: 'Save', exact: true }).click()
  }
  await addBlock(start, end)
  await expect.poll(async () => (await readBlocks(page)).length).toBeGreaterThanOrEqual(1)
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(panel).toBeHidden()

  const status = page.locator('main [aria-live="polite"]')
  await expect(status).toContainText('Focus ·')
  await expect(page.locator('main h1')).toHaveText(/^\d{1,2}:\d{2}$/)

  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Finish', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0)
  await expect
    .poll(async () => (await readBlocks(page)).some((b) => b.status === 'running'))
    .toBe(true)

  // LIVE crossing: endTime 2.5 seconds away → alarm/record/choices appear by
  // themselves as the tick passes. No matching block → only the Finish button.
  await craftLiveCrossing(page, 2500)
  await page.reload()
  const row = promptRow(page)
  await expect(row).toBeVisible({ timeout: 10_000 })
  await expect(status).toHaveText('Block finished')
  await expect(row.getByRole('button', { name: 'Finish', exact: true })).toBeVisible()
  await expect(row.getByRole('button', { name: 'Extend 15 min', exact: true })).toHaveCount(0)

  await row.getByRole('button', { name: 'Finish', exact: true }).click()
  await expect(row).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  await expect(status).toContainText('Focus ·')
})

test('Space without blur after Start: a running block does not end, no session recorded', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('radio', { name: /Time boxing/ }).check({ force: true })
  await expect(page.getByRole('radio', { name: /Time boxing/ })).toBeChecked()

  // One block covering the current minute → Start lands inside the block.
  const minute = await nowMinute(page)
  const end = Math.min(minute + 15, 1439)
  const start = Math.max(0, Math.min(minute - 1, end - 30))

  await page.getByRole('button', { name: 'Schedule', exact: true }).click()
  const panel = page.locator('#panel-jadwal')
  await expect(panel).toBeVisible()
  await page.getByRole('button', { name: 'Add block', exact: true }).click()
  await page.locator('#blok-mulai').fill(hhmm(start))
  await page.locator('#blok-selesai').fill(hhmm(end))
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(async () => (await readBlocks(page)).length).toBeGreaterThanOrEqual(1)
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(panel).toBeHidden()

  const clock = page.locator('main h1')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  // Focus stays on the main button now labeled Finish — without blur.
  await expect(page.getByRole('button', { name: 'Finish', exact: true }).first()).toBeVisible()
  await page.waitForTimeout(1_200)
  await page.keyboard.press('Space')

  // The block keeps running: no choice row, the clock advances, no "Block finished".
  await expect(promptRow(page)).toHaveCount(0)
  await expect(page.locator('main [aria-live="polite"]')).not.toHaveText('Block finished')
  const after = await clock.textContent()
  await page.waitForTimeout(1_200)
  await expect(clock).not.toHaveText(after ?? '')

  // No session recorded: Space did not activate the Finish button.
  await page.getByRole('button', { name: 'Statistics', exact: true }).click()
  await expect(page.locator('#panel-statistik')).toContainText('No focus sessions yet')
})

test('block via drag: Extend 15, Shift after overrun, persistence across reloads', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('radio', { name: /Time boxing/ }).check({ force: true })
  await page.getByRole('button', { name: 'Schedule', exact: true }).click()
  const panel = page.locator('#panel-jadwal')
  await expect(panel).toBeVisible()

  // Vertical drag 02:00 → 03:00 (minutes on the y-axis; the block is created on release).
  const timeline = page.locator('#timeline-blok')
  await timeline.evaluate((el) => el.scrollIntoView({ block: 'start' }))
  const box = await timeline.boundingBox()
  if (box === null) throw new Error('timeline not visible')
  const yAt = (minute: number): number => box.y + (minute / 1440) * box.height
  const x = box.x + 200
  await page.mouse.move(x, yAt(120))
  await page.mouse.down()
  await page.mouse.move(x, yAt(180), { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => (await readBlocks(page)).length).toBe(1)

  // A second block via form, adjacent after the drag block.
  await page.getByRole('button', { name: 'Add block', exact: true }).click()
  await page.locator('#blok-mulai').fill('03:00')
  await page.locator('#blok-selesai').fill('03:15')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(async () => (await readBlocks(page)).length).toBe(2)
  await panel.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(panel).toBeHidden()

  const initial = await readBlocks(page)
  const dragBlock = initial.find((b) => b.startMin === 120)
  const formBlock = initial.find((b) => b.startMin === 180)
  if (dragBlock === undefined) throw new Error('drag block missing')
  if (formBlock === undefined) throw new Error('form block missing')
  expect(dragBlock.endMin).toBe(180)
  expect(formBlock.endMin).toBe(195)

  // Recover with endTime = the block end already passed → the full choice row.
  const minute1 = await nowMinute(page)
  await craftPrompt(page, {
    id: dragBlock.id,
    startMin: Math.max(0, minute1 - 60),
    endMin: minute1,
  })
  await page.reload()
  const row = promptRow(page)
  await expect(row).toBeVisible({ timeout: 10_000 })
  await expect(row.getByRole('button', { name: 'Extend 15 min', exact: true })).toBeVisible()
  await expect(
    row.getByRole('button', { name: 'Shift following blocks', exact: true }),
  ).toBeVisible()

  // Extend 15: the block is extended +15 minutes, the session keeps running.
  // Late in the day the end clamps at midnight (1440).
  await row.getByRole('button', { name: 'Extend 15 min', exact: true }).click()
  await expect(row).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Finish', exact: true }).first()).toBeVisible()
  await expect
    .poll(async () => (await readBlocks(page)).find((b) => b.id === dragBlock.id)?.endMin)
    .toBe(Math.min(minute1 + 15, 1440))

  // Stop the session then recover the choice again; Shift uses the overrun (> 0).
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  // Session recording (Finish) writes the block status 'done' asynchronously —
  // wait for it before rewriting the row, so there is no race.
  await expect
    .poll(async () => (await readBlocks(page)).find((b) => b.id === dragBlock.id)?.status)
    .toBe('done')
  const minute2 = await nowMinute(page)
  await craftPrompt(
    page,
    { id: dragBlock.id, startMin: Math.max(0, minute2 - 60), endMin: minute2 },
    // Clamped to 23:59 — shiftFollowing cannot move blocks past day end.
    { id: formBlock.id, startMin: minute2 + 1, endMin: Math.min(minute2 + 16, 1439) },
  )
  await expect
    .poll(async () => (await readBlocks(page)).find((b) => b.id === dragBlock.id)?.endMin)
    .toBe(minute2)
  await expect
    .poll(async () => (await readBlocks(page)).find((b) => b.id === formBlock.id)?.startMin)
    .toBe(minute2 + 1)
  await page.reload()
  const row2 = promptRow(page)
  await expect(row2).toBeVisible({ timeout: 10_000 })
  await row2.getByRole('button', { name: 'Shift following blocks', exact: true }).click()
  await expect(row2).toHaveCount(0)
  const shifted = (await readBlocks(page)).find((b) => b.id === formBlock.id)
  if (shifted === undefined) throw new Error('next block missing')
  expect(shifted.startMin).toBeGreaterThan(minute2 + 1)
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  await expect.poll(async () => timerValue(page, 'endTime')).toBeNull()

  // Persist: endTime null survives a reload; no choice row is left behind.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  await expect(promptRow(page)).toHaveCount(0)
  await expect.poll(async () => timerValue(page, 'endTime')).toBeNull()
})

test('Space: starts a block while idle, does not end a running block', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: /Time boxing/ }).check({ force: true })

  // One block covering now, via the form.
  const minute = await nowMinute(page)
  const end = Math.min(minute + 15, 1439)
  const start = Math.max(0, Math.min(minute - 1, end - 30))
  await page.getByRole('button', { name: 'Schedule', exact: true }).click()
  const panel = page.locator('#panel-jadwal')
  await page.getByRole('button', { name: 'Add block', exact: true }).click()
  await page.locator('#blok-mulai').fill(hhmm(start))
  await page.locator('#blok-selesai').fill(hhmm(end))
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect.poll(async () => (await readBlocks(page)).length).toBeGreaterThanOrEqual(1)
  await panel.getByRole('button', { name: 'Close', exact: true }).click()

  // Space is pressed from the body: native button behavior, not the shortcut.
  const blur = async (): Promise<void> => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  }
  const status = page.locator('main [aria-live="polite"]')
  const running = page.getByRole('button', { name: 'Finish', exact: true })
  const idle = page.getByRole('button', { name: 'Start', exact: true })

  await blur()
  await page.keyboard.press('Space')
  await expect(running).toBeVisible()
  await expect(status).toContainText('Focus ·')

  // Space while running: state unchanged — the block is not ended.
  await blur()
  const before = await status.textContent()
  await page.keyboard.press('Space')
  await page.waitForTimeout(600)
  await expect(running).toBeVisible()
  await expect(idle).toHaveCount(0)
  await expect(status).toHaveText(before ?? '')
  await expect(promptRow(page)).toHaveCount(0)
  expect((await readBlocks(page)).some((block) => block.status === 'running')).toBe(true)

  // S remains the only block-ending shortcut.
  await page.keyboard.press('s')
  await expect(idle).toBeVisible()
})
