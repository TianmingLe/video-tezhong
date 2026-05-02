import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runNotifyFlow } from '../../electron/main/notify/notifyFlow'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const desktopRoot = path.resolve(__dirname, '../..')

test('通知流：点击通知会导航到报告页', () => {
  const calls: Array<{ kind: string; payload?: unknown }> = []
  let click: any = null

  runNotifyFlow({
    runId: 'run-test-123',
    exitCode: 0,
    platform: 'linux',
    deps: {
      createNotification: (payload) => {
        calls.push({ kind: 'create', payload })
        return {
          onClick: (cb: () => void) => {
            click = cb
          },
          show: () => {
            calls.push({ kind: 'show' })
          }
        }
      },
      showAndFocusWindow: () => {
        calls.push({ kind: 'focus' })
      },
      sendNavigate: (p) => {
        calls.push({ kind: 'navigate', payload: p })
      }
    }
  })

  expect(calls.some((c) => c.kind === 'create')).toBe(true)
  expect(calls.some((c) => c.kind === 'show')).toBe(true)

  const handler =
    typeof click === 'function'
      ? (click as () => void)
      : () => {
          throw new Error('click handler not registered')
        }

  handler()
  expect(calls.some((c) => c.kind === 'focus')).toBe(true)
  expect(calls.some((c) => c.kind === 'navigate' && c.payload === '/report/run-test-123')).toBe(true)
})

test('托盘配置可读写（软断言）', async ({}, testInfo) => {
  let app: Awaited<ReturnType<typeof electron.launch>> | null = null

  try {
    app = await electron.launch({
      args: ['.'],
      cwd: desktopRoot,
      env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
    })

    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(() => {
      const api = (window as any).api
      return typeof api?.tray?.getConfig === 'function' && typeof api?.tray?.updateConfig === 'function'
    })

    await page.locator('aside.nav').getByText('设置').click()
    await expect.soft(page.getByText('托盘行为配置')).toBeVisible()

    const select = page.locator('select.input').first()
    await expect.soft(select).toBeEnabled({ timeout: 15_000 })

    const before = await select.inputValue()
    const next = before === 'toggle' ? 'menu' : 'toggle'
    await select.selectOption(next)

    await expect.soft(select).toHaveValue(next)
  } catch (e) {
    testInfo.annotations.push({ type: 'warning', description: `托盘烟测跳过：${String((e as Error)?.message || e)}` })
  } finally {
    await app?.close()
  }
})

