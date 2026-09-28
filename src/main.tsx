import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initKeycloak } from './services/keycloak'

// Resolve the Keycloak session (silent check-sso) before the first render so route guards and
// API calls can read keycloak.authenticated / keycloak.token synchronously.
initKeycloak().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
