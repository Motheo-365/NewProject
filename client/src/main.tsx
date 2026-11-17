import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { migrateLegacyApiKey } from './services/apiKeyCookie'
import './index.css'
import App from './App.tsx'

migrateLegacyApiKey()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
