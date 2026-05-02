import { EventEmitter } from 'node:events'
import { describe, expect, test, vi } from 'vitest'
import { UpdateService } from './UpdateService'

class MockAutoUpdater extends EventEmitter {
  checkForUpdates = vi.fn<() => Promise<unknown>>()
  downloadUpdate = vi.fn<() => Promise<unknown>>()
  quitAndInstall = vi.fn<() => void>()
}

describe('UpdateService', () => {
  test('starts idle and check() enters checking', async () => {
    const au = new MockAutoUpdater()
    au.checkForUpdates.mockResolvedValueOnce({})
    const svc = new UpdateService(au)

    expect(svc.getState()).toEqual({ status: 'idle' })
    await svc.check()
    expect(au.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(svc.getState().status).toBe('checking')
  })

  test('update-not-available moves to notAvailable', async () => {
    const au = new MockAutoUpdater()
    au.checkForUpdates.mockResolvedValueOnce({})
    const svc = new UpdateService(au)

    await svc.check()
    au.emit('update-not-available', { version: '0.0.1' })
    expect(svc.getState()).toEqual({ status: 'notAvailable' })
  })

  test('update-available triggers auto download and reaches downloaded', async () => {
    const au = new MockAutoUpdater()
    au.checkForUpdates.mockResolvedValueOnce({})
    au.downloadUpdate.mockResolvedValueOnce({})
    const svc = new UpdateService(au, { autoDownload: true })

    await svc.check()
    au.emit('update-available', { version: '0.0.2' })
    expect(au.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(svc.getState().status).toBe('downloading')

    au.emit('download-progress', { percent: 50, transferred: 5, total: 10, bytesPerSecond: 1 })
    expect(svc.getState()).toEqual({
      status: 'downloading',
      progress: { percent: 50, transferred: 5, total: 10, bytesPerSecond: 1 }
    })

    au.emit('update-downloaded', { version: '0.0.2' })
    expect(svc.getState()).toEqual({ status: 'downloaded' })
  })

  test('install only calls quitAndInstall when downloaded', async () => {
    const au = new MockAutoUpdater()
    const svc = new UpdateService(au)

    const r1 = await svc.install()
    expect(r1).toEqual({ success: false, error: 'not_downloaded' })
    expect(au.quitAndInstall).not.toHaveBeenCalled()

    au.emit('update-downloaded', { version: '0.0.2' })
    const r2 = await svc.install()
    expect(r2).toEqual({ success: true })
    expect(au.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  test('offline error in check() resolves to error state (does not throw)', async () => {
    const au = new MockAutoUpdater()
    au.checkForUpdates.mockRejectedValueOnce(new Error('net::ERR_INTERNET_DISCONNECTED'))
    const svc = new UpdateService(au)

    await expect(svc.check()).resolves.toEqual({ status: 'error', error: 'net::ERR_INTERNET_DISCONNECTED' })
  })
})

