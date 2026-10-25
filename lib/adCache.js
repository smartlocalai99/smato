// Offline ad storage, via the Cache Storage API instead of IndexedDB +
// blob: URLs. A <video src="blob:..."> is a known weak spot on older
// Android WebView builds — some versions just never resolve it, with no
// error to catch. Serving from the service worker over a normal-looking
// same-origin URL is both the standard PWA pattern and sidesteps that bug
// class entirely, since it looks like any other network request.
const AD_CACHE_NAME = "smato-ads-v1";
const AD_PATH_PREFIX = "/__ad-cache__/";

export function adCacheUrl(id) {
  return `${AD_PATH_PREFIX}${id}`;
}

export function isAdCacheUrl(pathname) {
  return pathname.startsWith(AD_PATH_PREFIX);
}

export function adIdFromCacheUrl(pathname) {
  return pathname.slice(AD_PATH_PREFIX.length);
}

export async function getDownloadedAdIds() {
  const cache = await caches.open(AD_CACHE_NAME);
  const requests = await cache.keys();
  return requests
    .map((r) => new URL(r.url).pathname)
    .filter(isAdCacheUrl)
    .map(adIdFromCacheUrl);
}

// Bytes already received for a download that got cut off, by URL, so the
// next attempt — even one from a later sync — asks only for what's missing.
const partialDownloads = new Map();

// Downloads one ad file, resuming where it left off when the connection
// drops partway (an HTTP Range request for just the missing bytes, which
// Supabase Storage supports). A tablet in a moving auto loses signal all
// the time, and starting a whole video over on every blip burns the free
// plan's bandwidth allowance on bytes the tablet already had.
export async function downloadAd(url, { attempts = 3, retryDelayMs = 5000 } = {}) {
  const partial = partialDownloads.get(url) || { chunks: [], received: 0, contentType: null };
  partialDownloads.set(url, partial);
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    try {
      const res = await fetch(
        url,
        partial.received ? { headers: { Range: `bytes=${partial.received}-` } } : undefined
      );
      // Anything but a clean resume (the server ignored the range, or
      // refused it) means starting this file over from the first byte.
      if (partial.received && res.status !== 206) {
        partial.chunks = [];
        partial.received = 0;
      }
      if (!res.ok) throw new Error(`download failed (${res.status})`);

      partial.contentType = partial.contentType || res.headers.get("Content-Type");
      const expected = Number(res.headers.get("Content-Length")) || 0;
      let got = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        partial.chunks.push(value);
        partial.received += value.byteLength;
        got += value.byteLength;
      }
      if (expected && got < expected) throw new Error("download cut short");

      partialDownloads.delete(url);
      const type = partial.contentType || "application/octet-stream";
      return new Response(new Blob(partial.chunks, { type }), { headers: { "Content-Type": type } });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export async function putAd(id, response) {
  const cache = await caches.open(AD_CACHE_NAME);
  await cache.put(adCacheUrl(id), response);
}

export async function deleteAds(ids) {
  const cache = await caches.open(AD_CACHE_NAME);
  await Promise.all(ids.map((id) => cache.delete(adCacheUrl(id))));
}
