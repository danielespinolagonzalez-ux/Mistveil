// Service worker de Mistveil — juego jugable offline tras la primera carga (R5.2/B6).
// Rutas RELATIVAS al scope (el juego se sirve en subruta /Mistveil/ en GitHub Pages).
// Estrategia: navegación (HTML) network-first (para recibir actualizaciones); assets
// estáticos (js/json/fuente/sprites/audio) cache-first con refresco en segundo plano
// (stale-while-revalidate). El audio (~11 MB) NO se precachea: se cachea al usarse.
const CACHE = 'mistveil-v1';
// Shell mínimo para arrancar sin red tras la 1ª visita (el resto entra por runtime-cache).
const SHELL = [
  './', 'index.html', 'movil.html', 'manifest.json',
  'assets/fonts/Gelica-Regular.otf',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png', 'assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))); // limpia versiones viejas
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // solo mismo origen (no toca CDNs externos)

  // Navegación (HTML): network-first → cae a caché offline.
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        const c = await caches.open(CACHE); c.put(req, net.clone());
        return net;
      } catch {
        return (await caches.match(req)) || (await caches.match('movil.html')) || (await caches.match('index.html'));
      }
    })());
    return;
  }

  // Estáticos: cache-first con refresco en segundo plano.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const fetchAndCache = fetch(req).then(res => {
      if (res && res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => cached);
    return cached || fetchAndCache;
  })());
});
