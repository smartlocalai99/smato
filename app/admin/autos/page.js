"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, setAutoScreen, renumberAuto } from "@/lib/supabase";
import PhoneActions from "@/components/admin/PhoneActions";
import { STATUS_STYLES, autoStatus, batteryLabel, batteryStyle, timeAgo } from "@/lib/autoStatus";

const fieldClass =
  "rounded-md border border-line bg-ink px-3 py-2.5 text-text focus:border-teal focus:outline-none";
const labelClass = "font-mono text-xs tracking-wide text-text-dim";

export default function AutosPage() {
  const [autos, setAutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: fetchError } = await supabase.from("autos").select("*").order("auto_number");
      if (fetchError) throw fetchError;
      setAutos(data || []);
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
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-10">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Autos</h1>
        <p className="mt-1 max-w-xl text-text-dim">
          Every tablet in the fleet, its SIM number, and its live status.
        </p>
      </header>

      <AddAutoForm onAdded={load} />

      {loading ? (
        <p className="mt-6 text-sm text-text-dim" role="status">Loading autos…</p>
      ) : error ? (
        <div className="mt-6 rounded-2xl border border-red/25 bg-red/[0.06] p-6 text-center" role="alert">
          <p className="text-red">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-3 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-text-faint"
          >
            Try again
          </button>
        </div>
      ) : autos.length ? (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="bg-panel-2 text-left font-mono text-[0.66rem] uppercase tracking-wide text-text-faint">
                <th scope="col" className="px-4 py-3 font-medium">Auto</th>
                <th scope="col" className="px-4 py-3 font-medium">SIM number</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Battery</th>
                <th scope="col" className="px-4 py-3 font-medium">Last seen</th>
                <th scope="col" className="px-4 py-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {autos.map((auto) => (
                <AutoRow key={auto.id} auto={auto} autos={autos} onChange={load} />
              ))}
            </tbody>
          </table>
        </div>
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

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="newAutoNumber" className={labelClass}>Auto number</label>
          <input
            id="newAutoNumber"
            value={autoNumber}
            onChange={(e) => setAutoNumberValue(e.target.value)}
            placeholder="AUTO-06"
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="newSimNumber" className={labelClass}>SIM number (optional)</label>
          <input
            id="newSimNumber"
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
            className="w-full rounded-full bg-amber px-5 py-2.5 font-semibold text-on-amber transition-all hover:bg-[#ffc250] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {busy ? "Adding…" : "Add auto"}
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red" role="alert">{error}</p>}
    </form>
  );
}

function AutoRow({ auto, autos, onChange }) {
  const [simNumber, setSimNumber] = useState(auto.sim_number || "");
  const [simBusy, setSimBusy] = useState(false);
  const [simError, setSimError] = useState("");
  const [screenBusy, setScreenBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [renumberBusy, setRenumberBusy] = useState(false);

  const s = autoStatus(auto);
  const styles = STATUS_STYLES[s];
  const simChanged = simNumber.trim() !== (auto.sim_number || "");

  async function saveSim() {
    setSimBusy(true);
    setSimError("");
    try {
      const { error } = await supabase
        .from("autos")
        .update({ sim_number: simNumber.trim() || null })
        .eq("id", auto.id);
      if (error) throw error;
      onChange();
    } catch (err) {
      setSimError(err.message || "Couldn't save that SIM number.");
    } finally {
      setSimBusy(false);
    }
  }

  async function toggleScreen() {
    setScreenBusy(true);
    try {
      await setAutoScreen(auto.auto_number, !auto.screen_off);
      onChange();
    } finally {
      setScreenBusy(false);
    }
  }

  // For a tablet set up with the wrong number (or moved to another auto).
  // Only ever from here — the tablet itself has no way to change it.
  async function handleRenumber() {
    const input = prompt(
      `Which auto is the tablet now reporting as ${auto.auto_number} really in?`,
      auto.renumber_to || ""
    );
    if (input === null) return;
    const to = input.trim().toUpperCase();
    if (!to || to === auto.auto_number) return;

    const target = autos.find((a) => a.auto_number === to);
    if (
      target &&
      autoStatus(target) === "online" &&
      !confirm(`${to} already has a tablet online. Move this one to ${to} too?`)
    ) {
      return;
    }

    setRenumberBusy(true);
    try {
      await renumberAuto(auto.auto_number, to);
      onChange();
    } catch (err) {
      alert(
        /renumber_to/.test(err.message || "")
          ? "The database needs a one-time update first: in Supabase → SQL Editor, run\n\nalter table autos add column if not exists renumber_to text;"
          : err.message || "Couldn't change that tablet's number."
      );
    } finally {
      setRenumberBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete ${auto.auto_number}? This removes it from the fleet for good.`)) return;
    setDeleteBusy(true);
    try {
      const { error } = await supabase.from("autos").delete().eq("id", auto.id);
      if (error) throw error;
      onChange();
    } catch (err) {
      setDeleteBusy(false);
      alert(err.message || "Couldn't delete that auto.");
    }
  }

  return (
    <tr className="border-t border-line align-top">
      <td className="px-4 py-3 font-mono font-semibold">
        {auto.auto_number}
        {auto.renumber_to && (
          <p className="mt-1 text-xs font-normal text-amber">
            moving to {auto.renumber_to} — when the tablet is next online
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={simNumber}
            onChange={(e) => setSimNumber(e.target.value)}
            placeholder="not set"
            className="w-36 rounded-md border border-line bg-ink px-2.5 py-1.5 text-sm text-text focus:border-teal focus:outline-none"
          />
          {simChanged ? (
            <button
              type="button"
              onClick={saveSim}
              disabled={simBusy}
              className="whitespace-nowrap rounded-md border border-line bg-panel-2 px-2.5 py-1.5 text-xs font-semibold hover:border-text-faint disabled:cursor-not-allowed disabled:opacity-50"
            >
              {simBusy ? "Saving…" : "Save"}
            </button>
          ) : (
            <PhoneActions number={auto.sim_number} name={auto.auto_number} />
          )}
        </div>
        {simError && <p className="mt-1 text-xs text-red">{simError}</p>}
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 flex-none rounded-full ${styles.dot}`} />
          <span className={`font-mono text-xs uppercase tracking-wide ${styles.text}`}>{s}</span>
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={`font-mono text-xs ${batteryStyle(auto.battery_level, auto.battery_charging)}`}>
          {batteryLabel(auto.battery_level, auto.battery_charging)}
        </span>
      </td>
      <td className="px-4 py-3 text-text-dim">{timeAgo(auto.last_seen_at)}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={toggleScreen}
            disabled={screenBusy}
            className="whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-text-faint disabled:cursor-not-allowed disabled:opacity-50"
          >
            {screenBusy ? "…" : auto.screen_off ? "Turn on" : "Turn off"}
          </button>
          <button
            type="button"
            onClick={handleRenumber}
            disabled={renumberBusy}
            className="whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-text-faint disabled:cursor-not-allowed disabled:opacity-50"
          >
            {renumberBusy ? "…" : "Change number"}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteBusy}
            className="whitespace-nowrap rounded-full border border-red/35 px-3 py-1.5 text-xs font-semibold text-red hover:border-red disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleteBusy ? "…" : "Delete"}
          </button>
        </div>
      </td>
    </tr>
  );
}
