const CACHE_NAME = 'mvs-songs-v3';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Always fetch fresh from network for API and songs.json
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  if (req.url.includes('/api/') || req.url.includes('songs.json') || req.url.includes('days.json')) {
    e.respondWith(fetch(req));
    return;
  }

  e.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
