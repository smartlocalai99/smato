"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import nextDynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { reverseGeocode } from "@/lib/geocode";
import PhoneActions from "@/components/admin/PhoneActions";
import {
  PERIODS,
  buildReport,
  dayRangeIso,
  fetchLocations,
  formatDay,
  formatDuration,
  formatKm,
  formatTime,
  listDays,
  localDay,
  periodDays,
  reportCsv,
} from "@/lib/reports";

const RouteMap = nextDynamic(() => import("@/components/RouteMap"), { ssr: false });

export const dynamic = "force-dynamic";

const ALL = "";
const controlClass =
  "min-h-11 w-full rounded-xl border border-line bg-panel px-3.5 py-2.5 text-base text-text focus:border-teal focus:outline-none sm:text-sm";
const labelClass = "font-mono text-xs tracking-wide text-text-dim";

export default function ReportsPage() {
  const [autos, setAutos] = useState([]);
  const [drivers, setDrivers] = useState({});
  const [autoNumber, setAutoNumber] = useState(ALL);
  const [period, setPeriod] = useState("today");
  const [custom, setCustom] = useState(() => ({ from: localDay(new Date()), to: localDay(new Date()) }));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // The fleet and who drives what — loaded once for the filter and labels.
  useEffect(() => {
    supabase
      .from("autos")
      .select("auto_number")
      .then(({ data }) =>
        setAutos(
          (data || [])
            .map((a) => a.auto_number)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        )
      );
    supabase
      .from("drivers")
      .select("id,name,mobile,alt_mobile,auto_number_plate")
      .then(({ data }) =>
        setDrivers(Object.fromEntries((data || []).map((d) => [d.auto_number_plate, d])))
      );
  }, []);

  const range = periodDays(period, custom);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { startIso, endIso } = dayRangeIso(range.from, range.to);
      setRows(await fetchLocations(supabase, { autoNumber: autoNumber || null, startIso, endIso }));
    } catch (err) {
      setError(err.message || "Couldn't load the report.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [autoNumber, range.from, range.to]);

  useEffect(() => {
    load();
  }, [load]);

  const report = useMemo(
    () => buildReport(rows, autoNumber ? [autoNumber] : autos),
    [rows, autoNumber, autos]
  );
  const multiDay = range.from !== range.to;

  function downloadCsv() {
    const csv = reportCsv(report, drivers);
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `smato-report-${autoNumber || "all-autos"}-${range.from}${multiDay ? `-to-${range.to}` : ""}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Reports</h1>
          <p className="mt-1 max-w-xl text-text-dim">
            How far each auto travelled and how long its screen was online.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={loading || !report.totals.points}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-panel px-4 text-sm font-semibold text-text hover:border-text-faint disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
            <path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 15.5h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Download CSV
        </button>
      </header>

      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-line bg-panel p-3.5 sm:p-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reportAuto" className={labelClass}>
            Auto
          </label>
          <select
            id="reportAuto"
            value={autoNumber}
            onChange={(e) => setAutoNumber(e.target.value)}
            className={controlClass}
          >
            <option value={ALL}>All autos</option>
            {autos.map((number) => (
              <option key={number} value={number}>
                {drivers[number] ? `${number} — ${drivers[number].name}` : number}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span id="period-label" className={labelClass}>
            Period
          </span>
          <div
            role="radiogroup"
            aria-labelledby="period-label"
            className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5"
          >
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={period === p.key}
                onClick={() => setPeriod(p.key)}
                className="min-h-10 flex-none rounded-full border border-line px-4 text-sm font-semibold text-text-dim transition-colors aria-checked:border-amber aria-checked:bg-amber aria-checked:text-on-amber"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {period === "custom" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reportFrom" className={labelClass}>
                From
              </label>
              <input
                id="reportFrom"
                type="date"
                value={custom.from}
                max={localDay(new Date())}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                className={controlClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reportTo" className={labelClass}>
                To
              </label>
              <input
                id="reportTo"
                type="date"
                value={custom.to}
                max={localDay(new Date())}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                className={controlClass}
              />
            </div>
          </div>
        )}
      </div>

      <p className="mb-3 text-sm text-text-dim">
        {multiDay
          ? `${formatDay(range.from, { weekday: false })} – ${formatDay(range.to, { weekday: false })}`
          : formatDay(range.from)}
        {autoNumber ? `, ${autoNumber}` : ", all autos"}
      </p>

      {loading ? (
        <p className="py-10 text-center text-sm text-text-dim" role="status">
          Loading report…
        </p>
      ) : error ? (
        <div className="rounded-2xl border border-red/25 bg-red/[0.06] p-6 text-center" role="alert">
          <p className="text-red">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-3 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-text-faint"
          >
            Try again
          </button>
        </div>
      ) : autoNumber ? (
        <SingleAutoReport
          key={`${autoNumber}-${range.from}-${range.to}`}
          auto={report.autos[0]}
          driver={drivers[autoNumber]}
          days={listDays(range.from, range.to)}
          multiDay={multiDay}
        />
      ) : (
        <FleetReport report={report} drivers={drivers} multiDay={multiDay} onOpen={setAutoNumber} />
      )}
    </main>
  );
}

// "MDR0380, Kadapa Urban, Nagarajupeta, Kadapa, …, 516001, India" → the
// first three parts, which is what someone actually recognises.
function shortAddress(address) {
  if (!address) return null;
  return address.split(",").map((part) => part.trim()).filter(Boolean).slice(0, 3).join(", ");
}

function Tiles({ items }) {
  return (
    <dl className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {items.map(({ label, value, note }) => (
        <div key={label} className="rounded-2xl border border-line bg-panel px-4 py-3">
          <dt className="text-xs text-text-dim">{label}</dt>
          <dd className="mt-1 font-display text-xl font-semibold leading-tight text-text sm:text-2xl">{value}</dd>
          {note && <dd className="mt-0.5 text-xs text-text-faint">{note}</dd>}
        </div>
      ))}
    </dl>
  );
}

function DriverLine({ driver }) {
  if (!driver) return <span className="text-sm text-text-faint">No driver linked</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate text-sm text-text">{driver.name}</span>
      <PhoneActions number={driver.mobile} name={driver.name} />
    </span>
  );
}

function FleetReport({ report, drivers, multiDay, onOpen }) {
  const { totals, autos } = report;
  const days = Math.max(1, ...autos.map((a) => a.daysActive));

  return (
    <>
      <Tiles
        items={[
          { label: "Distance", value: formatKm(totals.distanceKm), note: "all autos" },
          { label: "Screens online", value: formatDuration(totals.onlineMinutes), note: "combined" },
          { label: "Autos active", value: `${totals.activeAutos} of ${totals.totalAutos}` },
          {
            label: multiDay ? "Avg per auto / day" : "Avg per auto",
            value: formatKm(totals.activeAutos ? totals.distanceKm / totals.activeAutos / (multiDay ? days : 1) : 0),
          },
        ]}
      />

      {autos.length ? (
        <ul className="flex flex-col gap-2.5">
          {autos.map((auto) => (
            <li key={auto.autoNumber} className="rounded-2xl border border-line bg-panel p-3.5 sm:p-4">
              <div className="flex items-center gap-3">
                <span className="rounded-md bg-panel-2 px-2 py-1 font-mono text-sm font-semibold text-text">
                  {auto.autoNumber}
                </span>
                <span className="min-w-0 flex-1">
                  <DriverLine driver={drivers[auto.autoNumber]} />
                </span>
              </div>
              {auto.points ? (
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-text-faint">Distance</dt>
                    <dd className="font-semibold text-text">{formatKm(auto.distanceKm)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-faint">Online</dt>
                    <dd className="font-semibold text-text">{formatDuration(auto.onlineMinutes)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-faint">{multiDay ? "Days active" : "Seen"}</dt>
                    <dd className="font-semibold text-text">
                      {multiDay ? auto.daysActive : `${formatTime(auto.firstAt)}–${formatTime(auto.lastAt)}`}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-3 text-sm text-text-faint">No GPS data in this period.</p>
              )}
              <button
                type="button"
                onClick={() => onOpen(auto.autoNumber)}
                className="mt-3 flex min-h-10 w-full items-center justify-center rounded-full border border-line text-sm font-semibold text-text hover:border-text-faint"
              >
                Open {auto.autoNumber} report
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-line p-10 text-center text-text-dim">
          No autos in the fleet yet.
        </p>
      )}
    </>
  );
}

function SingleAutoReport({ auto, driver, days, multiDay }) {
  const byDay = useMemo(() => Object.fromEntries((auto?.days || []).map((d) => [d.day, d])), [auto]);
  const lastDayWithData = auto?.days[auto.days.length - 1]?.day;
  const [selectedDay, setSelectedDay] = useState(lastDayWithData || days[days.length - 1]);
  const selected = byDay[selectedDay];
  const [addresses, setAddresses] = useState({ start: null, end: null });

  useEffect(() => {
    setAddresses({ start: null, end: null });
    if (!selected?.track.length) return;
    let cancelled = false;
    const first = selected.track[0];
    const last = selected.track[selected.track.length - 1];
    reverseGeocode(first.lat, first.lng).then((start) => !cancelled && setAddresses((a) => ({ ...a, start })));
    reverseGeocode(last.lat, last.lng).then((end) => !cancelled && setAddresses((a) => ({ ...a, end })));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <>
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-panel p-3.5 sm:p-4">
        <span className="text-xs text-text-faint">Driver</span>
        <span className="min-w-0 flex-1">
          <DriverLine driver={driver} />
        </span>
      </div>

      {!auto?.points ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-text-dim">
          No GPS data for {auto?.autoNumber} in this period. The tablet sends its position while the player is
          running.
        </div>
      ) : (
        <>
          <Tiles
            items={[
              { label: "Distance", value: formatKm(auto.distanceKm) },
              { label: "Screen online", value: formatDuration(auto.onlineMinutes) },
              multiDay
                ? { label: "Days active", value: `${auto.daysActive} of ${days.length}` }
                : { label: "First seen", value: formatTime(auto.firstAt) },
              multiDay
                ? { label: "Avg per active day", value: formatKm(auto.distanceKm / auto.daysActive) }
                : { label: "Last seen", value: formatTime(auto.lastAt) },
            ]}
          />

          {multiDay && (
            <>
              <DistanceChart days={days} byDay={byDay} selected={selectedDay} onSelect={setSelectedDay} />
              <ul className="mb-5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
                {days
                  .filter((day) => byDay[day])
                  .reverse()
                  .map((day) => {
                    const d = byDay[day];
                    const active = day === selectedDay;
                    return (
                      <li key={day}>
                        <button
                          type="button"
                          onClick={() => setSelectedDay(day)}
                          aria-pressed={active}
                          className={`grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 px-4 py-3 text-left ${
                            active ? "bg-teal/[0.07]" : "hover:bg-panel-2"
                          }`}
                        >
                          <span className="font-semibold text-text">{formatDay(day)}</span>
                          <span className="font-semibold text-text">{formatKm(d.distanceKm)}</span>
                          <span className="text-xs text-text-dim">
                            {formatTime(d.firstAt)}–{formatTime(d.lastAt)}
                          </span>
                          <span className="text-xs text-text-dim">{formatDuration(d.onlineMinutes)} online</span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </>
          )}

          {selected && (
            <section aria-label={`Route on ${formatDay(selectedDay)}`}>
              <h2 className="mb-2 font-display text-base font-semibold">
                {multiDay ? `Route on ${formatDay(selectedDay)}` : "Route"}
              </h2>
              <RouteMap points={selected.track} />
              <dl className="mt-3 grid gap-2 text-sm">
                <div className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full bg-[#22c55e]" aria-hidden="true" />
                  <dt className="sr-only">Started</dt>
                  <dd className="min-w-0 text-text">
                    {shortAddress(addresses.start) || "Start"}
                    <span className="ml-1.5 text-text-faint">{formatTime(selected.firstAt)}</span>
                  </dd>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full bg-[#ef4444]" aria-hidden="true" />
                  <dt className="sr-only">Ended</dt>
                  <dd className="min-w-0 text-text">
                    {shortAddress(addresses.end) || "End"}
                    <span className="ml-1.5 text-text-faint">{formatTime(selected.lastAt)}</span>
                  </dd>
                </div>
              </dl>

              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-teal">
                  All {selected.points} GPS points
                </summary>
                <ul className="mt-2 max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line bg-panel">
                  {selected.track.map((p) => (
                    <li key={p.recorded_at} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <span className="font-mono text-xs">{formatTime(p.recorded_at)}</span>
                      <span className="font-mono text-xs text-text-dim">
                        {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                      </span>
                      <a
                        href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-teal"
                      >
                        Map
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          )}
        </>
      )}
    </>
  );
}

// Distance per day, one bar per day in the period. A bar is also a button:
// tapping it shows that day's route below. Hover/focus shows the value.
function DistanceChart({ days, byDay, selected, onSelect }) {
  const max = Math.max(...days.map((day) => byDay[day]?.distanceKm || 0), 0.1);
  const labelEvery = days.length > 14 ? 7 : 1;

  return (
    <figure className="mb-4 rounded-2xl border border-line bg-panel p-4">
      <figcaption className="mb-3 flex items-baseline justify-between gap-3">
        <span className="font-display text-base font-semibold">Distance per day</span>
        <span className="text-xs text-text-faint">Tap a day for its route</span>
      </figcaption>
      <div className="flex h-44 items-end gap-[2px] border-b border-line pt-8">
        {days.map((day) => {
          const km = byDay[day]?.distanceKm || 0;
          const isSelected = day === selected;
          return (
            <button
              key={day}
              type="button"
              onClick={() => byDay[day] && onSelect(day)}
              disabled={!byDay[day]}
              aria-label={`${formatDay(day)}: ${formatKm(km)}`}
              aria-pressed={isSelected}
              className="group flex h-full min-w-0 flex-1 items-end justify-center disabled:cursor-default"
            >
              <span
                className="relative block w-full max-w-7"
                style={{ height: km ? `${Math.max((km / max) * 100, 3)}%` : "0%" }}
              >
                <span
                  className={`absolute inset-0 rounded-t-[4px] bg-teal transition-opacity ${
                    isSelected ? "opacity-100" : "opacity-40 group-hover:opacity-70"
                  }`}
                />
                <span
                  className={`pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-text px-2 py-1 text-xs font-semibold text-panel ${
                    isSelected ? "block" : "hidden group-hover:block group-focus-visible:block"
                  }`}
                >
                  {formatKm(km)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[2px]" aria-hidden="true">
        {days.map((day, index) => (
          <span key={day} className="min-w-0 flex-1 text-center text-[0.65rem] text-text-faint">
            {index % labelEvery === 0 ? Number(day.slice(8)) : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}
