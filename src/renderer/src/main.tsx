import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const rootEl = document.getElementById('root')
// Remove fallback loading indicator (shown before React mounts)
const fallback = document.getElementById('orchflow-loading')
if (fallback) fallback.remove()

if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
