import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { ErrorBoundary } from './components/error/ErrorBoundary'
import { InlineSkeleton } from './components/error/InlineSkeleton'
import { I18nProvider } from './i18n/I18nProvider'
import './styles.css'

const AppRouter = React.lazy(() => import('./app/router').then((m) => ({ default: m.AppRouter })))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<InlineSkeleton />}>
        <I18nProvider>
          <AppRouter />
        </I18nProvider>
      </Suspense>
    </ErrorBoundary>
  </React.StrictMode>
)
