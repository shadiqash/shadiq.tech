import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/portfolio.css'
import Portfolio3D from './Portfolio3D.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Portfolio3D />
  </StrictMode>,
)
