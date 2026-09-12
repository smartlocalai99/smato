"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER = [20.5937, 78.9629]; // India, roughly — used until points come in
const DEFAULT_ZOOM = 5;

// Draws one day's GPS fixes for a single auto as a route: a line through
// every point, with a green start marker and red end marker so a client
// can see where the day began and ended at a glance.
export default function RouteMap({ points }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

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
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    if (!points.length) return;

    const latLngs = points.map((p) => [p.lat, p.lng]);
    const group = L.layerGroup();
    L.polyline(latLngs, { color: "#2dd4bf", weight: 3, opacity: 0.85 }).addTo(group);
    L.circleMarker(latLngs[0], { radius: 7, color: "#22c55e", fillColor: "#22c55e", fillOpacity: 1 })
      .bindTooltip("Start")
      .addTo(group);
    if (latLngs.length > 1) {
      L.circleMarker(latLngs[latLngs.length - 1], {
        radius: 7,
        color: "#ef4444",
        fillColor: "#ef4444",
        fillOpacity: 1,
      })
        .bindTooltip("End")
        .addTo(group);
    }
    group.addTo(map);
    layerRef.current = group;

    map.fitBounds(L.latLngBounds(latLngs).pad(0.2), { maxZoom: 16 });
  }, [points]);

  return <div ref={containerRef} className="fleet-map h-96 overflow-hidden rounded-lg border border-line" />;
}
