"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { autoIcon, escapeHtml, glideMarkerTo } from "@/components/FleetMap";

const DEFAULT_CENTER = [14.4673, 78.8242];
const DEFAULT_ZOOM = 13;

function popupHtml(auto) {
  const lines = [
    `<strong>${escapeHtml(auto.auto_number)}</strong>`,
    auto.driver ? escapeHtml(auto.driver) : null,
    auto.status.kind === "live" || auto.status.kind === "planned" ? null : escapeHtml(auto.status.label),
    auto.playing
      ? `Playing "${escapeHtml(auto.playing)}"`
      : auto.planned && auto.loop.length
        ? `Will play: ${escapeHtml(auto.loop.join(", "))}`
        : null,
  ].filter(Boolean);
  return `<div class="text-[0.82rem] leading-relaxed">${lines.join("<br/>")}</div>`;
}

// Every auto on one map, using the same marker.
export default function EstimateMap({ autos }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const hasFitBoundsRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current, { scrollWheelZoom: false }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapRef.current);
    const markers = markersRef.current;
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markers.clear();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const placed = autos.filter((a) => a.lat != null && a.lng != null);
    const seen = new Set();

    placed.forEach((auto) => {
      seen.add(auto.auto_number);
      const pos = [auto.lat, auto.lng];
      const existing = markersRef.current.get(auto.auto_number);
      if (existing) {
        glideMarkerTo(existing, pos);
        existing.setPopupContent(popupHtml(auto));
        return;
      }
      const marker = L.marker(pos, { icon: autoIcon })
        .addTo(map)
        .bindPopup(popupHtml(auto))
        .bindTooltip(auto.auto_number, {
          permanent: true,
          direction: "top",
          offset: [0, -16],
          className: "fleet-map-label",
        });
      markersRef.current.set(auto.auto_number, marker);
    });

    for (const [autoNumber, marker] of markersRef.current) {
      if (seen.has(autoNumber)) continue;
      if (marker._glideFrame) cancelAnimationFrame(marker._glideFrame);
      map.removeLayer(marker);
      markersRef.current.delete(autoNumber);
    }

    if (!hasFitBoundsRef.current && placed.length) {
      hasFitBoundsRef.current = true;
      map.fitBounds(L.latLngBounds(placed.map((a) => [a.lat, a.lng])).pad(0.15), { maxZoom: 15 });
    }
  }, [autos]);

  return (
    <div
      ref={containerRef}
      className="fleet-map h-[58vh] min-h-[20rem] overflow-hidden rounded-2xl border border-line"
      aria-label="Map of every auto"
    />
  );
}
