import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import 'react-tooltip/dist/react-tooltip.css'
import App from '@/app/App'

const el = document.getElementById('root')
if (!el) {
  throw new Error('#root element missing — check index.html')
}

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
