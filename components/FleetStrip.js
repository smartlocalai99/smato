"use client";

import PhoneActions from "@/components/admin/PhoneActions";
import { STATUS_STYLES, autoStatus, batteryLabel, batteryStyle, timeAgo, useAutoAddress } from "@/lib/autoStatus";

// Live status card per auto: who drives it (with a call button), online/
// idle/offline from the heartbeat, what it's playing, and its last GPS fix
// as a readable address. Status is derived, never stored. Turning a screen
// on/off lives on the Autos page, not here.
export default function FleetStrip({ autos, drivers = {} }) {
  if (!autos.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-text-dim">
        No autos have checked in yet. Open the player link on a tablet to see it appear here.
      </div>
    );
  }

  return (
    <div className="mb-3 grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
      {autos.map((auto) => (
        <FleetCard key={auto.id} auto={auto} driver={drivers[auto.auto_number]} />
      ))}
    </div>
  );
}

function FleetCard({ auto, driver }) {
  const s = autoStatus(auto);
  const styles = STATUS_STYLES[s];
  const hasGps = auto.last_lat != null && auto.last_lng != null;
  const address = useAutoAddress(auto.last_lat, auto.last_lng);
  const mapUrl = hasGps ? `https://www.google.com/maps?q=${auto.last_lat},${auto.last_lng}` : null;
  const coords = hasGps ? `${auto.last_lat.toFixed(4)}, ${auto.last_lng.toFixed(4)}` : null;

  return (
    <article className={`flex flex-col gap-3 rounded-2xl border bg-panel p-4 ${styles.border}`}>
      <header className="flex items-center gap-2">
        <span className={`h-2 w-2 flex-none rounded-full ${styles.dot}`} />
        <span className="font-mono text-base font-semibold">{auto.auto_number}</span>
        <span className={`text-xs font-semibold capitalize ${styles.text}`}>{s}</span>
        {auto.screen_off && (
          <span className="rounded-full bg-red/10 px-2 py-0.5 text-[0.7rem] font-semibold text-red">Screen off</span>
        )}
        <span
          className={`ml-auto font-mono text-xs ${batteryStyle(auto.battery_level, auto.battery_charging)}`}
          title={batteryLabel(auto.battery_level, auto.battery_charging)}
        >
          {auto.battery_level != null ? `${auto.battery_level}%${auto.battery_charging ? " ⚡" : ""}` : ""}
        </span>
      </header>

      <div className="flex items-center gap-3 rounded-xl bg-panel-2 px-3 py-2.5">
        {driver ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-text">{driver.name}</span>
              <span className="block text-xs text-text-dim">{driver.mobile}</span>
            </span>
            <PhoneActions number={driver.mobile} name={driver.name} />
          </>
        ) : (
          <span className="text-sm text-text-faint">No driver linked</span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-2 text-[0.82rem]">
        <div className="min-w-0">
          <dt className="text-xs text-text-faint">Now playing</dt>
          <dd className="mt-0.5 truncate">{auto.now_playing_title || "idle"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-text-faint">Last seen</dt>
          <dd className="mt-0.5 truncate">{timeAgo(auto.last_seen_at)}</dd>
        </div>
        <div className="col-span-2 min-w-0">
          <dt className="text-xs text-text-faint">Location</dt>
          <dd className="mt-0.5 truncate">
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
    </article>
  );
}
