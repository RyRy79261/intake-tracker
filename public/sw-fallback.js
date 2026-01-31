/**
 * Fallback Service Worker for Intake Tracker
 * 
 * This minimal service worker provides basic notification support
 * when the main next-pwa generated service worker (sw.js) is not available.
 * 
 * Features:
 * - Handles SKIP_WAITING messages for updates
 * - Displays push notifications
 * - Handles notification clicks
 */

// Version for cache busting if needed
const SW_VERSION = '1.0.0';

// Install event - activate immediately
self.addEventListener('install', (event) => {
  console.log('[SW Fallback] Installing version:', SW_VERSION);
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate event - claim all clients
self.addEventListener('activate', (event) => {
  console.log('[SW Fallback] Activating version:', SW_VERSION);
  event.waitUntil(
    // Claim all clients so the SW is active immediately
    self.clients.claim()
  );
});

// Message handler - supports SKIP_WAITING for manual updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW Fallback] Received SKIP_WAITING message');
    self.skipWaiting();
  }
});

// Push notification handler
// Note: badge is omitted because Android requires monochrome PNG and SVG renders as white circle
self.addEventListener('push', (event) => {
  console.log('[SW Fallback] Push received');
  
  let data = {
    title: 'Intake Tracker',
    body: 'You have a notification',
    icon: '/icons/icon-192.svg',
  };
  
  // Try to parse push data if available
  if (event.data) {
    try {
      const pushData = event.data.json();
      data = { ...data, ...pushData };
    } catch (e) {
      // If not JSON, try text
      const text = event.data.text();
      if (text) {
        data.body = text;
      }
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      tag: data.tag || 'intake-tracker-notification',
      requireInteraction: data.requireInteraction || false,
      data: data.data || {},
    })
  );
});

// Notification click handler - open the app
self.addEventListener('notificationclick', (event) => {
  console.log('[SW Fallback] Notification clicked');
  
  event.notification.close();
  
  // Open the app or focus existing window
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if app is already open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if not already open
        if (self.clients.openWindow) {
          return self.clients.openWindow('/');
        }
      })
  );
});

// Notification close handler
self.addEventListener('notificationclose', (event) => {
  console.log('[SW Fallback] Notification closed');
});

// Fetch handler - simple passthrough (no caching in fallback)
self.addEventListener('fetch', (event) => {
  // Just pass through all requests - no caching in fallback SW
  // The main sw.js from next-pwa handles caching
  event.respondWith(fetch(event.request));
});

console.log('[SW Fallback] Service worker loaded, version:', SW_VERSION);
