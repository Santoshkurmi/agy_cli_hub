import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Disabled StrictMode to prevent React double-mount dev cycle and duplicate API calls
createRoot(document.getElementById('root')).render(
  <App />
)
