import { EventEmitter } from 'node:events'
import { describe, expect, test, vi } from 'vitest'
import { UpdateService, type UpdateEvent, type UpdateState } from './UpdateService'

class MockAutoUpdater extends EventEmitter {
  checkForUpdates = vi.fn<() => Promise<unknown>>()
  downloadUpdate = vi.fn<() => Promise<unknown>>()
  quitAndInstall = vi.fn<() => void>()
}

describe('UpdateService e2e flows', () => {
  function collectEvents(svc: UpdateService): Array<{ state: UpdateState; event: UpdateEvent }> {
    const events: Array<{ state: UpdateState; event: UpdateEvent }> = []
    svc.onEvent((ev) => {
      events.push({ state: svc.getState(), event: ev })
    })
    return events
  }

  test('idle -> checking -> notAvailable', async () => {
    const au = new MockAutoUpdater()
    au.checkForUpdates.mockResolvedValueOnce({})
    const svc = new UpdateService(au, { autoDownload: true })
    const events = collectEvents(svc)

    expect(svc.getState()).toEqual({ status: 'idle' })

    const checkPromise = svc.check()
    expect(svc.getState()).toEqual({ status: 'checking' })
    await checkPromise

    au.emit('update-not-available', { version: '1.0.0' })

    expect(svc.getState()).toEqual({ status: 'notAvailable' })
    expect(events.map((e) => e.event.name)).toEqual([
      'state',
      'state',
      'update-not-available'
    ])
    expect(events[0]!.state).toEqual({ status: 'checking' })
    expect(events[1]!.state).toEqual({ status: 'notAvailable' })
    expect(events[2]!.state).toEqual({ status: 'notAvailable' })
  })

  test('idle -> checking -> available -> downloading -> downloaded -> install', async () => {
    const au = new MockAutoUpdater()
    au.checkForUpdates.mockResolvedValueOnce({})
    au.downloadUpdate.mockResolvedValueOnce({})
    const svc = new UpdateService(au, { autoDownload: true })
    const events = collectEvents(svc)

    expect(svc.getState()).toEqual({ status: 'idle' })

    const checkPromise = svc.check()
    expect(svc.getState()).toEqual({ status: 'checking' })
    await checkPromise

    au.emit('update-available', { version: '1.1.0' })
    expect(svc.getState().status).toBe('downloading')
    expect(au.downloadUpdate).toHaveBeenCalledTimes(1)

    au.emit('download-progress', { percent: 30, transferred: 30, total: 100, bytesPerSecond: 1000 })
    expect(svc.getState()).toEqual({
      status: 'downloading',
      progress: { percent: 30, transferred: 30, total: 100, bytesPerSecond: 1000 }
    })

    au.emit('download-progress', { percent: 60, transferred: 60, total: 100, bytesPerSecond: 2000 })
    expect(svc.getState()).toEqual({
      status: 'downloading',
      progress: { percent: 60, transferred: 60, total: 100, bytesPerSecond: 2000 }
    })

    au.emit('update-downloaded', { version: '1.1.0' })
    expect(svc.getState()).toEqual({ status: 'downloaded' })

    const installResult = await svc.install()
    expect(installResult).toEqual({ success: true })
    expect(au.quitAndInstall).toHaveBeenCalledTimes(1)

    const eventNames = events.map((e) => e.event.name)
    expect(eventNames).toEqual([
      'state',
      'state',
      'update-available',
      'state',
      'state',
      'download-progress',
      'state',
      'download-progress',
      'state',
      'update-downloaded'
    ])

    expect(events[0]!.state).toEqual({ status: 'checking' })
    expect(events[1]!.state).toEqual({ status: 'available' })
    expect(events[2]!.state).toEqual({ status: 'available' })
    expect(events[3]!.state).toEqual({ status: 'downloading' })
    expect(events[4]!.state).toEqual({
      status: 'downloading',
      progress: { percent: 30, transferred: 30, total: 100, bytesPerSecond: 1000 }
    })
    expect(events[5]!.state).toEqual({
      status: 'downloading',
      progress: { percent: 30, transferred: 30, total: 100, bytesPerSecond: 1000 }
    })
    expect(events[6]!.state).toEqual({
      status: 'downloading',
      progress: { percent: 60, transferred: 60, total: 100, bytesPerSecond: 2000 }
    })
    expect(events[7]!.state).toEqual({
      status: 'downloading',
      progress: { percent: 60, transferred: 60, total: 100, bytesPerSecond: 2000 }
    })
    expect(events[8]!.state).toEqual({ status: 'downloaded' })
    expect(events[9]!.state).toEqual({ status: 'downloaded' })
  })

  test('idle -> checking -> error', async () => {
    const au = new MockAutoUpdater()
    au.checkForUpdates.mockRejectedValueOnce(new Error('network failure'))
    const svc = new UpdateService(au, { autoDownload: true })
    const events = collectEvents(svc)

    expect(svc.getState()).toEqual({ status: 'idle' })

    const result = await svc.check()
    expect(result).toEqual({ status: 'error', error: 'network failure' })
    expect(svc.getState()).toEqual({ status: 'error', error: 'network failure' })

    expect(events.map((e) => e.event.name)).toEqual([
      'state',
      'state',
      'error'
    ])
    expect(events[0]!.state).toEqual({ status: 'checking' })
    expect(events[1]!.state).toEqual({ status: 'error', error: 'network failure' })
    expect(events[2]!.state).toEqual({ status: 'error', error: 'network failure' })
  })

  test('idle -> checking -> available -> downloading -> error', async () => {
    const au = new MockAutoUpdater()
    au.checkForUpdates.mockResolvedValueOnce({})
    au.downloadUpdate.mockRejectedValueOnce(new Error('download failed'))
    const svc = new UpdateService(au, { autoDownload: true })
    const events = collectEvents(svc)

    expect(svc.getState()).toEqual({ status: 'idle' })

    await svc.check()
    au.emit('update-available', { version: '1.1.0' })
    expect(svc.getState().status).toBe('downloading')

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(svc.getState()).toEqual({ status: 'error', error: 'download failed' })

    const eventNames = events.map((e) => e.event.name)
    expect(eventNames).toEqual([
      'state',
      'state',
      'update-available',
      'state',
      'state',
      'error'
    ])
    expect(events[0]!.state).toEqual({ status: 'checking' })
    expect(events[1]!.state).toEqual({ status: 'available' })
    expect(events[2]!.state).toEqual({ status: 'available' })
    expect(events[3]!.state).toEqual({ status: 'downloading' })
    expect(events[4]!.state).toEqual({ status: 'error', error: 'download failed' })
    expect(events[5]!.state).toEqual({ status: 'error', error: 'download failed' })
  })

  test('install() only works when status is downloaded', async () => {
    const au = new MockAutoUpdater()
    const svc = new UpdateService(au)

    const r1 = await svc.install()
    expect(r1).toEqual({ success: false, error: 'not_downloaded' })
    expect(au.quitAndInstall).not.toHaveBeenCalled()

    au.emit('update-available', { version: '1.1.0' })
    const r2 = await svc.install()
    expect(r2).toEqual({ success: false, error: 'not_downloaded' })
    expect(au.quitAndInstall).not.toHaveBeenCalled()

    au.emit('download-progress', { percent: 50, transferred: 5, total: 10, bytesPerSecond: 1 })
    const r3 = await svc.install()
    expect(r3).toEqual({ success: false, error: 'not_downloaded' })
    expect(au.quitAndInstall).not.toHaveBeenCalled()

    au.emit('update-downloaded', { version: '1.1.0' })
    const r4 = await svc.install()
    expect(r4).toEqual({ success: true })
    expect(au.quitAndInstall).toHaveBeenCalledTimes(1)
  })
})
