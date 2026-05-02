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

  expect(html).toContain('Running 1/2')
  expect(html).toContain('Pending 3')
  expect(html).toContain('width:50%')
})

test('QueueStatusCard shows placeholder while loading', () => {
  const html = renderToStaticMarkup(
    React.createElement(QueueStatusCard, {
      status: { running: ['r1', 'r2'], pending: 0 },
      loading: true,
      maxConcurrency: 2
    })
  )
  expect(html).toContain('Running -/2')
  expect(html).toContain('Pending -')
})
