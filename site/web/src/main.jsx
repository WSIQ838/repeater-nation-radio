import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { startUpdateWatcher } from '@/lib/appUpdate'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

startUpdateWatcher()

// Register service worker for installable PWA + offline shell caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}