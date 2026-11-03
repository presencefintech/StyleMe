/* Service worker StyleMe : rend l'app installable et affiche une page de secours hors ligne.
   Volontairement minimal : jamais de cache pour l'API, les photos ou les URLs signées (données privées, durée de vie courte). */
const VERSION = "styleme-v3";
/* En développement (localhost), Next sert les fichiers /_next/static/ sans hash dans le nom : les garder en cache ferait
   afficher d'anciennes versions de l'app. Le cache d'abord ne vaut que pour la production. */
const IS_DEV = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API, stockage signé : toujours le réseau

  // Pages : réseau d'abord, page de secours si hors ligne.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Fichiers versionnés (hash dans le nom) et icônes : cache d'abord.
  if (!IS_DEV && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa-icon/"))) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
