import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from '@/app/ErrorBoundary'
import { persistor, store } from '@/app/store'
import WorkspacePage from '@/pages/workspace/ui/WorkspacePage'
import WorkspacesPage from '@/pages/workspaces/ui/WorkspacesPage'

export default function App() {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <ErrorBoundary>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<WorkspacePage />} />
              <Route path="/workspaces" element={<WorkspacesPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ErrorBoundary>
      </PersistGate>
    </Provider>
  )
}
