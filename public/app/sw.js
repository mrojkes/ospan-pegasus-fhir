/* =========================================================
   SERVICE WORKER — App Asociado OSPAN
   Estrategia:
     - App shell (HTML/CSS/JS/imágenes): cache-first con
       actualización en segundo plano (stale-while-revalidate).
     - /api/app/*: SIEMPRE red (datos clínicos y de padrón nunca
       se sirven desde cache). Si no hay red, responde 503 JSON
       para que la UI muestre su mensaje de "sin conexión".
   Subir CACHE_VERSION en cada deploy que cambie el shell.
   ========================================================= */
// Subir este número en cada despliegue que cambie el shell (HTML/CSS/JS):
// si no, el navegador sigue sirviendo la versión vieja desde la caché.
const CACHE_VERSION = "ospan-app-v2";
const SHELL = [
  "./", "./index.html", "./afil-login.html", "./afil-home.html", "./afil-credencial.html",
  "./afil-buscar.html", "./afil-perfil.html", "./afil-contrato.html", "./afil-terminos.html",
  "./afil-resultados.html", "./afil-resultado-detalle.html",
  "./manifest.webmanifest",
  "./assets/css/variables.css", "./assets/css/styles.css", "./assets/css/utilities.css", "./assets/css/resultados.css",
  "./assets/js/mock-data.js", "./assets/js/api-client.js", "./assets/js/tab-bar.js", "./assets/js/modal-utils.js",
  "./assets/js/app.js", "./assets/js/screen-login.js", "./assets/js/screen-onboarding.js", "./assets/js/screen-credencial.js",
  "./assets/js/screen-buscar.js", "./assets/js/screen-perfil.js", "./assets/js/screen-contrato.js",
  "./assets/js/resultados-utils.js", "./assets/js/screen-resultados.js", "./assets/js/screen-resultado-detalle.js",
  "./assets/js/pwa.js", "./assets/vendor/qrcode.min.js",
  "./assets/img/icon-favicon.png", "./assets/img/icon-512.png", "./assets/img/ospan-logo.png", "./assets/img/onboarding-app-Ospan.png",
  "./assets/img/credencial-base-plan100.png", "./assets/img/credencial-base-plan200.png", "./assets/img/credencial-base-plan300.png",
  "./assets/img/credencial-base-plan400.png", "./assets/img/credencial-base-plan410.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => Promise.allSettled(SHELL.map((u) => cache.add(u)))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Datos: solo red.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req).catch(() => new Response(JSON.stringify({ error: "Sin conexión" }), { status: 503, headers: { "Content-Type": "application/json" } }))
    );
    return;
  }

  // Shell: stale-while-revalidate.
  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      return cached || (await network) || new Response("Sin conexión", { status: 503 });
    })
  );
});
