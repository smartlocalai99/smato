"use client";

import { useEffect, useState } from "react";
import nextDynamic from "next/dynamic";

// Leaflet needs the browser, so the map loads client-side only.
const EstimateMap = nextDynamic(() => import("@/components/estimate/EstimateMap"), {
  ssr: false,
  loading: () => <div className="h-[58vh] min-h-[20rem] rounded-2xl border border-line bg-panel-2" />,
});

const REFRESH_MS = 2 * 60 * 1000;

const STATUS_TEXT = {
  live: "text-green",
  recent: "text-amber",
  parked: "text-text-dim",
  night: "text-text-dim",
  planned: "text-text-dim",
};

function formatKm(km) {
  if (!km) return "0";
  return km >= 100 ? Math.round(km).toLocaleString("en-IN") : km.toFixed(1);
}

// Spelled out by hand rather than Intl: the server and phone browsers
// disagree on details ("3:00 PM" vs "3:00 pm"), which breaks hydration.
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function istDate(iso) {
  const d = new Date(new Date(iso).getTime() + 330 * 60 * 1000);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function istTime(iso) {
  const d = new Date(new Date(iso).getTime() + 330 * 60 * 1000);
  const h = d.getUTCHours();
  return `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function Figure({ label, value, note }) {
  return (
    <div className="flex flex-col gap-1 bg-panel p-4 sm:p-5">
      <dt className="text-sm text-text-dim">{label}</dt>
      <dd className="font-display text-3xl font-semibold tabular-nums tracking-tight">{value}</dd>
      <dd className="text-xs text-text-faint">{note}</dd>
    </div>
  );
}

function AutoRow({ auto }) {
  const detail = auto.playing
    ? `Playing "${auto.playing}"`
    : auto.planned
      ? "Will play the full loop"
      : null;
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-sm font-semibold">{auto.auto_number}</span>
          {auto.driver && <span className="text-sm text-text">{auto.driver}</span>}
        </p>
        <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
          <span className={`font-semibold ${STATUS_TEXT[auto.status.kind]}`}>{auto.status.label}</span>
          {detail && <span className="min-w-0 break-words text-text-dim">{detail}</span>}
        </p>
      </div>
      {auto.km > 0 && (
        <span className="flex-none pt-0.5 font-mono text-xs text-text-dim">{formatKm(auto.km)} km</span>
      )}
    </li>
  );
}

// The whole client view on one page: headline figures, every auto on the
// map, each auto's line, and the ad loop. Refreshes itself every 2 minutes.
export default function EstimateView({ initial, linkKey }) {
  const [data, setData] = useState(initial);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/estimate/${linkKey}`, { cache: "no-store" });
        if (res.ok) setData(await res.json());
      } catch {
        // Keep showing the last good update; the next tick tries again.
      }
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [linkKey]);

  const total = data.liveCount + data.plannedCount;

  return (
    <div className="console min-h-screen-safe bg-ink text-text">
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 rounded-[9px] border border-line bg-white"
          />
          <span className="font-display text-lg">smato</span>
        </header>

        <h1 className="mt-6 max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Your ads on the road
        </h1>
        <p className="mt-2 max-w-2xl text-text-dim">
          {istDate(data.updatedAt)}. Ads play{" "}
          {data.playingHours} every day.
          {!data.playingNow && " The autos are off for the night right now."}
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
          <Figure label="Autos" value={total} note={`${data.liveCount} live, ${data.plannedCount} planned`} />
          <Figure label="Active today" value={data.activeToday} note="live autos that reported today" />
          <Figure label="Km covered today" value={formatKm(data.kmToday)} note="by the live autos" />
          <Figure
            label={`Km a day with ${total}`}
            value={data.kmEstimate ? `≈ ${formatKm(data.kmEstimate)}` : "—"}
            note={data.kmEstimate ? "approx, from today's average" : "shows once autos have driven today"}
          />
        </dl>

        <section className="mt-6" aria-label="Map">
          <EstimateMap autos={data.autos} />
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section aria-labelledby="autos-heading">
            <h2 id="autos-heading" className="font-display text-xl font-semibold">
              Every auto
            </h2>
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
              {data.autos.map((auto) => (
                <AutoRow key={auto.auto_number} auto={auto} />
              ))}
            </ul>
          </section>

          <section aria-labelledby="loop-heading">
            <h2 id="loop-heading" className="font-display text-xl font-semibold">
              Playing in the loop
            </h2>
            {data.loop.length ? (
              <ol className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
                {data.loop.map((ad, i) => (
                  <li key={`${ad.title}-${i}`} className="flex items-baseline gap-3 px-4 py-3">
                    <span className="w-5 flex-none font-mono text-xs text-text-faint">{i + 1}</span>
                    <span className="min-w-0 flex-1 break-words text-sm">{ad.title}</span>
                    <span className="flex-none text-xs text-text-dim">{ad.autoNumber || "All autos"}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 rounded-2xl border border-dashed border-line p-6 text-sm text-text-dim">
                No ads are scheduled for today.
              </p>
            )}
          </section>
        </div>

        <footer className="mt-10 border-t border-line pt-4 text-xs leading-relaxed text-text-faint">
          <p>
            Live autos refresh every 2 minutes. Planned autos, their positions, and figures marked approx are
            estimates of the full {total}-auto fleet.
          </p>
          <p className="mt-1">Updated {istTime(data.updatedAt)}</p>
        </footer>
      </main>
    </div>
  );
}
