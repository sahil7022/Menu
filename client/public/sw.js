// Hawres service worker: shows push notifications and opens the right page when tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Hawres', body: event.data && event.data.text() }; }
  const tag = data.tag || 'hawres-' + Date.now();     // renotify needs a tag, or showNotification throws
  event.waitUntil(self.registration.showNotification(data.title || 'Hawres', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag,
    renotify: true,
    silent: false,                                   // play the phone's notification sound
    requireInteraction: !!data.important,            // "ready" / "new order" stay until tapped
    vibrate: data.important ? [400, 150, 400, 150, 400] : [200, 100, 200],
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).pathname === new URL(url).pathname) { await w.focus(); w.navigate?.(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});
