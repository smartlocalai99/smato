"use client";

import { useEffect, useState } from "react";
import { reverseGeocode } from "@/lib/geocode";

// Shared between the Fleet cards, the Fleet map popups, and a driver's own
// profile (which shows their linked tablet's live status) — one status
// derivation so all three always agree.
export const STATUS_STYLES = {
  online: { dot: "bg-green shadow-[0_0_6px_var(--green)] animate-pulse motion-reduce:animate-none", text: "text-green", border: "border-green/35" },
  idle: { dot: "bg-amber", text: "text-amber", border: "border-line" },
  offline: { dot: "bg-text-faint", text: "text-text-faint", border: "border-line" },
};

export function autoStatus(auto) {
  if (!auto?.last_seen_at) return "offline";
  const ageMs = Date.now() - new Date(auto.last_seen_at).getTime();
  if (ageMs < 2 * 60 * 1000) return "online";
  if (ageMs < 10 * 60 * 1000) return "idle";
  return "offline";
}

export function timeAgo(iso) {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Rounds to ~11m so GPS jitter between pings doesn't keep re-fetching.
export function useAutoAddress(rawLat, rawLng) {
  const lat = rawLat != null ? Number(rawLat.toFixed(4)) : null;
  const lng = rawLng != null ? Number(rawLng.toFixed(4)) : null;
  const [address, setAddress] = useState(null);

  useEffect(() => {
    if (lat == null || lng == null) return;
    let cancelled = false;
    reverseGeocode(lat, lng).then((addr) => {
      if (!cancelled) setAddress(addr);
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return address;
}
