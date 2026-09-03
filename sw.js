// ToolBox Pro — Service Worker with Auto-Update + Push Notifications
const CACHE_NAME = 'toolbox-pro-v3';
const STATIC_CACHE = 'toolbox-static-v3';
const DYNAMIC_CACHE = 'toolbox-dynamic-v3';

// Files to cache immediately
const STATIC_FILES = [
    '/',
    '/index.html',
    '/manifest.json'
];

// Install event — cache static files
self.addEventListener('install', event => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('[SW] Caching static files');
                return cache.addAll(STATIC_FILES);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event — clean old caches + notify clients of update
self.addEventListener('activate', event => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
                    .map(key => {
                        console.log('[SW] Removing old cache:', key);
                        return caches.delete(key);
                    })
            );
        }).then(() => {
            // Notify all open tabs that an update is available
            return self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({
                        type: 'SW_UPDATED',
                        message: 'New version available! Refresh to update.'
                    });
                });
            });
        }).then(() => self.clients.claim())
    );
});

// Push notification event — show notification
self.addEventListener('push', event => {
    console.log('[SW] Push received:', event.data ? event.data.text() : 'no data');
    
    let data = { title: 'ToolBox Pro', body: 'New update available!' };
    
    if(event.data){
        try {
            data = event.data.json();
        } catch(e){
            data.body = event.data.text();
        }
    }
    
    const options = {
        body: data.body,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%2309090b" width="100" height="100" rx="20"/><text y=".9em" x="10" font-size="80">🧰</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23facc15" width="100" height="100" rx="50"/><text y=".8em" x="25" font-size="60" fill="%23000">T</text></svg>',
        vibrate: [100, 50, 100],
        tag: 'toolbox-update',
        renotify: true,
        requireInteraction: false,
        actions: [
            { action: 'open', title: 'Open ToolBox Pro', icon: '🧰' },
            { action: 'dismiss', title: 'Dismiss' }
        ],
        data: {
            url: '/',
            dateOfArrival: Date.now()
        }
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'ToolBox Pro', options)
    );
});

// Notification click event
self.addEventListener('notificationclick', event => {
    console.log('[SW] Notification clicked');
    event.notification.close();
    
    if(event.action === 'dismiss') return;
    
    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then(clients => {
            // If already open, focus it
            for(const client of clients){
                if(client.url.includes(self.location.origin) && 'focus' in client){
                    client.postMessage({
                        type: 'SW_UPDATED',
                        message: event.notification.body || 'New update available!'
                    });
                    return client.focus();
                }
            }
            // Otherwise open new tab
            return self.clients.openWindow(event.notification.data.url || '/');
        })
    );
});

// Fetch event — network first, fallback to cache
self.addEventListener('fetch', event => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip external requests (CDN fonts, etc)
    if (!event.request.url.startsWith(self.location.origin)) return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Clone the response before caching
                const responseClone = response.clone();
                caches.open(DYNAMIC_CACHE).then(cache => {
                    cache.put(event.request, responseClone);
                });
                return response;
            })
            .catch(() => {
                // Network failed, serve from cache
                return caches.match(event.request).then(cached => {
                    if (cached) return cached;
                    // If it's a page request, serve the cached index
                    if (event.request.headers.get('accept').includes('text/html')) {
                        return caches.match('/index.html');
                    }
                });
            })
    );
});

// Listen for skip waiting message from page
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
