import { expect, test, type Page } from '@playwright/test'

const MIN = 60_000

interface SeedSession {
  id: string
  method: string
  kind: 'focus'
  startedAt: number
  endedAt: number
  plannedMs: number
  actualMs: number
  taskId?: string
  completed: boolean
  date: string
}

interface SeedTask {
  id: string
  title: string
  createdAt: number
  sessionCount: number
}

function localDateKey(at: number): string {
  const date = new Date(at)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const TODAY = localDateKey(Date.now())
const YESTERDAY = localDateKey(Date.now() - 24 * 60 * 60 * 1000)

const seedSessions: SeedSession[] = [
  {
    id: 'seed-p1',
    method: 'pomodoro',
    kind: 'focus',
    startedAt: Date.now() - 4 * 60 * MIN,
    endedAt: Date.now() - 4 * 60 * MIN + 25 * MIN,
    plannedMs: 25 * MIN,
    actualMs: 25 * MIN,
    taskId: 'task-seed',
    completed: true,
    date: TODAY,
  },
  {
    id: 'seed-p2',
    method: 'pomodoro',
    kind: 'focus',
    startedAt: Date.now() - 3 * 60 * MIN,
    endedAt: Date.now() - 3 * 60 * MIN + 25 * MIN,
    plannedMs: 25 * MIN,
    actualMs: 25 * MIN,
    taskId: 'task-seed',
    completed: true,
    date: TODAY,
  },
  {
    id: 'seed-f1',
    method: 'flowtime',
    kind: 'focus',
    startedAt: Date.now() - 2 * 60 * MIN,
    endedAt: Date.now() - 2 * 60 * MIN + 10 * MIN,
    plannedMs: 10 * MIN,
    actualMs: 10 * MIN,
    completed: true,
    date: TODAY,
  },
  {
    id: 'seed-x',
    method: 'pomodoro',
    kind: 'focus',
    startedAt: Date.now() - 60 * MIN,
    endedAt: Date.now() - 60 * MIN + 4 * MIN,
    plannedMs: 25 * MIN,
    actualMs: 4 * MIN,
    completed: false,
    date: TODAY,
  },
  {
    id: 'seed-y1',
    method: 'pomodoro',
    kind: 'focus',
    startedAt: Date.now() - 25 * 60 * MIN,
    endedAt: Date.now() - 25 * 60 * MIN + 25 * MIN,
    plannedMs: 25 * MIN,
    actualMs: 25 * MIN,
    completed: true,
    date: YESTERDAY,
  },
]

const seedTasks: SeedTask[] = [
  { id: 'task-seed', title: 'Tulis laporan', createdAt: 0, sessionCount: 2 },
]

/**
 * Tulis baris ke database IndexedDB yang SAMA dengan yang dibuka Dexie
 * (tabel `sessions`/`tasks`, skema v2 dengan indeks `date`), lalu muat ulang
 * supaya store task ikut terbaca. Tidak ada hook test di aplikasi.
 */
async function seedData(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    return new Promise<boolean>((resolve) => {
      const request = indexedDB.open('ritme')
      request.onsuccess = () => {
        const ready =
          request.result.version >= 2 &&
          request.result.objectStoreNames.contains('sessions') &&
          request.result.objectStoreNames.contains('tasks')
        request.result.close()
        resolve(ready)
      }
      request.onerror = () => resolve(false)
    })
  })

  await page.evaluate(
    ({ sessions, tasks }: { sessions: SeedSession[]; tasks: SeedTask[] }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('ritme')
        request.onerror = () => reject(request.error ?? new Error('gagal membuka db'))
        request.onsuccess = () => {
          const db = request.result
          const write = db.transaction(['sessions', 'tasks'], 'readwrite')
          for (const session of sessions) write.objectStore('sessions').put(session)
          for (const task of tasks) write.objectStore('tasks').put(task)
          write.onerror = () => {
            db.close()
            reject(write.error ?? new Error('gagal menulis baris'))
          }
          write.oncomplete = () => {
            db.close()
            resolve()
          }
        }
      }),
    { sessions: seedSessions, tasks: seedTasks },
  )

  await page.reload()
  await expect(page.getByRole('button', { name: 'Mulai', exact: true })).toBeVisible()
}

