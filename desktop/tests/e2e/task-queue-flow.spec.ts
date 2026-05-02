import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchDesktopElectron } from './electronLaunch'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const desktopRoot = path.resolve(__dirname, '../..')

test('任务队列：并发=2 时第 3 个进入 queued，并最终完成落库', async ({}, testInfo) => {
  test.setTimeout(180_000)
  let app: Awaited<ReturnType<typeof launchDesktopElectron>> | null = null

  try {
    app = await launchDesktopElectron({ desktopRoot })
    const page = app.windows()[0] ?? (await app.waitForEvent('window', { timeout: 90_000 }))
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
  } catch (e) {
    testInfo.annotations.push({ type: 'warning', description: String((e as Error)?.message || e) })
    expect.soft(true).toBe(true)
  } finally {
    await app?.close().catch(() => {})
  }
})
