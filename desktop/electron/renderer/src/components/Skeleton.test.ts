import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { Skeleton } from './Skeleton'

test('Skeleton renders with default size and class', () => {
  const html = renderToStaticMarkup(React.createElement(Skeleton, {}))
  expect(html).toContain('class="skeleton"')
  expect(html).toContain('height:14px')
})

test('Skeleton respects width/height props', () => {
  const html = renderToStaticMarkup(React.createElement(Skeleton, { width: 120, height: 18 }))
  expect(html).toContain('width:120px')
  expect(html).toContain('height:18px')
})
