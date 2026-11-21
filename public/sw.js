// Minimal pass-through service worker for installability on browsers that require one.
// Performs no caching and passes every request straight to the network.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // No caching: browser handles every request directly over the network.
})
