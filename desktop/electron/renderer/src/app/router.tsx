import { Suspense, lazy } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { TasksPage } from '../pages/TasksPage'
import { ConsolePage } from '../pages/ConsolePage'
import { OnboardingPage } from '../pages/OnboardingPage'
import { Skeleton } from '../components/Skeleton'

const ReportsPage = lazy(() => import('../pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const ReportPage = lazy(() => import('../pages/ReportPage').then((m) => ({ default: m.ReportPage })))
const ClusterPage = lazy(() => import('../pages/ClusterPage').then((m) => ({ default: m.ClusterPage })))
const KnowledgeBasePage = lazy(() => import('../pages/KnowledgeBasePage').then((m) => ({ default: m.KnowledgeBasePage })))
const SettingsPage = lazy(() => import('../pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))

const router = createBrowserRouter([
  { path: '/onboarding', element: <OnboardingPage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <TasksPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'console', element: <ConsolePage /> },
      {
        path: 'reports',
        element: (
          <Suspense fallback={<Skeleton />}>
            <ReportsPage />
          </Suspense>
        )
      },
      {
        path: 'cluster',
        element: (
          <Suspense fallback={<Skeleton />}>
            <ClusterPage />
          </Suspense>
        )
      },
      {
        path: 'report/:runId',
        element: (
          <Suspense fallback={<Skeleton />}>
            <ReportPage />
          </Suspense>
        )
      },
      {
        path: 'kb',
        element: (
          <Suspense fallback={<Skeleton />}>
            <KnowledgeBasePage />
          </Suspense>
        )
      },
      {
        path: 'settings',
        element: (
          <Suspense fallback={<Skeleton />}>
            <SettingsPage />
          </Suspense>
        )
      }
    ]
  }
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
