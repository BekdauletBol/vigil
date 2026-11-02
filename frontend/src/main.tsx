import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { ToastProvider } from './components/Toasts'
import { LiveProvider } from './live/LiveProvider'
import './styles/tokens.css'
import './styles/app.css'
import { PrefsProvider } from './theme/PrefsProvider'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: true } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PrefsProvider>
        <BrowserRouter>
          <ToastProvider>
            <LiveProvider>
              <App />
            </LiveProvider>
          </ToastProvider>
        </BrowserRouter>
      </PrefsProvider>
    </QueryClientProvider>
  </StrictMode>,
)
