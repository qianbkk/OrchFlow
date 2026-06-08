import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

console.log('[main.tsx] React entry point executing')
const rootEl = document.getElementById('root')
console.log('[main.tsx] #root element:', rootEl ? 'found' : 'NOT FOUND')

// Remove fallback loading indicator
const fallback = document.getElementById('orchflow-loading')
if (fallback) fallback.remove()

if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
  console.log('[main.tsx] React rendered successfully')
} else {
  console.error('[main.tsx] FATAL: #root element not found!')
}
