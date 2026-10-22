import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist/index.css';
import { AuthProvider } from './auth/AuthProvider';
import App from './App';
import { LocalSessionBoundary } from './auth/LocalSessionBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocalSessionBoundary>
    <AuthProvider>
      <App />
    </AuthProvider>
    </LocalSessionBoundary>
  </StrictMode>,
);
