import { describe, expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nProvider } from './I18nProvider'
import { useT } from './useT'

function Show({ k }: { k: string }) {
  const t = useT()
  return <span>{t(k)}</span>
}

describe('i18n', () => {
  test("provider translation returns Chinese for 'app.title'", () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <Show k="app.title" />
      </I18nProvider>
    )
    expect(html).toContain('全能采集 Pro')
  })

  test('missing key returns key string', () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <Show k="missing.key" />
      </I18nProvider>
    )
    expect(html).toContain('missing.key')
  })

  test('missing provider returns key', () => {
    const html = renderToStaticMarkup(<Show k="app.title" />)
    expect(html).toContain('app.title')
  })
})

