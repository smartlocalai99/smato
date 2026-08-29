// Free reverse geocoding via OpenStreetMap Nominatim — no API key needed.
// Results are cached in memory, keyed by coordinate rounded to ~11m, so
// polling the fleet view every few seconds never re-fetches the same spot.
const cache = new Map();

export function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key);

  const promise = fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16`,
    { headers: { Accept: "application/json" } }
  )
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => data?.display_name || null)
    .catch(() => null);

  cache.set(key, promise);
  return promise;
}
