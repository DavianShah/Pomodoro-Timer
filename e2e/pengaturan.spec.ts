import { expect, test } from '@playwright/test'

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
