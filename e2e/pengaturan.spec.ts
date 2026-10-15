import { readFile } from 'node:fs/promises'
import { expect, test, type Download, type Page } from '@playwright/test'

async function readDownload(download: Download): Promise<string> {
  const path = await download.path()
  if (path === null) throw new Error('unduhan tanpa berkas')
  return readFile(path, 'utf8')
}

async function clearDataTables(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('ritme')
        request.onerror = () => reject(request.error ?? new Error('gagal membuka db'))
        request.onsuccess = () => {
          const db = request.result
          const names = ['sessions', 'tasks', 'blocks', 'presets']
          const tx = db.transaction(names, 'readwrite')
          for (const name of names) tx.objectStore(name).clear()
          tx.onerror = () => {
            db.close()
            reject(tx.error ?? new Error('gagal menghapus baris'))
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
 * Pengaturan durasi (PRD F3): override per metode, validasi tolak di luar
 * rentang (role=status, tanpa pembulatan diam-diam), Kembalikan bawaan,
 * dan preset Custom yang bertahan lewat mulai + muat ulang.
 */

test('durasi diedit saat idle, di luar rentang ditolak, kembalikan bawaan', async ({ page }) => {
  await page.goto('/')
  const clock = page.locator('main h1')
  await expect(clock).toHaveText('25:00')

  await page.getByRole('button', { name: 'Pengaturan', exact: true }).click()
  const panel = page.locator('#panel-pengaturan')
  await expect(panel).toBeVisible()

  const focus = panel.locator('#durasi-pomodoro-focus')
  await focus.fill('30')
  await expect(clock).toHaveText('30:00')

  // Di luar rentang: tolak + pesan, nilai tersimpan tidak ikut berubah.
  await focus.fill('200')
  await expect(panel.getByRole('status')).toHaveText('Fokus harus 1–180 menit')
  await expect(clock).toHaveText('30:00')

  await focus.fill('25')
  await expect(panel.getByRole('status')).toHaveText('')
  await expect(clock).toHaveText('25:00')

  await panel.getByRole('button', { name: 'Kembalikan bawaan' }).click()
  await expect(panel.getByRole('status')).toHaveText('Durasi kembali ke bawaan')
  await expect(clock).toHaveText('25:00')
})

test('preset Custom: buat, mulai, muat ulang — durasi dan metode tetap', async ({ page }) => {
  await page.goto('/')
  const clock = page.locator('main h1')

  await page.getByRole('button', { name: 'Pengaturan', exact: true }).click()
  const panel = page.locator('#panel-pengaturan')
  await panel.locator('#durasi-custom-focus').fill('40')
  await panel.locator('#durasi-custom-break').fill('8')

  await panel.locator('#preset-nama').fill('Pulih')
  await panel.getByRole('button', { name: 'Simpan preset' }).click()
  const row = panel.getByRole('listitem').filter({ hasText: 'Pulih' })
  await expect(row).toBeVisible()

  await row.getByRole('button', { name: 'Pakai' }).click()
  await expect(page.getByRole('button', { name: /Custom/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(clock).toHaveText('40:00')

  await panel.getByRole('button', { name: 'Tutup' }).click()
  await page.getByRole('button', { name: 'Mulai', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Jeda', exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: /Custom/ })).toHaveAttribute('aria-pressed', 'true')
  // Berjalan: sisa sedikit berkurang dari 40 menit.
  await expect(clock).toHaveText(/^(40:00|39:[0-5]\d)$/)
  await expect(page.getByRole('button', { name: 'Jeda', exact: true })).toBeVisible()
})

test('suara: pilihan alarm, ambient, volume, dan notifikasi bertahan setelah muat ulang', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Pengaturan', exact: true }).click()
  const panel = page.locator('#panel-pengaturan')

  await panel.locator('#suara-alarm').selectOption('lembut')
  await panel.locator('#suara-ambient').selectOption('hujan')
  await panel.locator('#suara-volume').press('ArrowRight')
  await panel.getByRole('checkbox', { name: 'Alarm saat sesi selesai' }).uncheck()
  await panel.getByRole('checkbox', { name: 'Notifikasi browser' }).uncheck()

  await page.reload()
  await page.getByRole('button', { name: 'Pengaturan', exact: true }).click()
  const reopened = page.locator('#panel-pengaturan')

  await expect(reopened.locator('#suara-alarm')).toHaveValue('lembut')
  await expect(reopened.locator('#suara-alarm')).toBeDisabled()
  await expect(reopened.locator('#suara-ambient')).toHaveValue('hujan')
  await expect(reopened.locator('#suara-volume')).toHaveValue('45')
  await expect(reopened.getByRole('checkbox', { name: 'Alarm saat sesi selesai' })).not.toBeChecked()
  await expect(reopened.getByRole('checkbox', { name: 'Notifikasi browser' })).not.toBeChecked()
})

test('data: ekspor CSV dan backup, lalu pulihkan ke database kosong', async ({ page }) => {
  await page.goto('/')

  // Sesi nyata lewat Flowtime: mulai, tunggu sedikit, lalu Selesai.
  await page.getByRole('button', { name: /Flowtime/ }).click()
  await page.getByRole('button', { name: 'Mulai', exact: true }).click()
  await page.waitForTimeout(1100)
  await page.getByRole('button', { name: 'Selesai', exact: true }).click()

  await page.getByRole('button', { name: 'Task', exact: true }).click()
  const taskPanel = page.locator('#panel-task')
  await taskPanel.getByPlaceholder('Nama task').fill('Laporan')
  await taskPanel.getByPlaceholder('Nama task').press('Enter')
  await expect(taskPanel.getByText('Laporan', { exact: true })).toBeVisible()
  await taskPanel.getByRole('button', { name: 'Tutup' }).click()

  await page.getByRole('button', { name: 'Pengaturan', exact: true }).click()
  const panel = page.locator('#panel-pengaturan')

  const csvDownload = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Ekspor sesi (CSV)' }).click()
  const csvText = await readDownload(await csvDownload)
  expect(csvText).toContain('Flowtime,focus')
  expect(csvText.trimEnd().split('\n')[1]).toMatch(/,ya$/)

  const backupDownload = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Ekspor backup' }).click()
  const backupText = await readDownload(await backupDownload)
  expect(JSON.parse(backupText)).toMatchObject({ app: 'ritme', sessions: [{ method: 'flowtime' }] })

  // Kosongkan tabel data, muat ulang, lalu pulihkan dari berkas backup.
  await clearDataTables(page)
  await page.reload()
  await expect(page.getByRole('button', { name: /^Mulai/ })).toBeVisible()

  await page.getByRole('button', { name: 'Pengaturan', exact: true }).click()
  const reopened = page.locator('#panel-pengaturan')
  await reopened.locator('input[type="file"]').setInputFiles({
    name: 'ritme-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(backupText),
  })
  await expect(reopened.getByRole('status')).toContainText('Dipulihkan: 1 sesi, 1 task')

  await reopened.getByRole('button', { name: 'Tutup' }).click()
  await page.getByRole('button', { name: 'Statistik', exact: true }).click()
  await expect(page.locator('#panel-statistik').getByText('1 sesi selesai')).toBeVisible()
})
