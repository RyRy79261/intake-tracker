// Custom service worker extensions for next-pwa
// This file is merged with the generated service worker

// Listen for SKIP_WAITING message from the app to apply updates
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
