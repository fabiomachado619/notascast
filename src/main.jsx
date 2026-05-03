import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      console.log('SW registered: ', registration);

      if (registration.waiting) {
        console.log('Service worker waiting to be activated.');
        // If there's a waiting SW, we can prompt the user to update.
        // For now, let's just log it.
      }
      if (registration.installing) {
        console.log('Service worker installing.');
      }

      // Check for updates on load
      registration.addEventListener('updatefound', () => {
        console.log('New service worker found, installing...');
      });

    } catch (registrationError) {
      console.log('SW registration failed: ', registrationError);
    }
  }
}

registerServiceWorker();


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);