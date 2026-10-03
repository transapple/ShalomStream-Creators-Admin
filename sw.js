/* ShalomStream Admin service worker
   - Saves the app page, icons and Supabase library so the app opens instantly
   - Admin data (database calls, files) is never stored: it always goes to the network */
const VER = 'ss-admin-v1';
const SHELL = ['./', './index.html', './manifest.json', './logo.png', './logo-icon.png'];
const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VER);
    await c.addAll(SHELL);
    // Extra: never block the install if the library fails to download
    await Promise.allSettled([fetch(LIB).then(r => r.ok && c.put(LIB, r))]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Opening the app: fresh page if the internet answers quickly, otherwise the saved page
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(VER);
      const net = fetch(req).then(r => { if (r.ok) cache.put('./index.html', r.clone()); return r; });
      net.catch(() => {});
      const saved = () => cache.match('./index.html', { ignoreSearch: true }).then(r => r || cache.match('./'));
      try {
        return await Promise.race([net, new Promise((_, rej) => setTimeout(rej, 4000))]);
      } catch (_) {
        return (await saved()) || net;
      }
    })());
    return;
  }

  // App files and the Supabase library: saved copy first, refreshed in the background
  if (url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith((async () => {
      const cache = await caches.open(VER);
      const hit = await cache.match(req, { ignoreVary: true });
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => hit);
      return hit || net;
    })());
  }
  // Everything else (database, uploads, media) goes straight to the network
});
