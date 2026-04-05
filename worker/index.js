// Custom service worker extensions for next-pwa
// This file is merged with the generated service worker

// Listen for SKIP_WAITING message from the app to apply updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Handle incoming push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icons/icon-192.svg',
    tag: data.tag,
    requireInteraction: true,
    data: { url: data.url || '/medications?tab=schedule' },
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Handle notification click — navigate to medications schedule
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/medications?tab=schedule';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Try to focus an existing medications window
        for (const client of windowClients) {
          if (client.url.includes('/medications') && 'focus' in client) {
            return client.focus().then((focused) => {
              if ('navigate' in focused) {
                return focused.navigate(url);
              }
            });
          }
        }
        // No existing window — open a new one
        return clients.openWindow(url);
      })
  );
});
