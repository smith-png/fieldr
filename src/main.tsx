import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initRegistrationStatusStore} from './lib/registrationStatusStore';

async function cleanupLegacyServiceWorkers(): Promise<void> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      typeof navigator.serviceWorker.getRegistrations === 'function'
    ) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map((registration) =>
          registration.unregister().catch(() => false)
        )
      );
    }
  } catch {
    // Ignore service worker cleanup errors in restricted environments
  }

  try {
    if (
      typeof window !== 'undefined' &&
      'caches' in window &&
      typeof window.caches.keys === 'function'
    ) {
      const cacheKeys = await window.caches.keys();
      await Promise.all(
        cacheKeys.map((key) => window.caches.delete(key).catch(() => false))
      );
    }
  } catch {
    // Ignore Cache Storage cleanup errors in restricted environments
  }
}

void cleanupLegacyServiceWorkers();
initRegistrationStatusStore();

createRoot(document.getElementById('root')!).render(<App />);
