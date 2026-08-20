import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import { ErrorBoundary } from '@/app/ErrorBoundary'
import { persistor, store } from '@/app/store'
import WorkspacePage from '@/pages/workspace/ui/WorkspacePage'

export default function App() {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <ErrorBoundary>
          <WorkspacePage />
        </ErrorBoundary>
      </PersistGate>
    </Provider>
  )
}
