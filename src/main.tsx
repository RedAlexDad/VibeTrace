import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import './index.css'
import 'react-tooltip/dist/react-tooltip.css'
import App from './App'
import { ErrorBoundary } from './ErrorBoundary'
import { persistor, store } from './store'

const el = document.getElementById('root')
if (!el) {
  throw new Error('#root element missing — check index.html')
}

createRoot(el).render(
  <StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </PersistGate>
    </Provider>
  </StrictMode>,
)
