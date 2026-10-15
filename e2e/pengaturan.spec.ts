import { readFile } from 'node:fs/promises'
import { expect, test, type Download, type Page } from '@playwright/test'

async function readDownload(download: Download): Promise<string> {
  const path = await download.path()
  if (path === null) throw new Error('download without a file')
  return readFile(path, 'utf8')
}

async function clearDataTables(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('ritme')
        request.onerror = () => reject(request.error ?? new Error('failed to open db'))
        request.onsuccess = () => {
          const db = request.result
          const names = ['sessions', 'tasks', 'blocks', 'presets']
          const tx = db.transaction(names, 'readwrite')
          for (const name of names) tx.objectStore(name).clear()
          tx.onerror = () => {
            db.close()
            reject(tx.error ?? new Error('failed to clear rows'))
          }
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
        }
      }),
  )
}

/**
 * Duration settings (PRD F3): per-method overrides, out-of-range values
 * rejected (role=status, no silent rounding), Reset to defaults, and Custom
 * presets that survive start + reload.
 */

test('durations edited while idle, out-of-range rejected, reset to defaults', async ({ page }) => {
  await page.goto('/')
  const clock = page.locator('main h1')
  await expect(clock).toHaveText('25:00')

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const panel = page.locator('#panel-pengaturan')
  await expect(panel).toBeVisible()

  const focus = panel.locator('#durasi-pomodoro-focus')
  await focus.fill('30')
  await expect(clock).toHaveText('30:00')

  // Out of range: reject + message, the stored value is left unchanged.
  await focus.fill('200')
  await expect(panel.getByRole('status')).toHaveText('Focus must be 1–180 min')
  await expect(clock).toHaveText('30:00')

  await focus.fill('25')
  await expect(panel.getByRole('status')).toHaveText('')
  await expect(clock).toHaveText('25:00')

  await panel.getByRole('button', { name: 'Reset to defaults' }).click()
  await expect(panel.getByRole('status')).toHaveText('Durations reset to defaults')
  await expect(clock).toHaveText('25:00')
})

test('Custom preset: create, start, reload — duration and method stay', async ({ page }) => {
  await page.goto('/')
  const clock = page.locator('main h1')

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const panel = page.locator('#panel-pengaturan')
  await panel.locator('#durasi-custom-focus').fill('40')
  await panel.locator('#durasi-custom-break').fill('8')

  await panel.locator('#preset-nama').fill('Recovery')
  await panel.getByRole('button', { name: 'Save preset' }).click()
  const row = panel.getByRole('listitem').filter({ hasText: 'Recovery' })
  await expect(row).toBeVisible()

  await row.getByRole('button', { name: 'Use' }).click()
  await expect(page.getByRole('radio', { name: /Custom/ })).toBeChecked()
  await expect(clock).toHaveText('40:00')

  await panel.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('radio', { name: /Custom/ })).toBeChecked()
  // Running: the remaining time is slightly below 40 minutes.
  await expect(clock).toHaveText(/^(40:00|39:[0-5]\d)$/)
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
})

test('sound: alarm, ambient, volume, and notification choices survive a reload', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const panel = page.locator('#panel-pengaturan')

  await panel.locator('#suara-alarm').selectOption('soft')
  await panel.locator('#suara-ambient').selectOption('rain')
  await panel.locator('#suara-volume').press('ArrowRight')
  await panel.getByRole('checkbox', { name: 'Alarm when a session finishes' }).uncheck()
  await panel.getByRole('checkbox', { name: 'Browser notifications' }).uncheck()

  await page.reload()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const reopened = page.locator('#panel-pengaturan')

  await expect(reopened.locator('#suara-alarm')).toHaveValue('soft')
  await expect(reopened.locator('#suara-alarm')).toBeDisabled()
  await expect(reopened.locator('#suara-ambient')).toHaveValue('rain')
  await expect(reopened.locator('#suara-volume')).toHaveValue('45')
  await expect(
    reopened.getByRole('checkbox', { name: 'Alarm when a session finishes' }),
  ).not.toBeChecked()
  await expect(reopened.getByRole('checkbox', { name: 'Browser notifications' })).not.toBeChecked()
})

test('data: export CSV and backup, then restore into an empty database', async ({ page }) => {
  await page.goto('/')

  // A real session via Flowtime: start, wait a moment, then Finish.
  await page.getByRole('radio', { name: /Flowtime/ }).check({ force: true })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.waitForTimeout(1100)
  await page.getByRole('button', { name: 'Finish', exact: true }).click()

  await page.getByRole('button', { name: 'Task', exact: true }).click()
  const taskPanel = page.locator('#panel-task')
  await taskPanel.getByPlaceholder('Task name').fill('Report')
  await taskPanel.getByPlaceholder('Task name').press('Enter')
  await expect(taskPanel.getByText('Report', { exact: true })).toBeVisible()
  await taskPanel.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const panel = page.locator('#panel-pengaturan')

  const csvDownload = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Export sessions (CSV)' }).click()
  const csvText = await readDownload(await csvDownload)
  expect(csvText).toContain('Flowtime,focus')
  expect(csvText.trimEnd().split('\n')[1]).toMatch(/,yes$/)

  const backupDownload = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Export backup' }).click()
  const backupText = await readDownload(await backupDownload)
  expect(JSON.parse(backupText)).toMatchObject({ app: 'ritme', sessions: [{ method: 'flowtime' }] })

  // Empty the data tables, reload, then restore from the backup file.
  await clearDataTables(page)
  await page.reload()
  await expect(page.getByRole('button', { name: /^Start/ })).toBeVisible()

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const reopened = page.locator('#panel-pengaturan')
  await reopened.locator('input[type="file"]').setInputFiles({
    name: 'ritme-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupText),
  })
  await expect(reopened.getByRole('status')).toContainText('Restored: 1 sessions, 1 tasks')

  await reopened.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Statistics', exact: true }).click()
  await expect(page.locator('#panel-statistik').getByText('1 completed sessions')).toBeVisible()
})
