import { useContext } from 'react'
import { I18nContext } from './I18nProvider'

export type TFunction = (key: string) => string

export function useT(): TFunction {
  const ctx = useContext(I18nContext)
  return ctx?.t ?? ((key: string) => key)
}

