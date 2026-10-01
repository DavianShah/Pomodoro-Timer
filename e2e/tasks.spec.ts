import { expect, test } from '@playwright/test'

test('task: tambah, pilih, sesi fokus tercatat, data bertahan setelah reload', async ({ page }) => {
  await page.goto('/')

  // Buka panel lewat tombol (aria-expanded sinkron dengan state).
  const toggle = page.getByRole('button', { name: 'Task', exact: true })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')

  // Tambah lewat Enter.
  await page.getByLabel('Task baru').fill('Tulis laporan')
  await page.keyboard.press('Enter')
  const row = page.getByRole('button', { name: /Tulis laporan/ })
  await expect(row).toHaveAttribute('aria-pressed', 'false')

  // Pilih jadi task aktif, tutup panel, task tampil di layar timer.
  await row.click()
  await expect(row).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Tutup', exact: true }).click()
  await expect(page.locator('main').getByText('Tulis laporan')).toBeVisible()

  // Selesaikan satu sesi fokus (Flowtime: Selesai = completed).
  await page.getByRole('button', { name: /Flowtime/ }).click()
  await page.getByRole('button', { name: 'Mulai', exact: true }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Selesai', exact: true }).click()

  // Hitungan sesi naik setelah sesi berakhir.
  await toggle.click()
  await expect(page.getByText('1 sesi')).toBeVisible()
  await page.getByRole('button', { name: 'Tutup', exact: true }).click()

  // Reload: daftar, hitungan, dan task aktif tetap ada.
  await page.reload()
  await toggle.click()
  await expect(page.getByRole('button', { name: /Tulis laporan/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText('1 sesi')).toBeVisible()
  await expect(page.locator('main').getByText('Tulis laporan')).toBeVisible()

  // Fokus jatuh ke input saat panel terbuka: 't' mengetik, bukan shortcut.
  await expect(page.getByLabel('Task baru')).toBeFocused()
  await page.keyboard.type('t')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByLabel('Task baru')).toHaveValue('t')

  // Escape menutup panel; fokus kembali ke tombol Task.
  await page.keyboard.press('Escape')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toBeFocused()

  // Shortcut T: buka dari tombol, tutup dari luar input.
  await page.keyboard.press('t')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await page.locator('header p').click()
  await page.keyboard.press('t')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
})

test('hapus task: panel kembali ke pesan kosong', async ({ page }) => {
  await page.goto('/')

  const toggle = page.getByRole('button', { name: 'Task', exact: true })
  await toggle.click()
  await page.getByLabel('Task baru').fill('Sementara')
  await page.keyboard.press('Enter')

  await page.getByRole('button', { name: /Sementara/ }).click()
  await expect(page.getByRole('button', { name: /Sementara/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Hapus', exact: true }).click()

  await expect(page.getByText('Belum ada task.')).toBeVisible()
  await expect(page.locator('main').getByText('Sementara')).toHaveCount(0)
})
