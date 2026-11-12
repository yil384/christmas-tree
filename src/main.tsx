import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import SeasonalEntry from './SeasonalEntry.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SeasonalEntry />
  </StrictMode>,
)
