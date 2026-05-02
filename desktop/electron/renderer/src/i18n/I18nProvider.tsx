import { createContext, useMemo, type ReactNode } from 'react'
import { dictZhCN } from './dict.zh-CN'

export type I18nLocale = 'zh-CN'

export type I18nContextValue = {
  locale: I18nLocale
  t: (key: string) => string
}

export const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider(props: { children: ReactNode }) {
  const value = useMemo<I18nContextValue>(() => {
    const t = (key: string) => dictZhCN[key] ?? key
    return { locale: 'zh-CN', t }
  }, [])

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>
}

