import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { TasksPage } from '../pages/TasksPage'
import { ConsolePage } from '../pages/ConsolePage'
import { ReportsPage } from '../pages/ReportsPage'
import { ReportPage } from '../pages/ReportPage'
import { KnowledgeBasePage } from '../pages/KnowledgeBasePage'
import { SettingsPage } from '../pages/SettingsPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <TasksPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'console', element: <ConsolePage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'report/:runId', element: <ReportPage /> },
      { path: 'kb', element: <KnowledgeBasePage /> },
      { path: 'settings', element: <SettingsPage /> }
    ]
  }
])

export function AppRouter() {
  return <RouterProvider router={router} />
}

