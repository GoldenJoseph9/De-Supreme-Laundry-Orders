// ============================================================
// SERVICE WORKER — De Supreme Laundry Orders
// Cache version — bump this number when you update files
// ============================================================
const CACHE_NAME = 'de-supreme-laundry-v4';

// Files to cache on install (for offline loading)
const ASSETS = [
    './',
    './index.html',
    './family-operations.html',
    './admin-gamification.html',
    './main.css',
    './mafia-theme.css',
    './icon.png',
    './manifest.json',
    './js/app.js',
    './js/customer.js',
    './js/admin.js',
    './gamejs/gamification.js',
    './gamejs/marketing-campaigns.js',
    './gamejs/vault-rewards.js',
    './gamejs/interactive-elements.js',
    './game/rank-system.js'
];

// ============================================================
// INSTALL — cache assets
// ============================================================
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 Caching app assets');
                // Best-effort caching — don't fail whole install if one asset 404s
                return Promise.all(
                    ASSETS.map(url =>
                        cache.add(url).catch(err =>
                            console.warn(`⚠️ Failed to cache ${url}:`, err.message)
                        )
                    )
                );
            })
            .then(() => self.skipWaiting())
    );
});

// ============================================================
// ACTIVATE — clean up old caches
// ============================================================
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker activating...');
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => {
                        console.log('🗑️ Deleting old cache:', key);
                        return caches.delete(key);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// ============================================================
// FETCH — network-first for app files, cache-fallback when offline
// Skip Firebase / CDN requests (they have their own caching)
// ============================================================
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    // Skip Firebase, gstatic, CDN, external APIs
    if (
        url.hostname.includes('firebase') ||
        url.hostname.includes('gstatic') ||
        url.hostname.includes('googleapis') ||
        url.hostname.includes('google') ||
        url.hostname.includes('cdnjs') ||
        url.hostname.includes('jsdelivr') ||
        url.hostname.includes('cloudflare')
    ) {
        return;
    }

    // Skip non-HTTP requests
    if (!url.protocol.startsWith('http')) return;

    const isAppFile =
        url.pathname.endsWith('.html') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.json') ||
        url.pathname.endsWith('.jpg') ||
        url.pathname.endsWith('.png') ||
        url.pathname === '/' ||
        url.pathname.endsWith('/');

    if (isAppFile) {
        // Network-first for app files (so updates apply when online)
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response && response.status === 200) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Offline — serve from cache
                    console.log('📴 Offline — serving from cache:', url.pathname);
                    return caches.match(event.request).then((cached) => {
                        if (cached) return cached;
                        // Fallback to index for navigation
                        if (event.request.mode === 'navigate') {
                            return caches.match('./index.html');
                        }
                        return new Response('Offline — resource not cached', {
                            status: 503,
                            statusText: 'Offline',
                            headers: new Headers({ 'Content-Type': 'text/plain' })
                        });
                    });
                })
        );
        return;
    }

    // For everything else — cache-first
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) return response;
                return fetch(event.request).then((response) => {
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                    return response;
                });
            })
    );
});

// ============================================================
// MESSAGE — allow app to trigger skipWaiting
// ============================================================
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

console.log('🔧 Service Worker loaded');
