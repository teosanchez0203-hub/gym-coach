const CACHE = "gym-coach-v5";
const FILES = [
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/data.js",
  "./js/db.js",
  "./js/backup.js",
  "./js/rules.js",
  "./js/coach.js",
  "./js/ai.js",
  "./icons/icon-180.png",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('gym-coach-') && k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, {ignoreSearch: true}).then(cached => cached || fetch(e.request).catch(error => {
      if (e.request.mode === 'navigate') return caches.match('./index.html');
      throw error;
    }))
  );
});
