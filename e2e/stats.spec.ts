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
  { id: 'task-seed', title: 'Write report', createdAt: 0, sessionCount: 2 },
]

/**
 * Write rows into the SAME IndexedDB database Dexie opens (the
 * `sessions`/`tasks` tables, schema v2 with the `date` index), then reload
 * so the task store reads them too. There are no test hooks in the app.
 */
async function seedData(
  page: Page,
  sessions: SeedSession[] = seedSessions,
  tasks: SeedTask[] = seedTasks,
): Promise<void> {
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
        request.onerror = () => reject(request.error ?? new Error('failed to open db'))
        request.onsuccess = () => {
          const db = request.result
          const write = db.transaction(['sessions', 'tasks'], 'readwrite')
          for (const session of sessions) write.objectStore('sessions').put(session)
          for (const task of tasks) write.objectStore('tasks').put(task)
          write.onerror = () => {
            db.close()
            reject(write.error ?? new Error('failed to write rows'))
          }
          write.oncomplete = () => {
            db.close()
            resolve()
          }
        }
      }),
    { sessions, tasks },
  )

  await page.reload()
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
}

test('stats: today numbers, streak, 7 days, by method, by task', async ({ page }) => {
  await page.goto('/')
  await seedData(page)

  const toggle = page.getByRole('button', { name: 'Statistics', exact: true })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')

  const panel = page.locator('#panel-statistik')
  await expect(panel).toBeVisible()

  const section = (heading: string) =>
    panel.locator('section', { has: page.getByRole('heading', { name: heading, exact: true }) })

  const todaySection = section('Today')
  await expect(todaySection.getByText('1 hr', { exact: true })).toBeVisible()
  await expect(todaySection.getByText('3 completed sessions', { exact: true })).toBeVisible()

  const streakSection = section('Streak')
  await expect(streakSection.getByText('Current: 2 days', { exact: true })).toBeVisible()
  await expect(streakSection.getByText('Longest: 2 days', { exact: true })).toBeVisible()

  const weekSection = section('Last 7 days')
  await expect(weekSection.getByText('1 hr 25 min · 4 sessions', { exact: true })).toBeVisible()
  await expect(weekSection.getByText('incomplete: 1', { exact: true })).toBeVisible()
  await expect(weekSection.locator('table tbody tr')).toHaveCount(7)
  const yesterdayRow = weekSection.locator('table tbody tr').nth(5)
  await expect(yesterdayRow.getByText('25 min', { exact: true })).toBeVisible()

  const methodSection = section('By method')
  const methodRows = methodSection.locator('li')
  await expect(methodRows).toHaveCount(2)
  await expect(methodRows.nth(0)).toContainText('Pomodoro')
  await expect(methodRows.nth(0)).toContainText('1 hr 15 min · 3 sessions')
  await expect(methodRows.nth(1)).toContainText('Flowtime')
  await expect(methodRows.nth(1)).toContainText('10 min · 1 session')

  const taskSection = section('By task')
  await expect(taskSection.getByText('Write report', { exact: true })).toBeVisible()
  await expect(taskSection.getByText('50 min · 2 sessions', { exact: true })).toBeVisible()

  // Chart bars use one accent token, not arbitrary colors.
  const bars = weekSection.locator('svg rect')
  await expect(bars).toHaveCount(2)
  await expect(bars.first()).toHaveCSS('fill', 'rgb(168, 68, 31)')

  // Escape closes the panel; focus returns to the Stats button.
  await page.keyboard.press('Escape')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toBeFocused()
})

test('empty stats: a single flat line with no chart', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Statistics', exact: true }).click()

  const panel = page.locator('#panel-statistik')
  await expect(panel.getByText('No focus sessions yet.', { exact: true })).toBeVisible()
  await expect(panel.locator('section')).toHaveCount(0)

  await panel.getByRole('button', { name: 'Close' }).click()
  await expect(panel).toBeHidden()
})

test('stats and task panels replace each other', async ({ page }) => {
  await page.goto('/')

  const statsToggle = page.getByRole('button', { name: 'Statistics', exact: true })
  const taskToggle = page.getByRole('button', { name: 'Task', exact: true })

  await statsToggle.click()
  await expect(page.locator('#panel-statistik')).toBeVisible()
  await expect(statsToggle).toHaveAttribute('aria-expanded', 'true')

  // The open panel covers the header toggles: switch panels via the T shortcut.
  await page.keyboard.press('t')
  await expect(page.locator('#panel-task')).toBeVisible()
  await expect(page.locator('#panel-statistik')).toBeHidden()
  await expect(statsToggle).toHaveAttribute('aria-expanded', 'false')

  // Escape closes and returns focus to the toggle (unchanged behavior).
  await page.keyboard.press('Escape')
  await expect(page.locator('#panel-task')).toBeHidden()
  await expect(taskToggle).toBeFocused()

  await statsToggle.click()
  await expect(page.locator('#panel-statistik')).toBeVisible()
  await expect(page.locator('#panel-task')).toBeHidden()
})

test('Ultradian nudge: today\u2019s completed session count shows when the method is picked', async ({
  page,
}) => {
  const ultradianSessions: SeedSession[] = [1, 2, 3, 4].map((n) => ({
    id: `seed-u${n}`,
    method: 'ultradian',
    kind: 'focus',
    startedAt: Date.now() - (5 - n) * 90 * MIN,
    endedAt: Date.now() - (4 - n) * 90 * MIN,
    plannedMs: 90 * MIN,
    actualMs: 90 * MIN,
    completed: true,
    date: TODAY,
  }))

  await page.goto('/')
  await seedData(page, ultradianSessions, [])

  await page.getByRole('radio', { name: /Ultradian/ }).check({ force: true })
  await expect(
    page.getByText('Ultradian today: 4 sessions · suggested max 3–4'),
  ).toBeVisible()

  await page.getByRole('radio', { name: /Pomodoro/ }).check({ force: true })
  await expect(page.getByText(/Ultradian today/)).toBeHidden()
})
