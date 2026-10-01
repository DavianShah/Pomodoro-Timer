import { expect, test, type Page } from '@playwright/test'

/**
 * Time Boxing (F16) lewat jalur nyata: blok via form dan via drag, mulai di
 * dalam blok, akhir blok terlewati → baris pilihan, Lanjut/Geser, persist
 * ulang-muat. Tanpa page.clock: jam tick di Web Worker terpisah — manipulasi
 * jam halaman tak menjangkaunya; penyeberangan ditimbulkan dengan endTime
 * dekat (live) atau endTime lewat (pulih).
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

/** Menit sekarang menurut jam perangkat (zona lokal). */
async function nowMinute(page: Page): Promise<number> {
  return page.evaluate(() => {
    const date = new Date()
    return date.getHours() * 60 + date.getMinutes()
  })
}

/** Semua baris blok langsung dari IndexedDB aplikasi — tanpa hook tes. */
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
            reject(getAll.error ?? new Error('gagal membaca blok'))
          }
        }
        request.onerror = () => reject(request.error ?? new Error('gagal membuka db'))
      }),
  )
}

/** Baca satu nilai dari state timer mentah di localStorage. */
async function timerValue(page: Page, key: string): Promise<unknown> {
  return page.evaluate((name) => {
    const raw = localStorage.getItem('ritme.v1.timer')
    if (raw === null) return null
    const parsed = JSON.parse(raw) as { value: Record<string, unknown> }
    return parsed.value[name]
  }, key)
}

/**
 * Setel baris blok (waktu mutlak) + timer mentah: running dengan endTime =
 * akhir blok yang SUDAH lewat → reload menampilkan baris pilihan pulih.
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
            reject(write.error ?? new Error('gagal menulis blok'))
          }
        }
        request.onerror = () => reject(request.error ?? new Error('gagal membuka db'))
      })
    },
    { first: block, second: extra },
  )
}

/** Timer mentah: penyeberangan akhir hidup delayMs dari sekarang (tanpa blok). */
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
  page.locator('main [role="status"]').filter({ hasText: 'berakhir' })

test('blok via form: mulai di dalam blok, akhir blok terlewati → baris pilihan', async ({
  page,
}) => {
  await page.goto('/')
  const method = page.getByRole('button', { name: /Time boxing/ })
  await method.click()
  await expect(method).toHaveAttribute('aria-pressed', 'true')

  // Dua blok bertetangga yang MENUTUP sekarang: rentang status 'Fokus ·'.
  const minute = await nowMinute(page)
  const start = Math.max(0, Math.floor((minute - 1) / 15) * 15)
  const mid = Math.min(start + 30, 1440)
  const end = Math.min(mid + 15, 1440)

  await page.getByRole('button', { name: 'Jadwal', exact: true }).click()
  const panel = page.locator('#panel-jadwal')
  await expect(panel).toBeVisible()
  const addBlock = async (from: number, to: number): Promise<void> => {
    await page.getByRole('button', { name: 'Tambah blok', exact: true }).click()
    await page.locator('#blok-mulai').fill(hhmm(from))
    await page.locator('#blok-selesai').fill(hhmm(to))
    await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  }
  await addBlock(start, mid)
  if (end > mid) await addBlock(mid, end)
  await expect.poll(async () => (await readBlocks(page)).length).toBeGreaterThanOrEqual(1)
  await panel.getByRole('button', { name: 'Tutup', exact: true }).click()
  await expect(panel).toBeHidden()

  const status = page.locator('main [aria-live="polite"]')
  await expect(status).toContainText('Fokus ·')
  await expect(page.locator('main h1')).toHaveText(/^\d{1,2}:\d{2}$/)

  await page.getByRole('button', { name: 'Mulai', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Selesai', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Jeda', exact: true })).toHaveCount(0)
  await expect
    .poll(async () => (await readBlocks(page)).some((b) => b.status === 'running'))
    .toBe(true)

  // Penyeberangan HIDUP: endTime 2,5 detik lagi → alarm/catatan/pilihan muncul
  // sendiri saat tick lewat. Tanpa blok yang cocok → hanya tombol Selesai.
  await craftLiveCrossing(page, 2500)
  await page.reload()
  const row = promptRow(page)
  await expect(row).toBeVisible({ timeout: 10_000 })
  await expect(status).toHaveText('Blok selesai')
  await expect(row.getByRole('button', { name: 'Selesai', exact: true })).toBeVisible()
  await expect(row.getByRole('button', { name: 'Lanjut 15 menit', exact: true })).toHaveCount(0)

  await row.getByRole('button', { name: 'Selesai', exact: true }).click()
  await expect(row).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mulai', exact: true })).toBeVisible()
  await expect(status).toContainText('Fokus ·')
})

