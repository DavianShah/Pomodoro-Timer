import { expect, test } from '@playwright/test'

test('task: add, select, focus session recorded, data survives a reload', async ({ page }) => {
  await page.goto('/')

  // Open the panel via the button (aria-expanded stays in sync with state).
  const toggle = page.getByRole('button', { name: 'Task', exact: true })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')

  // Add via Enter.
  await page.getByLabel('New task').fill('Write report')
  await page.keyboard.press('Enter')
  const row = page.getByRole('button', { name: /Write report/ })
  await expect(row).toHaveAttribute('aria-pressed', 'false')

  // Select as the active task, close the panel, the task shows on the timer screen.
  await row.click()
  await expect(row).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('main').getByText('Write report')).toBeVisible()

  // Finish one focus session (Flowtime: Finish = completed).
  await page.getByRole('radio', { name: /Flowtime/ }).check({ force: true })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Finish', exact: true }).click()

  // The session count goes up after the session ends.
  await toggle.click()
  await expect(page.getByText('1 sessions')).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()

  // Reload: the list, the count, and the active task all survive.
  await page.reload()
  await toggle.click()
  await expect(page.getByRole('button', { name: /Write report/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByText('1 sessions')).toBeVisible()
  await expect(page.locator('main').getByText('Write report')).toBeVisible()

  // Focus falls on the input when the panel opens: 't' types, it is not a shortcut.
  await expect(page.getByLabel('New task')).toBeFocused()
  await page.keyboard.type('t')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByLabel('New task')).toHaveValue('t')

  // Escape closes the panel; focus returns to the Task button.
  await page.keyboard.press('Escape')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toBeFocused()

  // Shortcut T: opens from the button, closes from outside the input.
  await page.keyboard.press('t')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await page.locator('header p').click()
  await page.keyboard.press('t')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
})

test('delete a task: the panel goes back to the empty message', async ({ page }) => {
  await page.goto('/')

  const toggle = page.getByRole('button', { name: 'Task', exact: true })
  await toggle.click()
  await page.getByLabel('New task').fill('Temporary')
  await page.keyboard.press('Enter')

  await page.getByRole('button', { name: /Temporary/ }).click()
  await expect(page.getByRole('button', { name: /Temporary/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(page.getByText('No tasks yet.')).toBeVisible()
  await expect(page.locator('main').getByText('Temporary')).toHaveCount(0)
})
