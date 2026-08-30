// Two caches, two different lifetimes:
//   - smato-shell-*  the app's own HTML/JS/CSS — bump the version and old
//     ones are dropped, so a tablet stuck on a broken build gets unstuck.
//   - smato-ads-v1   downloaded ad videos/images, written directly by the
//     player page (lib/adCache.js) — this worker only *serves* them, never
//     wipes them. Ads survive an app update; re-downloading a video every
//     time this file changes would defeat the whole point of caching them.
const SHELL_CACHE_NAME = "smato-shell-v3";
const AD_CACHE_NAME = "smato-ads-v1";
const AD_PATH_PREFIX = "/__ad-cache__/";
const SHELL_URLS = ["/player", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("smato-shell-") && k !== SHELL_CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// <video> loads its source in byte ranges (Range: bytes=...), not as one
// request — that's how it seeks and starts playback before the whole file
// is in. Cache.match() ignores that header and always hands back the full
// cached response; some engines (this is what was actually breaking
// playback) treat a full 200 answering a ranged request as unplayable and
// give up with "no supported sources." Slice the cached body ourselves and
// answer with a real 206 when a range was asked for.
async function serveAd(request) {
  const cache = await caches.open(AD_CACHE_NAME);
  const cached = await cache.match(request.url);
  if (!cached) return new Response("Not found", { status: 404 });

  const contentType = cached.headers.get("Content-Type") || "application/octet-stream";
  const rangeHeader = request.headers.get("range");
  if (!rangeHeader) {
    const blob = await cached.blob();
    return new Response(blob, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(blob.size),
        "Accept-Ranges": "bytes",
      },
    });
  }

  const blob = await cached.blob();
  const size = blob.size;
  const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
  const start = match?.[1] ? parseInt(match[1], 10) : 0;
  const end = Math.min(match?.[2] ? parseInt(match[2], 10) : size - 1, size - 1);

  if (Number.isNaN(start) || start > end || start >= size) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }

  const chunk = blob.slice(start, end + 1);
  return new Response(chunk, {
    status: 206,
    headers: {
      "Content-Type": contentType,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(chunk.size),
      "Accept-Ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never intercept Supabase requests
  if (url.pathname.startsWith("/admin")) return; // admin always needs a live network anyway

  // Downloaded ads: pure cache read, range-aware. The page writes these
  // directly via the Cache Storage API when it downloads an ad — nothing
  // to fetch or fall back to here, since a playlist never points at an ad
  // it hasn't already downloaded.
  if (url.pathname.startsWith(AD_PATH_PREFIX)) {
    event.respondWith(serveAd(request));
    return;
  }

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
            caches.open(SHELL_CACHE_NAME).then((cache) => cache.put(request, clone));
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
            caches.open(SHELL_CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
