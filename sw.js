const C = 'gymtrk-v306';
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(C).then(c => c.addAll(['./', './index.html', './manifest.json'].map(x => new Request(x, { cache: 'reload' })))
      // v295 · las fichas del catálogo de sustancias: con 'no-cache' el servidor contesta 304 si no cambiaron; si faltan, no frena la versión
      .then(() => c.add(new Request('./substances.json', { cache: 'no-cache' })).catch(() => {})))
      .then(() => self.skipWaiting()).catch(() => {})
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.map(k => k !== C ? caches.delete(k) : null)))
      .catch(() => {})   // v293: si la caché falla (modo privado, almacenamiento lleno), igual se toma el control
      .then(() => self.clients.claim())
      // v293: una pestaña que se quedó abierta en ?atajo=1 con una versión vieja apunta a un archivo que ya no existe (o lo bajaría como
      // .html): al tomar el control, se recarga. Solo esa página; la app no se toca.
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(cs => cs.forEach(c => { try { if (/[?&]atajo=1\b/.test(new URL(c.url).search) && c.navigate) c.navigate(c.url).catch(() => {}); } catch (_) {} }))
      .catch(() => {})
  );
});
// allow the page to tell a waiting worker to activate immediately
// v293: `ver` = la página pregunta qué versión la controla. Un sw.js anterior no contesta: así sabe que todavía es el viejo.
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  else if (e.data === 'ver' && e.ports && e.ports[0]) e.ports[0].postMessage(C);
});
// network-first for same-origin (always fresh when online; cache fallback offline).
// v245: cache 'no-cache' = revalida SIEMPRE con el servidor (304 si no cambió). GitHub Pages manda max-age=600 y el
// fetch() normal servía el index.html viejo hasta 10 min después de cada deploy ("le doy y no responde" tras v244).
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // v293 · el Atajo (.shortcut) NO se contesta desde aquí. WebKit le pone text/html a toda NAVEGACIÓN que un service worker
  // contesta con application/octet-stream (ServiceWorkerFetch.cpp: "we set it to text/html to pass more service worker WPT
  // tests"), y Safari guardaba el atajo como "….shortcut.html" (el dueño: "no sale para atajos y sigue en .html"). Sin
  // respondWith lo baja Safari directo de la red, con su tipo. `?html=1` conserva el camino anterior a propósito
  // ([bajar como antes] en ?atajo=1).
  const atajo = /\.shortcut$/i.test(u.pathname);
  if (atajo && !u.searchParams.has('html')) return;
  if (e.request.method === 'GET' && u.origin === location.origin) {
    e.respondWith(
      fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(resp => {
        // v254: la clave de caché va SIN query — cada '?v=253' guardaba su propia copia de ~870 KB y
        // eso consumía el cupo del origen (el mismo del que vive localStorage).
        // v261: solo se guarda una respuesta buena (antes un 404/5xx pasajero de un deploy se guardaba y pisaba la copia
        // buena: sin red, la app o el guardia del estudio salían rotos).
        if (resp.ok && resp.type === 'basic' && !atajo) { try { const cc = resp.clone(); const key = u.origin + u.pathname; caches.open(C).then(c => c.put(key, cc)); } catch (_) {} }
        return resp;
      // v261: index.html solo responde a una NAVEGACIÓN sin red; un script o un JSON que falta devuelve error (antes
      // recibía el HTML de la app y fallaba como JavaScript).
      // v288: y solo a la página de la app ('/' o index.html). Un archivo que falla (el .shortcut del Atajo) da error, no el HTML de la app:
      // el dueño lo bajó como "el HTML" y Archivos ya no lo reconocía como atajo.
      }).catch(() => caches.match(u.origin + u.pathname).then(r => r || (e.request.mode === 'navigate' && /(\/|\/index\.html)$/.test(u.pathname) ? caches.match('./index.html') : Response.error())))
    );
  }
});
