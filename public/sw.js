// App-shell cache so /player keeps loading with zero network. Video files
// are handled separately, in IndexedDB, by the player page itself — this
// worker only ever touches same-origin app assets (HTML/JS/CSS).
//
// Bump CACHE_NAME on any change to this file — activate() below deletes
// every cache that doesn't match, which is what forces a tablet stuck on an
// old build to drop it instead of serving it forever.
const CACHE_NAME = "smato-shell-v2";
const SHELL_URLS = ["/player", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never intercept Supabase/video requests
  if (url.pathname.startsWith("/admin")) return; // admin always needs a live network anyway

  // The page itself: always prefer a fresh copy when online, so a new
  // deploy reaches the tablet on its next load instead of the tablet being
  // stuck replaying whatever build happened to be cached first. Falls back
  // to the cached shell only when there's genuinely no network.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Everything else (JS/CSS chunks) is content-hashed by the build, so a
  // cached copy is always the right copy — cache-first, refreshed quietly
  // in the background for whatever comes after it.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
