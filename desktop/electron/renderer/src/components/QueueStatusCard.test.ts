import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { QueueStatusCard } from './QueueStatusCard'

test('QueueStatusCard shows running/progress and pending badge', () => {
  const html = renderToStaticMarkup(
    React.createElement(QueueStatusCard, {
      status: { running: ['r1'], pending: 3 },
      loading: false,
      maxConcurrency: 2
    })
  )

  expect(html).toContain('Running')
  expect(html).toContain('1')
  expect(html).toContain('2')
  expect(html).toContain('Pending')
  expect(html).toContain('3')
  expect(html).toContain('50%')
})

test('QueueStatusCard shows placeholder while loading', () => {
  const html = renderToStaticMarkup(
    React.createElement(QueueStatusCard, {
      status: { running: ['r1', 'r2'], pending: 0 },
      loading: true,
      maxConcurrency: 2
    })
  )
  expect(html).toContain('Running')
  expect(html).toContain('-')
  expect(html).toContain('Pending')
})
