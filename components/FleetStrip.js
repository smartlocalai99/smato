"use client";

import { useEffect, useState } from "react";
import { reverseGeocode } from "@/lib/geocode";

// Live status card per auto: online/idle/offline from the heartbeat, what
// it's currently playing, and its last GPS fix as a readable address.
// Status is derived, never stored.
export default function FleetStrip({ autos }) {
  if (!autos.length) {
    return (
      <div className="empty-state">
        No autos have checked in yet. Open the player link on a tablet to see it appear here.
      </div>
    );
  }

  return (
    <div className="fleet-grid">
      {autos.map((auto) => (
        <FleetCard key={auto.id} auto={auto} />
      ))}
    </div>
  );
}

function status(auto) {
  if (!auto.last_seen_at) return "offline";
  const ageMs = Date.now() - new Date(auto.last_seen_at).getTime();
  if (ageMs < 2 * 60 * 1000) return "online";
  if (ageMs < 10 * 60 * 1000) return "idle";
  return "offline";
}

function timeAgo(iso) {
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
function useAddress(rawLat, rawLng) {
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

function FleetCard({ auto }) {
  const s = status(auto);
  const hasGps = auto.last_lat != null && auto.last_lng != null;
  const address = useAddress(auto.last_lat, auto.last_lng);
  const mapUrl = hasGps ? `https://www.google.com/maps?q=${auto.last_lat},${auto.last_lng}` : null;
  const coords = hasGps ? `${auto.last_lat.toFixed(4)}, ${auto.last_lng.toFixed(4)}` : null;

  return (
    <div className={`fleet-card fleet-card--${s}`}>
      <div className="fleet-card__head">
        <span className={`dot dot--${s}`} />
        <span className="fleet-card__number">{auto.auto_number}</span>
        <span className={`fleet-card__status fleet-card__status--${s}`}>{s}</span>
      </div>
      {auto.label && <div className="fleet-card__label">{auto.label}</div>}
      <dl className="fleet-card__meta">
        <div>
          <dt>Now playing</dt>
          <dd>{auto.now_playing_title || "idle"}</dd>
        </div>
        <div>
          <dt>Last seen</dt>
          <dd>{timeAgo(auto.last_seen_at)}</dd>
        </div>
        <div className="fleet-card__meta-wide">
          <dt>Location</dt>
          <dd>
            {hasGps ? (
              <a href={mapUrl} target="_blank" rel="noreferrer" title={address ? `${address} (${coords})` : coords}>
                {address || coords}
              </a>
            ) : (
              "no fix yet"
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
