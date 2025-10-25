// service-worker.js
// Place at site root (/) so scope covers the whole app.
// This SW does precache (app shell), runtime caching for API and assets,
// navigation fallback to offline page, and supports a skipWaiting message.

const CACHE_VERSION = 'v1';
const PRECACHE = `precache-${CACHE_VERSION}`;
const RUNTIME = `runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/', // Ensure index route is cached
  '/index.html',
  '/offline.html',
  '/styles.css',
  '/main.js',
  '/favicon.ico'
];

// Install - precache app shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

// Activate - cleanup old caches
self.addEventListener('activate', (event) => {
  const keep = [PRECACHE, RUNTIME];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => {
        if (!keep.includes(key)) return caches.delete(key);
      }))
    ).then(() => self.clients.claim())
  );
});

// Listen for a message to trigger skipWaiting from the page
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Basic fetch handler with strategies:
// - Navigation: network-first, fallback to cache -> offline page
// - API (/api/): network-first with runtime cache fallback
// - Static assets: cache-first (fast)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests by default
  if (url.origin !== self.location.origin) return;

  // Navigation requests (SPA)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // update runtime cache with fresh HTML
          const copy = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('/offline.html'))
        )
    );
    return;
  }

  // API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME).then((cache) => {
            // cache API responses for offline reads
            if (request.method === 'GET' && response.ok) cache.put(request, copy);
          });
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets - cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Only cache GET and successful responses
        if (request.method === 'GET' && response && response.status === 200) {
          const copy = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => {
        // If the request is for an image, optional: return a placeholder image from cache
        if (request.destination === 'image') {
          return caches.match('/icons/icon-192.png');
        }
        // Last resort: offline page for navigation already handled above
        return caches.match('/offline.html');
      });
    })
  );
});
