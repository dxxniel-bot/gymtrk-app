const C = 'gymtrk-v292';
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(C).then(c => c.addAll(['./', './index.html', './manifest.json'].map(x => new Request(x, { cache: 'reload' }))))
      .then(() => self.skipWaiting()).catch(() => {})
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.map(k => k !== C ? caches.delete(k) : null)))
      .then(() => self.clients.claim())
  );
});
// allow the page to tell a waiting worker to activate immediately
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
// network-first for same-origin (always fresh when online; cache fallback offline).
// v245: cache 'no-cache' = revalida SIEMPRE con el servidor (304 si no cambió). GitHub Pages manda max-age=600 y el
// fetch() normal servía el index.html viejo hasta 10 min después de cada deploy ("le doy y no responde" tras v244).
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method === 'GET' && u.origin === location.origin) {
    e.respondWith(
      fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(resp => {
        // v254: la clave de caché va SIN query — cada '?v=253' guardaba su propia copia de ~870 KB y
        // eso consumía el cupo del origen (el mismo del que vive localStorage).
        // v261: solo se guarda una respuesta buena (antes un 404/5xx pasajero de un deploy se guardaba y pisaba la copia
        // buena: sin red, la app o el guardia del estudio salían rotos).
        if (resp.ok && resp.type === 'basic') { try { const cc = resp.clone(); const key = u.origin + u.pathname; caches.open(C).then(c => c.put(key, cc)); } catch (_) {} }
        return resp;
      // v261: index.html solo responde a una NAVEGACIÓN sin red; un script o un JSON que falta devuelve error (antes
      // recibía el HTML de la app y fallaba como JavaScript).
      // v288: y solo a la página de la app ('/' o index.html). Un archivo que falla (el .shortcut del Atajo) da error, no el HTML de la app:
      // el dueño lo bajó como "el HTML" y Archivos ya no lo reconocía como atajo.
      }).catch(() => caches.match(u.origin + u.pathname).then(r => r || (e.request.mode === 'navigate' && /(\/|\/index\.html)$/.test(u.pathname) ? caches.match('./index.html') : Response.error())))
    );
  }
});
