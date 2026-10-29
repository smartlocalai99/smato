"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AutoCard from "@/components/admin/AutoCard";

const fieldClass =
  "rounded-md border border-line bg-ink px-3 py-2.5 text-base text-text focus:border-teal focus:outline-none sm:text-sm";
const labelClass = "font-mono text-xs tracking-wide text-text-dim";

// Drivers are linked to an auto by the number picked on their form, stored
// the same way: no spaces, upper case.
function autoKey(value) {
  return String(value || "").replace(/\s/g, "").toUpperCase();
}

export default function AutosPage() {
  const [autos, setAutos] = useState([]);
  const [drivers, setDrivers] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Only the first load shows "Loading autos…". Reloading after an action
  // keeps the cards where they are, so a phone doesn't jump back to the top.
  const load = useCallback(async () => {
    setError("");
    try {
      const [autosResult, driversResult] = await Promise.all([
        supabase.from("autos").select("*").order("auto_number"),
        supabase.from("drivers").select("id,name,mobile,auto_number_plate"),
      ]);
      if (autosResult.error) throw autosResult.error;
      setAutos(autosResult.data || []);
      // A failed driver lookup only leaves the driver lines empty.
      if (!driversResult.error) {
        setDrivers(
          Object.fromEntries((driversResult.data || []).map((d) => [autoKey(d.auto_number_plate), d]))
        );
      }
    } catch (err) {
      setError(err.message || "Couldn't load autos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header className="mb-5 sm:mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Autos</h1>
        <p className="mt-1 max-w-xl text-text-dim">
          Every tablet in the fleet: who drives it, its SIM number, and its live status.
        </p>
      </header>

      <AddAutoForm onAdded={load} />

      {loading ? (
        <p className="mt-6 text-sm text-text-dim" role="status">Loading autos…</p>
      ) : error && !autos.length ? (
        <div className="mt-6 rounded-2xl border border-red/25 bg-red/[0.06] p-6 text-center" role="alert">
          <p className="text-red">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-3 min-h-11 rounded-full border border-line px-4 text-sm font-semibold hover:border-text-faint"
          >
            Try again
          </button>
        </div>
      ) : autos.length ? (
        <>
          {error && (
            <p className="mt-6 text-sm text-red" role="alert">
              {error}
            </p>
          )}
          {/* grid-cols-1 rather than a bare grid: its column can shrink below
              the cards' content, so a long driver name truncates instead of
              pushing the card past the edge of a phone screen. */}
          <ul className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2" aria-label="Tablets">
            {autos.map((auto) => (
              <AutoCard
                key={auto.id}
                auto={auto}
                autos={autos}
                driver={drivers[autoKey(auto.auto_number)]}
                onChange={load}
              />
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-6 rounded-2xl border border-dashed border-line p-10 text-center text-text-dim">
          No autos yet — add one above, or open the player link on a tablet.
        </p>
      )}
    </main>
  );
}

function AddAutoForm({ onAdded }) {
  const [autoNumber, setAutoNumberValue] = useState("");
  const [simNumber, setSimNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    const number = autoNumber.trim().toUpperCase();
    if (!number) {
      setError("Enter an auto number.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: upsertError } = await supabase
        .from("autos")
        .upsert({ auto_number: number, sim_number: simNumber.trim() || null }, { onConflict: "auto_number" });
      if (upsertError) throw upsertError;
      setAutoNumberValue("");
      setSimNumber("");
      onAdded();
    } catch (err) {
      setError(err.message || "Couldn't add that auto.");
    } finally {
      setBusy(false);
    }
  }

  // Folded away by default: tablets add themselves the first time they open
  // the player, so the list — not this form — is what a phone shows first.
  return (
    <details className="group rounded-2xl border border-line bg-panel">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 font-semibold sm:px-6 [&::-webkit-details-marker]:hidden">
        Add an auto
        <svg
          viewBox="0 0 20 20"
          className="h-5 w-5 flex-none text-text-faint transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          fill="none"
          aria-hidden="true"
        >
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <form onSubmit={handleSubmit} className="border-t border-line p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="newAutoNumber" className={labelClass}>Auto number</label>
            <input
              id="newAutoNumber"
              value={autoNumber}
              onChange={(e) => setAutoNumberValue(e.target.value)}
              placeholder="AUTO-12"
              autoCapitalize="characters"
              className={fieldClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="newSimNumber" className={labelClass}>SIM number (optional)</label>
            <input
              id="newSimNumber"
              type="tel"
              inputMode="tel"
              value={simNumber}
              onChange={(e) => setSimNumber(e.target.value)}
              placeholder="98765 43210"
              className={fieldClass}
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 w-full rounded-full bg-amber px-5 font-semibold text-on-amber transition-all hover:bg-[#ffc250] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {busy ? "Adding…" : "Add auto"}
            </button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red" role="alert">{error}</p>}
      </form>
    </details>
  );
}
