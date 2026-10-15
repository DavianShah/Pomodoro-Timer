import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/app/App'
import '@/styles/tokens.css'
import { initInstallPrompt } from '@/pwa/install'
import { initServiceWorker } from '@/pwa/register'

const container = document.getElementById('root')
if (!container) throw new Error('#root element missing from index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

initServiceWorker()
initInstallPrompt()
