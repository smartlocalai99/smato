"use client";

import { useCallback, useEffect, useState } from "react";
import nextDynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { todayStr } from "@/lib/time";
import { reverseGeocode } from "@/lib/geocode";

const RouteMap = nextDynamic(() => import("@/components/RouteMap"), { ssr: false });

export const dynamic = "force-dynamic";

const fieldClass =
  "rounded-md border border-line bg-ink px-3 py-2.5 text-text focus:border-teal focus:outline-none";
const labelClass = "font-mono text-xs tracking-wide text-text-dim";

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function totalDistanceKm(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += haversineKm(points[i - 1], points[i]);
  return total;
}

function dayBoundsIso(dateStr) {
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export default function ReportsPage() {
  const [autos, setAutos] = useState([]);
  const [autoNumber, setAutoNumber] = useState("");
  const [dateStr, setDateStr] = useState(() => todayStr());
  const [points, setPoints] = useState([]);
  const [addresses, setAddresses] = useState({ start: null, end: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .from("autos")
      .select("auto_number")
      .order("auto_number")
      .then(({ data }) => {
        const list = data || [];
        setAutos(list);
        setAutoNumber((current) => current || list[0]?.auto_number || "");
      });
  }, []);

  const load = useCallback(async () => {
    if (!autoNumber) return;
    setLoading(true);
    setError("");
    setAddresses({ start: null, end: null });
    try {
      const { startIso, endIso } = dayBoundsIso(dateStr);
      const { data, error: fetchError } = await supabase
        .from("auto_locations")
        .select("lat,lng,accuracy,recorded_at")
        .eq("auto_number", autoNumber)
        .gte("recorded_at", startIso)
        .lt("recorded_at", endIso)
        .order("recorded_at");
      if (fetchError) throw fetchError;
      setPoints(data || []);
      if (data?.length) {
        reverseGeocode(data[0].lat, data[0].lng).then((addr) =>
          setAddresses((a) => ({ ...a, start: addr }))
        );
        const last = data[data.length - 1];
        reverseGeocode(last.lat, last.lng).then((addr) => setAddresses((a) => ({ ...a, end: addr })));
      }
    } catch (err) {
      setError(err.message || "Couldn't load this route.");
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }, [autoNumber, dateStr]);

  useEffect(() => {
    load();
  }, [load]);

  const distanceKm = totalDistanceKm(points);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-10">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Reports</h1>
        <p className="mt-1 text-text-dim">
          Where an auto actually went on a given day — GPS fixes are kept permanently, unlike the live
          Fleet view which only ever shows the latest one.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reportAuto" className={labelClass}>
            Auto
          </label>
          <select
            id="reportAuto"
            value={autoNumber}
            onChange={(e) => setAutoNumber(e.target.value)}
            className={fieldClass}
          >
            {autos.map((a) => (
              <option key={a.auto_number} value={a.auto_number}>
                {a.auto_number}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reportDate" className={labelClass}>
            Date
          </label>
          <input
            id="reportDate"
            type="date"
            value={dateStr}
            max={todayStr()}
            onChange={(e) => setDateStr(e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-text-dim" role="status">Loading route…</p>
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
      ) : !points.length ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-text-dim">
          No GPS fixes recorded for {autoNumber || "this auto"} on {dateStr}.
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <Stat label="Points logged" value={points.length} />
            <Stat
              label="First seen"
              value={new Date(points[0].recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            />
            <Stat
              label="Last seen"
              value={new Date(points[points.length - 1].recorded_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            />
            <Stat label="Distance covered" value={`${distanceKm.toFixed(1)} km (approx.)`} />
          </div>

          <RouteMap points={points} />

          <p className="mt-3 text-sm text-text-dim">
            {addresses.start || "…"} <span className="text-text-faint">→</span> {addresses.end || "…"}
          </p>

          <details className="mt-6">
            <summary className="cursor-pointer font-mono text-xs uppercase tracking-wide text-text-faint">
              All {points.length} points
            </summary>
            <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-line">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-panel-2 text-left font-mono text-[0.66rem] uppercase tracking-wide text-text-faint">
                    <th scope="col" className="px-4 py-2 font-medium">Time</th>
                    <th scope="col" className="px-4 py-2 font-medium">Coordinates</th>
                    <th scope="col" className="px-4 py-2" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={p.recorded_at} className="border-t border-line">
                      <td className="px-4 py-2 font-mono text-xs">
                        {new Date(p.recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-text-dim">
                        {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <a
                          href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-teal"
                        >
                          View
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-4 py-2.5">
      <span className="font-mono text-[0.66rem] uppercase tracking-wide text-text-faint">{label}</span>
      <div className="font-display text-lg font-semibold">{value}</div>
    </div>
  );
}
