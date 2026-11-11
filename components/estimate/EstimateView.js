"use client";

import { useEffect, useState } from "react";
import nextDynamic from "next/dynamic";
import { isPlayingHour, istClock } from "@/lib/estimate";

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

function formatMinutes(minutes) {
  if (!minutes) return "0 m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} m` : `${m} m`;
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

// The loop in play order, with whatever is on screen right now marked, then
// the signed-up clients whose ads aren't live yet, tagged planned and left
// unnumbered — they join the order once their ad goes live.
function LoopOrder({ loop, playing, nameOf, upcoming }) {
  if (!loop.length && !upcoming.length) {
    return <span className="text-xs text-text-faint">No ads scheduled today</span>;
  }
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="Play order">
      {loop.map((title, i) => {
        const current = title === playing;
        return (
          <li
            key={`${title}-${i}`}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${
              current ? "border-green/40 bg-green/10 text-text" : "border-line text-text-dim"
            }`}
          >
            <span className="break-words">{nameOf(title)}</span>
            {current && <span className="sr-only">(playing now)</span>}
          </li>
        );
      })}
      {upcoming.map((name) => (
        <li
          key={name}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-2 py-0.5 text-xs text-text-dim"
        >
          <span className="break-words">{name}</span>
        </li>
      ))}
    </ol>
  );
}

function AutoReport({ auto, nameOf, upcoming }) {
  const playing = auto.playing || auto.preview;
  const status = auto.previewStatus || auto.status;

  return (
    <li className="flex flex-col gap-2 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-mono text-sm font-semibold">{auto.auto_number}</span>
            {auto.driver && <span className="text-sm text-text">{auto.driver}</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
            {/* An auto that's reporting just shows what it's playing — no "Live" tag. */}
            {status.kind !== "live" && status.kind !== "planned" && (
              <span className={`font-semibold ${STATUS_TEXT[status.kind]}`}>{status.label}</span>
            )}
            {playing && <span className="min-w-0 break-words text-text-dim">Playing &ldquo;{nameOf(playing)}&rdquo;</span>}
          </p>
        </div>
        <div className="flex-none text-right font-mono text-xs leading-relaxed text-text-dim">
          <div>
            {auto.approx ? "≈ " : ""}
            {formatKm(auto.km)} km
          </div>
          <div>
            {auto.approx ? "≈ " : ""}
            {formatMinutes(auto.minutes)}
          </div>
        </div>
      </div>
      <LoopOrder loop={auto.loop} playing={playing} nameOf={nameOf} upcoming={upcoming} />
    </li>
  );
}

// The whole client view on one page, as a daily report: headline figures,
// every auto on the map, each client ad's reach, and each auto's day. It
// refreshes every 2 minutes during playing hours only — overnight nothing
// changes, so it doesn't ask.
export default function EstimateView({ initial, linkKey }) {
  const [data, setData] = useState(initial);

  useEffect(() => {
    const id = setInterval(async () => {
      if (!isPlayingHour(istClock().hour)) return;
      try {
        const res = await fetch(`/api/live/${linkKey}`, { cache: "no-store" });
        if (res.ok) setData(await res.json());
      } catch {
        // Keep showing the last good update; the next tick tries again.
      }
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [linkKey]);

  const total = data.liveCount + data.plannedCount;
  // Ad titles shown by client name ("dhruva oct" → Dhruva), and the clients
  // not live yet, for every auto's play order.
  const names = Object.fromEntries(data.clients.map((c) => [c.title, c.name]));
  const nameOf = (title) => names[title] || title;
  const upcoming = data.clients.filter((c) => c.planned).map((c) => c.name);

  return (
    <div className="console min-h-screen-safe bg-ink text-text">
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/icon-192.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-[9px] border border-line bg-white"
            />
            <span className="font-display text-lg">smato</span>
          </span>
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-10 rounded-full border border-line bg-panel px-4 text-sm font-semibold hover:border-text-faint print:hidden"
          >
            Save as PDF
          </button>
        </header>

        <h1 className="mt-6 max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Today&rsquo;s ad report
        </h1>
        <p className="mt-2 max-w-2xl text-text-dim">
          {istDate(data.updatedAt)}. Ads play {data.playingHours} every day.
          {!data.playingNow && " The autos are off for the night right now."}
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
          <Figure label="Autos" value={total} note="full fleet" />
          <Figure
            label="Km a day"
            value={data.kmEstimate ? `≈ ${formatKm(data.kmEstimate)}` : "—"}
            note={data.kmEstimate ? `all ${total} autos` : "shows once autos have driven today"}
          />
          <Figure
            label="Time on the road a day"
            value={data.minutesEstimate ? `≈ ${formatMinutes(data.minutesEstimate)}` : "—"}
            note={data.minutesEstimate ? `all ${total} autos` : "shows once autos have driven today"}
          />
          <Figure
            label="Clients"
            value={data.clients.length}
            note={`${data.clients.filter((c) => !c.planned).length} playing now`}
          />
        </dl>

        <section className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="Clients">
          {data.clients.map((client) => (
            <span
              key={client.title}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-sm"
            >
              {client.name}
            </span>
          ))}
        </section>

        <section className="mt-6" aria-label="Map">
          <EstimateMap autos={data.autos} />
        </section>

        <section className="mt-8" aria-labelledby="autos-heading">
          <h2 id="autos-heading" className="font-display text-xl font-semibold">
            Every auto today
          </h2>
          <p className="mt-1 text-sm text-text-dim">Play order, what&rsquo;s on screen now, km and time on the road.</p>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
            {data.autos.map((auto) => (
              <AutoReport key={auto.auto_number} auto={auto} nameOf={nameOf} upcoming={upcoming} />
            ))}
          </ul>
        </section>

        <footer className="mt-10 border-t border-line pt-4 text-xs leading-relaxed text-text-faint">
          <p>
            Live autos refresh every 2 minutes during playing hours. Some autos, their positions,
            update times and playing ads are previews of the full {total}-auto fleet. Figures marked ≈ are estimates
            based on today&rsquo;s live autos.
          </p>
          <p className="mt-1">Updated {istTime(data.updatedAt)}</p>
        </footer>
      </main>
    </div>
  );
}