test('Spasi tanpa blur setelah Mulai: blok berjalan tidak berakhir, sesi tidak tercatat', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Time boxing/ }).click()
  await expect(page.getByRole('button', { name: /Time boxing/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Satu blok yang menutup menit sekarang → Mulai langsung di dalam blok.
  const minute = await nowMinute(page)
  const start = Math.max(0, Math.floor((minute - 1) / 15) * 15)
  const end = Math.min(start + 30, 1440)

  await page.getByRole('button', { name: 'Jadwal', exact: true }).click()
  const panel = page.locator('#panel-jadwal')
  await expect(panel).toBeVisible()
  await page.getByRole('button', { name: 'Tambah blok', exact: true }).click()
  await page.locator('#blok-mulai').fill(hhmm(start))
  await page.locator('#blok-selesai').fill(hhmm(end))
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect.poll(async () => (await readBlocks(page)).length).toBeGreaterThanOrEqual(1)
  await panel.getByRole('button', { name: 'Tutup', exact: true }).click()
  await expect(panel).toBeHidden()

  const clock = page.locator('main h1')
  await page.getByRole('button', { name: 'Mulai', exact: true }).click()
  // Fokus tetap di tombol utama yang kini berlabel Selesai — tanpa blur.
  await expect(page.getByRole('button', { name: 'Selesai', exact: true }).first()).toBeVisible()
  await page.waitForTimeout(1_200)
  await page.keyboard.press('Space')

  // Blok tetap berjalan: tanpa baris pilihan, jam maju, tanpa "Blok selesai".
  await expect(promptRow(page)).toHaveCount(0)
  await expect(page.locator('main [aria-live="polite"]')).not.toHaveText('Blok selesai')
  const after = await clock.textContent()
  await page.waitForTimeout(1_200)
  await expect(clock).not.toHaveText(after ?? '')

  // Sesi tidak tercatat: Space tidak mengaktifkan tombol Selesai.
  await page.getByRole('button', { name: 'Statistik', exact: true }).click()
  await expect(page.locator('#panel-statistik')).toContainText('Belum ada sesi fokus')
})

test('blok via drag: Lanjut 15, Geser setelah blok lewat, persist ulang muat', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Time boxing/ }).click()
  await page.getByRole('button', { name: 'Jadwal', exact: true }).click()
  const panel = page.locator('#panel-jadwal')
  await expect(panel).toBeVisible()

  // Drag vertikal 02:00 → 03:00 (menit di sumbu-y; blok dibuat langsung saat lepas).
  const timeline = page.locator('#timeline-blok')
  await timeline.evaluate((el) => el.scrollIntoView({ block: 'start' }))
  const box = await timeline.boundingBox()
  if (box === null) throw new Error('timeline tidak terlihat')
  const yAt = (minute: number): number => box.y + (minute / 1440) * box.height
  const x = box.x + 200
  await page.mouse.move(x, yAt(120))
  await page.mouse.down()
  await page.mouse.move(x, yAt(180), { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => (await readBlocks(page)).length).toBe(1)

  // Blok kedua via form, menempel setelah blok drag.
  await page.getByRole('button', { name: 'Tambah blok', exact: true }).click()
  await page.locator('#blok-mulai').fill('03:00')
  await page.locator('#blok-selesai').fill('03:15')
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect.poll(async () => (await readBlocks(page)).length).toBe(2)
  await panel.getByRole('button', { name: 'Tutup', exact: true }).click()
  await expect(panel).toBeHidden()

  const initial = await readBlocks(page)
  const dragBlock = initial.find((b) => b.startMin === 120)
  const formBlock = initial.find((b) => b.startMin === 180)
  if (dragBlock === undefined) throw new Error('blok drag tidak ada')
  if (formBlock === undefined) throw new Error('blok form tidak ada')
  expect(dragBlock.endMin).toBe(180)
  expect(formBlock.endMin).toBe(195)

  // Pulih dengan endTime = akhir blok yang sudah lewat → baris pilihan utuh.
  const minute1 = await nowMinute(page)
  await craftPrompt(page, {
    id: dragBlock.id,
    startMin: Math.max(0, minute1 - 60),
    endMin: minute1,
  })
  await page.reload()
  const row = promptRow(page)
  await expect(row).toBeVisible({ timeout: 10_000 })
  await expect(row.getByRole('button', { name: 'Lanjut 15 menit', exact: true })).toBeVisible()
  await expect(
    row.getByRole('button', { name: 'Geser blok berikutnya', exact: true }),
  ).toBeVisible()

  // Lanjut 15: blok diperpanjang +15 menit, sesi lanjut berjalan.
  await row.getByRole('button', { name: 'Lanjut 15 menit', exact: true }).click()
  await expect(row).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Selesai', exact: true }).first()).toBeVisible()
  await expect
    .poll(async () => (await readBlocks(page)).find((b) => b.id === dragBlock.id)?.endMin)
    .toBe(minute1 + 15)

  // Hentikan sesi lalu pulihkan pilihan lagi; Geser memakai lewat-waktu (overrun > 0).
  await page.getByRole('button', { name: 'Selesai', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Mulai', exact: true })).toBeVisible()
  // Pencatatan sesi (Selesai) menulis status blok 'done' secara async —
  // tunggu selesai sebelum menulis ulang baris, agar tidak balapan.
  await expect
    .poll(async () => (await readBlocks(page)).find((b) => b.id === dragBlock.id)?.status)
    .toBe('done')
  const minute2 = await nowMinute(page)
  await craftPrompt(
    page,
    { id: dragBlock.id, startMin: Math.max(0, minute2 - 60), endMin: minute2 },
    { id: formBlock.id, startMin: minute2 + 1, endMin: minute2 + 16 },
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
  await row2.getByRole('button', { name: 'Geser blok berikutnya', exact: true }).click()
  await expect(row2).toHaveCount(0)
  const shifted = (await readBlocks(page)).find((b) => b.id === formBlock.id)
  if (shifted === undefined) throw new Error('blok berikutnya hilang')
  expect(shifted.startMin).toBeGreaterThan(minute2 + 1)
  await expect(page.getByRole('button', { name: 'Mulai', exact: true })).toBeVisible()
  await expect.poll(async () => timerValue(page, 'endTime')).toBeNull()

  // Persist: endTime null bertahan lewat reload; tak ada baris pilihan tersisa.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Mulai', exact: true })).toBeVisible()
  await expect(promptRow(page)).toHaveCount(0)
  await expect.poll(async () => timerValue(page, 'endTime')).toBeNull()
})

test('Spasi: mulai blok saat idle, tidak mengakhiri blok saat berjalan', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Time boxing/ }).click()

  // Satu blok yang menutup sekarang, lewat form.
  const minute = await nowMinute(page)
  const start = Math.max(0, Math.floor((minute - 1) / 15) * 15)
  const end = Math.min(start + 30, 1440)
  await page.getByRole('button', { name: 'Jadwal', exact: true }).click()
  const panel = page.locator('#panel-jadwal')
  await page.getByRole('button', { name: 'Tambah blok', exact: true }).click()
  await page.locator('#blok-mulai').fill(hhmm(start))
  await page.locator('#blok-selesai').fill(hhmm(end))
  await page.getByRole('button', { name: 'Simpan', exact: true }).click()
  await expect.poll(async () => (await readBlocks(page)).length).toBeGreaterThanOrEqual(1)
  await panel.getByRole('button', { name: 'Tutup', exact: true }).click()

  // Spasi dijalankan dari body: perilaku native tombol fokus bukan shortcut.
  const blur = async (): Promise<void> => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  }
  const status = page.locator('main [aria-live="polite"]')
  const running = page.getByRole('button', { name: 'Selesai', exact: true })
  const idle = page.getByRole('button', { name: 'Mulai', exact: true })

  await blur()
  await page.keyboard.press('Space')
  await expect(running).toBeVisible()
  await expect(status).toContainText('Fokus ·')

  // Spasi saat berjalan: state tidak berubah — blok tidak ditutup.
  await blur()
  const before = await status.textContent()
  await page.keyboard.press('Space')
  await page.waitForTimeout(600)
  await expect(running).toBeVisible()
  await expect(idle).toHaveCount(0)
  await expect(status).toHaveText(before ?? '')
  await expect(promptRow(page)).toHaveCount(0)
  expect((await readBlocks(page)).some((block) => block.status === 'running')).toBe(true)

  // S tetap satu-satunya shortcut penutup blok.
  await page.keyboard.press('s')
  await expect(idle).toBeVisible()
})
