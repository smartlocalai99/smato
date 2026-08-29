"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER = [20.5937, 78.9629]; // India, roughly — used until a real fix comes in
const DEFAULT_ZOOM = 5;
const GLIDE_MS = 1200;

// The auto photo is a 3/4 angle shot, not a top-down silhouette, so it can't
// be rotated to face direction of travel the way Uber/Ola spin their car
// icons — it would just look broken side-on. What we can do, and what
// actually reads as "live tracking," is glide the marker to its new spot
// instead of snapping there.
const autoIcon = L.icon({
  iconUrl: "/auto-marker.png",
  iconSize: [46, 40],
  iconAnchor: [23, 20],
  popupAnchor: [0, -18],
  className: "fleet-map__marker",
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function popupHtml(auto) {
  const seen = auto.last_seen_at
    ? new Date(auto.last_seen_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "never";
  const playing = auto.now_playing_title
    ? `playing "${escapeHtml(auto.now_playing_title)}"`
    : "idle";
  return `
    <div class="fleet-map__popup">
      <strong>${escapeHtml(auto.auto_number)}</strong><br/>
      ${playing}<br/>
      <span>last seen ${escapeHtml(seen)}</span>
    </div>
  `;
}

// Eases a marker from wherever it currently is to `to`, instead of jumping —
// the glide that makes a live map feel alive.
function glideMarkerTo(marker, to) {
  if (marker._glideFrame) cancelAnimationFrame(marker._glideFrame);

  const from = marker.getLatLng();
  const start = performance.now();

  function step(now) {
    const t = Math.min((now - start) / GLIDE_MS, 1);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    marker.setLatLng([
      from.lat + (to[0] - from.lat) * eased,
      from.lng + (to[1] - from.lng) * eased,
    ]);
    marker._glideFrame = t < 1 ? requestAnimationFrame(step) : null;
  }
  marker._glideFrame = requestAnimationFrame(step);
}

export default function FleetMap({ autos }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const hasFitBoundsRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const withGps = autos.filter((a) => a.last_lat != null && a.last_lng != null);
    const seen = new Set();

    withGps.forEach((auto) => {
      seen.add(auto.auto_number);
      const pos = [auto.last_lat, auto.last_lng];
      const existing = markersRef.current.get(auto.auto_number);
      if (existing) {
        glideMarkerTo(existing, pos);
        existing.setPopupContent(popupHtml(auto));
      } else {
        const marker = L.marker(pos, { icon: autoIcon }).addTo(map).bindPopup(popupHtml(auto));
        markersRef.current.set(auto.auto_number, marker);
      }
    });

    // Drop markers for autos that no longer have a fix (or were removed).
    for (const [autoNumber, marker] of markersRef.current) {
      if (!seen.has(autoNumber)) {
        if (marker._glideFrame) cancelAnimationFrame(marker._glideFrame);
        map.removeLayer(marker);
        markersRef.current.delete(autoNumber);
      }
    }

    // Frame every marker once, the first time any fixes come in — after
    // that, leave the admin's pan/zoom alone.
    if (!hasFitBoundsRef.current && withGps.length) {
      hasFitBoundsRef.current = true;
      const bounds = L.latLngBounds(withGps.map((a) => [a.last_lat, a.last_lng]));
      map.fitBounds(bounds.pad(0.3), { maxZoom: 15 });
    }
  }, [autos]);

  return <div ref={containerRef} className="fleet-map" />;
}
