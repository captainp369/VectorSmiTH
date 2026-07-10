import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { startSync } from './sync'
import { getScene, useEditor } from './store'
import { renderRaster, renderSVG } from './export'
import './styles.css'

import { loadAssetFonts } from './fonts'

startSync()
loadAssetFonts()

// Debug/scripting handle (used by tests and power users in the console).
;(window as unknown as Record<string, unknown>).SC = { useEditor, getScene, renderRaster, renderSVG }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
