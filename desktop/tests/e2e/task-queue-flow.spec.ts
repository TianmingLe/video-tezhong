import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const desktopRoot = path.resolve(__dirname, '../..')

test('任务队列：并发=2 时第 3 个进入 queued，并最终完成落库', async () => {
  const app = await electron.launch({
    args: ['.'],
    cwd: desktopRoot,
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
  })

  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText('任务')).toBeVisible()

    await page.waitForFunction(() => {
      const api = (window as any).api
      return typeof api?.job?.start === 'function' && typeof api?.job?.queueStatus === 'function'
    })

    const now = Date.now()
    const runIds = [`e2e-${now}-1`, `e2e-${now}-2`, `e2e-${now}-3`]

    const startResults = await page.evaluate(async (ids) => {
      const start = async (runId: string) => {
        return await (window as any).api.job.start({
          runId,
          script: 'scripts/mock_device.py',
          args: ['--scenario', 'normal', '--trace-id', runId],
          env: {}
        })
      }

      const r1 = await start(ids[0]!)
      const r2 = await start(ids[1]!)
      const r3 = await start(ids[2]!)
      return { r1, r2, r3 }
    }, runIds)

    expect(startResults.r1).toEqual({ success: true, state: 'running' })
    expect(startResults.r2).toEqual({ success: true, state: 'running' })
    expect(startResults.r3).toEqual({ success: true, state: 'queued', position: 1 })

    await expect
      .poll(async () => {
        return await page.evaluate(async () => await (window as any).api.job.queueStatus())
      })
      .toEqual({ running: [], pending: 0 })

    const history = await page.evaluate(async () => await (window as any).api.job.history())
    const created = history.filter((it: any) => runIds.includes(it.run_id))
    expect(created.map((x: any) => x.run_id).sort()).toEqual([...runIds].sort())
    expect(created.every((x: any) => x.status === 'exited')).toBe(true)

    await page.locator('aside.nav').getByText('报告').click()
    for (const id of runIds) {
      await expect(page.getByText(id)).toBeVisible()
    }
  } finally {
    await app.close()
  }
})

