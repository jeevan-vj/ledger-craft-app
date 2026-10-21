import { createRoot } from 'react-dom/client'
import { AppErrorBoundary } from '@/components/errors/AppErrorBoundary'
import { initSentry } from '@/lib/sentry/init'
import App from './App.tsx'
import './index.css'

void initSentry()

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
)
