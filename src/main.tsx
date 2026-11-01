import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Purge any outdated Service Worker caches to ensure fresh Vite modules
if ('caches' in window) {
  caches.keys().then((names) => {
    names.forEach((name) => {
      if (name !== 'tabarestan-static-v4') {
        caches.delete(name);
      }
    });
  }).catch(() => {});
}

// Register Service Worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (registration) => {
        console.log('✅ PWA ServiceWorker registered with scope:', registration.scope);
        registration.update().catch(() => {});
      },
      (error) => {
        console.error('❌ ServiceWorker registration failed:', error);
      }
    );
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

