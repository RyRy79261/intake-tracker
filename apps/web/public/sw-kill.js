// Self-destructing service worker — served at the legacy /sw.js path via a
// next.config.mjs rewrite. Retires the old next-pwa worker that previously
// lived there (the active worker is now Serwist's, at /serwist/sw.js): it
// clears all caches and unregisters itself so stale-cache loops can't serve
// old HTML before client JS runs.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
  );
});
