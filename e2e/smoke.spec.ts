import { test, expect, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { join } from 'node:path'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  // Launch the built Electron app
  app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      // Disable GPU in CI to avoid rendering issues
      ELECTRON_DISABLE_GPU: '1',
    },
  })
  page = await app.firstWindow()
  // Wait for the renderer to be ready
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app?.close()
})

test.describe('App Smoke Test', () => {
  test('window title contains OrchFlow', async () => {
    const title = await page.title()
    expect(title).toContain('OrchFlow')
  })

  test('sidebar navigation is visible', async () => {
    // Check that the sidebar nav items are rendered
    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()

    // Check for navigation items
    await expect(page.getByText('Sessions')).toBeVisible()
    await expect(page.getByText('Tasks')).toBeVisible()
    await expect(page.getByText('Pipeline')).toBeVisible()
    await expect(page.getByText('Audit')).toBeVisible()
    await expect(page.getByText('Settings')).toBeVisible()
  })

  test('can navigate between views', async () => {
    // Click Tasks nav
    await page.getByText('Tasks').click()
    // Should show project picker or task list
    const tasksContent = page.locator('main')
    await expect(tasksContent).toBeVisible()

    // Click Pipeline nav
    await page.getByText('Pipeline').click()
    await expect(page.locator('main')).toBeVisible()

    // Click Audit nav
    await page.getByText('Audit').click()
    await expect(page.getByText('Audit Log')).toBeVisible()

    // Click Settings nav
    await page.getByText('Settings').click()
    await expect(page.getByText('Settings')).toBeVisible()

    // Back to Sessions
    await page.getByText('Sessions').click()
  })

  test('New Task button is present', async () => {
    const newTaskBtn = page.getByText('New Task')
    await expect(newTaskBtn).toBeVisible()
  })

  test('error boundary does not show errors', async () => {
    // Verify no error boundary is displayed (app loaded successfully)
    const errorText = page.getByText('Something went wrong')
    await expect(errorText).not.toBeVisible()
  })
})
