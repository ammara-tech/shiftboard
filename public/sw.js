/*
  ShiftBoard's service worker: lets the app open with no signal (e.g. in the back of a shop).

  - Pages: try the network first, so you always get the newest version when online.
    With no signal, use the copy saved last time (or the home page's copy).
  - Next.js's built files (/_next/static/...) never change once built, so they're
    served from the saved copy first. Fonts and icons too.
  - Anything else (Firebase, Google sign-in) goes straight to the network; Firestore
    keeps its own offline copy of the rota.
  Bumping VERSION clears the old saved copies.
*/
const VERSION = "shiftboard-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(["/", "/manifest.webmanifest", "/icon-192.png"])).catch(() => {}));
  self.skipWaiting();
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
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/"))),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|woff2?|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});
