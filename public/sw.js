/**
 * Tabarestan Tile & Brick PWA Service Worker
 * Secure Static-Only Caching Strategy
 * 
 * Security & Caching Rules:
 * 1. NEVER cache authenticated API responses.
 * 2. Exclude /api/* by default unless explicitly allowed.
 * 3. Cache ONLY static assets (HTML, CSS, JS, Fonts, Images, Manifest).
 * 4. Preserve offline functionality for frontend resources with offline fallback.
 * 5. Automatically purge all legacy or sensitive API caches on activation.
 */

const CACHE_VERSION = 'tabarestan-static-v4';
const STATIC_CACHE_NAME = CACHE_VERSION;

// Core static assets required for offline application shell
const STATIC_PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/logo.png',
  '/pwa-192.png',
  '/pwa-512.png',
  '/pwa-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon.png',
  '/favicon.ico'
];

// Explicit whitelist of allowed public API paths that can be cached.
// By default, this list is empty — ALL /api/* requests are strictly excluded and never cached.
const EXPLICITLY_ALLOWED_API_PATHS = [];

/**
 * Checks if a URL points to an API endpoint
 */
function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

/**
 * Checks if an API URL is explicitly whitelisted for caching
 */
function isAllowedApi(url) {
  if (EXPLICITLY_ALLOWED_API_PATHS.length === 0) return false;
  return EXPLICITLY_ALLOWED_API_PATHS.some((path) => {
    if (path instanceof RegExp) return path.test(url.pathname);
    return url.pathname === path;
  });
}

/**
 * Checks if a request carries authentication credentials or tokens
 */
function isAuthenticatedRequest(request) {
  if (request.headers.has('authorization')) return true;
  if (request.headers.has('x-auth-token')) return true;
  if (request.credentials === 'include') return true;
  return false;
}

/**
 * Checks if a request is a Vite dev-server artifact or dynamic module.
 * In development, Vite serves hot modules, dynamic deps, and source files that MUST NEVER be cached.
 */
function isDevOrViteRequest(url) {
  const pathname = url.pathname;
  return (
    pathname.startsWith('/@') ||
    pathname.includes('/node_modules/') ||
    pathname.includes('/.vite/') ||
    pathname.startsWith('/src/') ||
    url.searchParams.has('v') ||
    url.searchParams.has('t')
  );
}

/**
 * Determines whether a URL / request represents a static asset
 */
function isStaticAsset(url, request) {
  // Exclude all API requests and Vite dev artifacts immediately
  if (isApiRequest(url) || isDevOrViteRequest(url)) return false;

  // Navigation to HTML pages
  if (request.mode === 'navigate') return true;
  if (request.headers.get('accept')?.includes('text/html')) return true;

  const pathname = url.pathname.toLowerCase();

  // Root and well-known static paths
  if (pathname === '/' || pathname === '/index.html' || pathname === '/manifest.json') return true;

  // External static assets (e.g., Google Web Fonts)
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    return true;
  }

  // Static file extensions
  const staticExtensions = /\.(js|mjs|css|png|jpg|jpeg|svg|ico|webp|gif|woff|woff2|ttf|eot|json|webmanifest)$/i;
  if (staticExtensions.test(pathname)) return true;

  return false;
}

// 1. Install Event: Pre-cache essential frontend static shell & skip waiting
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching static assets for offline shell');
        return cache.addAll(STATIC_PRECACHE_URLS);
      })
      .catch((err) => {
        console.warn('[SW] Failed to pre-cache some static assets:', err);
      })
  );
});

// 2. Activate Event: Purge old caches and immediately remove any sensitive API or stale Vite caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete any cache that is not the current static cache
          if (cacheName !== STATIC_CACHE_NAME) {
            console.log('[SW] Purging outdated or sensitive cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Handle requests with secure routing
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-HTTP(S) requests (chrome-extension, data URIs, etc.)
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Non-GET requests: bypass service worker completely (no caching)
  if (event.request.method !== 'GET') {
    return;
  }

  // CRITICAL: Vite development server artifacts, dynamic source modules, and node_modules must NEVER be cached
  if (isDevOrViteRequest(url)) {
    return;
  }

  // --- REQUIREMENT 1 & 2: API Endpoints ---
  // Exclude /api/* by default. Never cache authenticated responses.
  if (isApiRequest(url)) {
    // If not explicitly allowed OR if request is authenticated: Network-Only, NEVER touch CacheStorage
    if (!isAllowedApi(url) || isAuthenticatedRequest(event.request)) {
      event.respondWith(
        fetch(event.request).catch(() => {
          // Offline fallback: Return a 503 response without saving anything into cache
          return new Response(
            JSON.stringify({
              error: 'ارتباط با سرور برقرار نشد. دستگاه در حالت آفلاین است.',
              offline: true
            }),
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'no-store, no-cache, must-revalidate, private'
              }
            }
          );
        })
      );
      return;
    }
  }

  // --- REQUIREMENT 3 & 4: Static Assets & Navigation ---
  // Cache ONLY static assets, and preserve offline functionality for frontend resources.
  if (isStaticAsset(url, event.request)) {
    // Navigation requests (HTML pages): Network-First with fallback to cached /index.html
    if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
      event.respondWith(
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const responseToCache = networkResponse.clone();
              caches.open(STATIC_CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
            }
            return networkResponse;
          })
          .catch(() => {
            // Offline fallback: Return cached HTML or cached /index.html
            return caches.match(event.request).then((cachedResponse) => {
              return cachedResponse || caches.match('/index.html') || caches.match('/');
            });
          })
      );
      return;
    }

    // Static sub-resources (JS, CSS, images, fonts, icons, manifest):
    // Stale-While-Revalidate: Return cached copy immediately for instant offline loading,
    // and update cache in background when online.
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (
              networkResponse &&
              networkResponse.status === 200 &&
              (networkResponse.type === 'basic' || networkResponse.type === 'cors') &&
              !isApiRequest(url) &&
              !isDevOrViteRequest(url)
            ) {
              const responseToCache = networkResponse.clone();
              caches.open(STATIC_CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch((err) => {
            // If offline and not in cache, log warning
            if (!cachedResponse) {
              console.warn('[SW] Offline and static resource not cached:', url.pathname);
            }
          });

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // All other unclassified requests: Network-Only (do not cache)
});
