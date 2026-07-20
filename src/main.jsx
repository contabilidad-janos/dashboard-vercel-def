import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import AuthGate from './auth/AuthGate.jsx'

// AuthGate renders nothing until the Supabase session is resolved, so the
// dashboard's data effects never fire without a JWT. With VITE_AUTH_ENABLED
// unset it is a pass-through and the app behaves exactly as before.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
)
