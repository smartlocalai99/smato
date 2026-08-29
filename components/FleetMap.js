"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet's default marker icon references image files by a bundler-relative
// path that breaks under webpack — point it at the CDN copies instead.
const LEAFLET_CDN = "https://unpkg.com/leaflet@1.9.4/dist/images";
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: `${LEAFLET_CDN}/marker-icon-2x.png`,
  iconUrl: `${LEAFLET_CDN}/marker-icon.png`,
  shadowUrl: `${LEAFLET_CDN}/marker-shadow.png`,
});

const DEFAULT_CENTER = [20.5937, 78.9629]; // India, roughly — used until a real fix comes in
const DEFAULT_ZOOM = 5;

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
        existing.setLatLng(pos);
        existing.setPopupContent(popupHtml(auto));
      } else {
        const marker = L.marker(pos).addTo(map).bindPopup(popupHtml(auto));
        markersRef.current.set(auto.auto_number, marker);
      }
    });

    // Drop markers for autos that no longer have a fix (or were removed).
    for (const [autoNumber, marker] of markersRef.current) {
      if (!seen.has(autoNumber)) {
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
