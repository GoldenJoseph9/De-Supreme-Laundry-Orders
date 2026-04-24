const CACHE_NAME = 'laundry-family-v3';
const urlsToCache = [
  '/De-Supreme-Laundry-Orders/',
  '/De-Supreme-Laundry-Orders/index.html',
  '/De-Supreme-Laundry-Orders/family-operations.html',
  '/De-Supreme-Laundry-Orders/admin-gamification.html',
  '/De-Supreme-Laundry-Orders/main.css',
  '/De-Supreme-Laundry-Orders/js/app.js',
  '/De-Supreme-Laundry-Orders/js/customer.js',
  '/De-Supreme-Laundry-Orders/js/admin.js'
];

// Install event - cache files
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching files');
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.log('[SW] Cache failed:', err))
  );
  self.skipWaiting();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Only handle requests for your app path
  if (!url.pathname.startsWith('/De-Supreme-Laundry-Orders/')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(response => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
          return response;
        });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});
