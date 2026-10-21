const CACHE_NAME = 'gmrs-shell-v2';
const SHELL_URLS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only handle same-origin requests; let cross-origin (media) hit the network
  if (url.origin !== self.location.origin) return;

  // Never cache live data. The Base44 SDK calls same-origin /api/* and
  // /functions/* endpoints, and serving those from cache made the app show
  // stale user, role and list data.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/functions/')) return;

  // Hashed build assets never change for a given URL, so cache-first is safe.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }))
    );
    return;
  }

  // Everything else (the HTML shell, manifest, icons): network first so a new
  // deploy is picked up immediately; fall back to cache only when offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) =>
        cached || (request.mode === 'navigate' ? caches.match('/index.html') : Response.error())
      ))
  );
});
