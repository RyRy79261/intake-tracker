// Self-destructing service worker — served on non-production deploys via
// next.config.js rewrite to evict stale Workbox caches left by previous builds.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
  );
});
