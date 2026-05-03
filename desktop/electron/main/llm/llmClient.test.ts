import { describe, expect, test, vi } from 'vitest'
import { createLlmClient } from './llmClient'

describe('llmClient', () => {
  test('chatCompletion returns content', async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] })
      } as any
    })
    const client = createLlmClient({
      fetchImpl: fetchMock as any,
      getConfig: () => ({ apiBaseUrl: 'https://x/v1', model: 'm', apiKey: 'k' })
    })
    const out = await client.chatCompletion({
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0
    })
    expect(out).toBe('{"ok":true}')
    expect(fetchMock).toHaveBeenCalled()
  })
})

