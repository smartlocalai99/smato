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

export async function putAd(id, response) {
  const cache = await caches.open(AD_CACHE_NAME);
  await cache.put(adCacheUrl(id), response);
}

export async function deleteAds(ids) {
  const cache = await caches.open(AD_CACHE_NAME);
  await Promise.all(ids.map((id) => cache.delete(adCacheUrl(id))));
}
