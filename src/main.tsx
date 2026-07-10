import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { startSync } from './sync'
import { useEditor } from './store'
import { renderRaster, renderSVG } from './export'
import './styles.css'

startSync()

// Debug/scripting handle (used by tests and power users in the console).
;(window as unknown as Record<string, unknown>).SC = { useEditor, renderRaster, renderSVG }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
