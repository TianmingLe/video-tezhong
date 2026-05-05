import { describe, expect, test } from 'vitest'
import { validateUpdateConfig } from './UpdateValidator'

describe('UpdateValidator', () => {
  test('validates nightly channel correctly', () => {
    const result = validateUpdateConfig({
      buildChannel: 'nightly',
      updateServerUrl: 'https://updates.example.com',
      feedURL: 'https://updates.example.com/nightly/latest'
    })

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.channel).toBe('nightly')
    expect(result.feedURL).toBe('https://updates.example.com/nightly/latest')
  })

  test('validates stable channel correctly', () => {
    const result = validateUpdateConfig({
      buildChannel: 'stable',
      updateServerUrl: 'https://updates.example.com',
      feedURL: 'https://updates.example.com/stable/latest'
    })

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.channel).toBe('stable')
    expect(result.feedURL).toBe('https://updates.example.com/stable/latest')
  })

  test('detects missing configuration', () => {
    const result = validateUpdateConfig({
      buildChannel: undefined,
      updateServerUrl: undefined,
      feedURL: undefined
    })

    expect(result.ok).toBe(false)
    expect(result.errors).toContain('更新服务器 URL 未配置')
    expect(result.channel).toBe('stable')
    expect(result.feedURL).toBeNull()
  })

  test('warns when feedURL does not match nightly channel', () => {
    const result = validateUpdateConfig({
      buildChannel: 'nightly',
      updateServerUrl: 'https://updates.example.com',
      feedURL: 'https://updates.example.com/stable/latest'
    })

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toContain('feedURL 与通道不匹配')
  })

  test('warns when feedURL does not match stable channel', () => {
    const result = validateUpdateConfig({
      buildChannel: 'stable',
      updateServerUrl: 'https://updates.example.com',
      feedURL: 'https://updates.example.com/nightly/latest'
    })

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toContain('feedURL 与通道不匹配')
  })

  test('warns on unknown build channel', () => {
    const result = validateUpdateConfig({
      buildChannel: 'beta',
      updateServerUrl: 'https://updates.example.com',
      feedURL: 'https://updates.example.com/stable/latest'
    })

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings).toContain('未知的构建通道: beta')
  })

  test('defaults to stable when buildChannel is missing', () => {
    const result = validateUpdateConfig({
      buildChannel: undefined,
      updateServerUrl: 'https://updates.example.com',
      feedURL: 'https://updates.example.com/stable/latest'
    })

    expect(result.ok).toBe(true)
    expect(result.channel).toBe('stable')
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })
})
