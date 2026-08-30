"use client";

import { STATUS_STYLES, autoStatus, timeAgo, useAutoAddress } from "@/lib/autoStatus";

// Live status card per auto: online/idle/offline from the heartbeat, what
// it's currently playing, and its last GPS fix as a readable address.
// Status is derived, never stored.
export default function FleetStrip({ autos }) {
  if (!autos.length) {
    return (
      <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-text-dim">
        No autos have checked in yet. Open the player link on a tablet to see it appear here.
      </div>
    );
  }

  return (
    <div className="mb-3 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
      {autos.map((auto) => (
        <FleetCard key={auto.id} auto={auto} />
      ))}
    </div>
  );
}

function FleetCard({ auto }) {
  const s = autoStatus(auto);
  const styles = STATUS_STYLES[s];
  const hasGps = auto.last_lat != null && auto.last_lng != null;
  const address = useAutoAddress(auto.last_lat, auto.last_lng);
  const mapUrl = hasGps ? `https://www.google.com/maps?q=${auto.last_lat},${auto.last_lng}` : null;
  const coords = hasGps ? `${auto.last_lat.toFixed(4)}, ${auto.last_lng.toFixed(4)}` : null;

  return (
    <div className={`flex flex-col gap-2.5 rounded-lg border bg-panel p-4 ${styles.border}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 flex-none rounded-full ${styles.dot}`} />
        <span className="font-mono text-[0.95rem] font-medium">{auto.auto_number}</span>
        <span
          className={`ml-auto rounded bg-panel-2 px-2 py-0.5 font-mono text-[0.7rem] uppercase tracking-wide ${styles.text}`}
        >
          {s}
        </span>
      </div>
      {auto.label && <div className="text-sm text-text-dim">{auto.label}</div>}
      <dl className="grid grid-cols-2 gap-2 text-[0.82rem]">
        <div>
          <dt className="font-mono text-[0.68rem] uppercase tracking-wide text-text-faint">Now playing</dt>
          <dd className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap">
            {auto.now_playing_title || "idle"}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[0.68rem] uppercase tracking-wide text-text-faint">Last seen</dt>
          <dd className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap">
            {timeAgo(auto.last_seen_at)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="font-mono text-[0.68rem] uppercase tracking-wide text-text-faint">Location</dt>
          <dd className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap">
            {hasGps ? (
              <a
                href={mapUrl}
                target="_blank"
                rel="noreferrer"
                title={address ? `${address} (${coords})` : coords}
              >
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