test('statistik: angka hari ini, streak, 7 hari, per metode, per task', async ({ page }) => {
  await page.goto('/')
  await seedData(page)

  const toggle = page.getByRole('button', { name: 'Statistik', exact: true })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')

  const panel = page.locator('#panel-statistik')
  await expect(panel).toBeVisible()

  const section = (heading: string) =>
    panel.locator('section', { has: page.getByRole('heading', { name: heading, exact: true }) })

  const todaySection = section('Hari ini')
  await expect(todaySection.getByText('1 jam', { exact: true })).toBeVisible()
  await expect(todaySection.getByText('3 sesi selesai', { exact: true })).toBeVisible()

  const streakSection = section('Streak')
  await expect(streakSection.getByText('Sekarang: 2 hari', { exact: true })).toBeVisible()
  await expect(streakSection.getByText('Terpanjang: 2 hari', { exact: true })).toBeVisible()

  const weekSection = section('7 hari terakhir')
  await expect(weekSection.getByText('1 jam 25 menit · 4 sesi', { exact: true })).toBeVisible()
  await expect(weekSection.getByText('tidak selesai: 1', { exact: true })).toBeVisible()
  await expect(weekSection.locator('table tbody tr')).toHaveCount(7)
  const yesterdayRow = weekSection.locator('table tbody tr').nth(5)
  await expect(yesterdayRow.getByText('25 menit', { exact: true })).toBeVisible()

  const methodSection = section('Per metode')
  const methodRows = methodSection.locator('li')
  await expect(methodRows).toHaveCount(2)
  await expect(methodRows.nth(0)).toContainText('Pomodoro')
  await expect(methodRows.nth(0)).toContainText('1 jam 15 menit · 3 sesi')
  await expect(methodRows.nth(1)).toContainText('Flowtime')
  await expect(methodRows.nth(1)).toContainText('10 menit · 1 sesi')

  const taskSection = section('Per task')
  await expect(taskSection.getByText('Tulis laporan', { exact: true })).toBeVisible()
  await expect(taskSection.getByText('50 menit · 2 sesi', { exact: true })).toBeVisible()

  // Batang grafik memakai satu aksen token, bukan warna bebas.
  const bars = weekSection.locator('svg rect')
  await expect(bars).toHaveCount(2)
  await expect(bars.first()).toHaveCSS('fill', 'rgb(168, 68, 31)')

  // Escape menutup panel; fokus kembali ke tombol Statistik.
  await page.keyboard.press('Escape')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toBeFocused()
})

test('statistik kosong: satu baris datar tanpa grafik', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Statistik', exact: true }).click()

  const panel = page.locator('#panel-statistik')
  await expect(panel.getByText('Belum ada sesi fokus.', { exact: true })).toBeVisible()
  await expect(panel.locator('section')).toHaveCount(0)

  await panel.getByRole('button', { name: 'Tutup' }).click()
  await expect(panel).toBeHidden()
})

test('panel statistik dan panel task saling menutup', async ({ page }) => {
  // Lebar desktop: kedua tombol terlihat (di layar sempit panel menutupi kontrol).
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')

  const statsToggle = page.getByRole('button', { name: 'Statistik', exact: true })
  const taskToggle = page.getByRole('button', { name: 'Task', exact: true })

  await statsToggle.click()
  await expect(page.locator('#panel-statistik')).toBeVisible()
  await expect(statsToggle).toHaveAttribute('aria-expanded', 'true')

  await taskToggle.click()
  await expect(page.locator('#panel-task')).toBeVisible()
  await expect(page.locator('#panel-statistik')).toBeHidden()
  await expect(statsToggle).toHaveAttribute('aria-expanded', 'false')

  await taskToggle.click()
  await expect(page.locator('#panel-task')).toBeHidden()
  await statsToggle.click()
  await expect(page.locator('#panel-statistik')).toBeVisible()
  await expect(page.locator('#panel-task')).toBeHidden()
})
