/* eslint-disable no-restricted-globals */

const STATIC_CACHE_NAME = 'notascat-static-v10';
const DYNAMIC_CACHE_NAME = 'notascat-dynamic-v10';

const STATIC_FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/notascat-180.png',
  '/icons/notascat-192.png',
  '/icons/notascat-512.png'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching static assets');
        return cache.addAll(STATIC_FILES_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== STATIC_CACHE_NAME && key !== DYNAMIC_CACHE_NAME) {
          console.log('[SW] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Network-only for Supabase API calls
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(request));
    return;
  }

  // Cache-first for local assets
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then(networkResponse => {
          return caches.open(DYNAMIC_CACHE_NAME).then(cache => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // Default fetch for other requests
  event.respondWith(fetch(request));
});


self.addEventListener('sync', (event) => {
  if (event.tag === 'notascat-sync') {
    console.log('[SW] Background sync triggered for notascat-sync');
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
        if (clients && clients.length > 0) {
            clients[0].postMessage({ type: 'SYNC_REQUEST' });
            return Promise.resolve();
        }
      })
    );
  }
  if (event.tag === 'notascat-notification-check') {
    console.log('[SW] Background sync for notification check');
    event.waitUntil(triggerNotificationCheck());
  }
});

self.addEventListener('push', function(event) {
  const data = event.data.json();
  console.log('[SW] Push Received.');
  console.log(`[SW] Push data: "${data.title}"`);

  const title = data.title;
  const options = {
    body: data.body,
    icon: '/icons/notascat-192.png',
    badge: '/icons/notascat-512.png'
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notification click Received.');
  event.notification.close();
  event.waitUntil(
    self.clients.openWindow('/financas')
  );
});

async function triggerNotificationCheck() {
    const clientsArr = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    if (clientsArr && clientsArr.length > 0) {
        clientsArr[0].postMessage({ type: 'NOTIFICATION_CHECK_REQUEST' });
    } else {
        console.log("[SW] No active client to send notification check request to.");
    }
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'notascat-notification-check') {
    console.log('[SW] Periodic sync for notification check');
    event.waitUntil(triggerNotificationCheck());
  }
});