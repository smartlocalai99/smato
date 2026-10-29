"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase, setAutoScreen, renumberAuto } from "@/lib/supabase";
import PhoneActions from "@/components/admin/PhoneActions";
import { STATUS_STYLES, autoStatus, batteryLabel, batteryStyle, timeAgo } from "@/lib/autoStatus";

const actionClass =
  "min-h-11 rounded-full px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

function initials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

// Who drives this auto, with call/WhatsApp — or, when nobody is linked yet,
// a shortcut to register a driver with this auto already picked.
function DriverStrip({ driver, autoNumber }) {
  if (!driver) {
    return (
      <div className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-dashed border-line px-3 py-2">
        <span className="text-sm text-text-dim">No driver linked</span>
        <Link
          href={`/admin/drivers/new?auto=${encodeURIComponent(autoNumber)}`}
          className="flex min-h-10 flex-none items-center rounded-full px-3 text-sm font-semibold text-teal no-underline hover:bg-panel-2"
        >
          Add driver
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-14 items-center gap-3 rounded-xl bg-panel-2 px-3 py-2">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-line bg-panel font-display text-xs font-semibold text-text-dim"
      >
        {initials(driver.name)}
      </span>
      <Link href={`/admin/drivers/${driver.id}`} className="min-w-0 flex-1 no-underline">
        <span className="block break-words text-sm font-semibold leading-snug text-text">{driver.name}</span>
        <span className="block text-xs text-text-dim">{driver.mobile}</span>
      </Link>
      <PhoneActions number={driver.mobile} name={driver.name} size="lg" />
    </div>
  );
}

// One tablet on the Autos page, laid out for a phone first: status, its
// driver, its SIM, and every action as a thumb-sized button — nothing
// hidden off the side of the screen.
export default function AutoCard({ auto, autos, driver, onChange }) {
  const [simNumber, setSimNumber] = useState(auto.sim_number || "");
  const [simBusy, setSimBusy] = useState(false);
  const [simError, setSimError] = useState("");
  const [screenBusy, setScreenBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [renumberBusy, setRenumberBusy] = useState(false);

  const s = autoStatus(auto);
  const styles = STATUS_STYLES[s];
  const simChanged = simNumber.trim() !== (auto.sim_number || "");
  const simId = `sim-${auto.id}`;

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
    <li className={`flex min-w-0 flex-col gap-3 rounded-2xl border bg-panel p-4 ${styles.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2">
            <span className={`h-2 w-2 flex-none rounded-full ${styles.dot}`} aria-hidden="true" />
            <span className="font-mono text-lg font-semibold leading-none">{auto.auto_number}</span>
            <span className={`text-xs font-semibold capitalize ${styles.text}`}>{s}</span>
          </h2>
          <p className="mt-1.5 text-xs text-text-dim">
            {auto.last_seen_at ? `Last seen ${timeAgo(auto.last_seen_at)}` : "Hasn't checked in yet"}
          </p>
        </div>
        <div className="flex flex-none flex-col items-end gap-1.5">
          {auto.battery_level != null && (
            <span
              className={`font-mono text-sm ${batteryStyle(auto.battery_level, auto.battery_charging)}`}
              title={batteryLabel(auto.battery_level, auto.battery_charging)}
              aria-label={`Battery ${batteryLabel(auto.battery_level, auto.battery_charging)}`}
            >
              {auto.battery_level}%{auto.battery_charging ? " ⚡" : ""}
            </span>
          )}
          {auto.screen_off && (
            <span className="rounded-full bg-red/10 px-2 py-0.5 text-[0.7rem] font-semibold text-red">Screen off</span>
          )}
        </div>
      </div>

      {auto.renumber_to && (
        <p className="rounded-xl bg-amber/15 px-3 py-2 text-xs text-text">
          Moving to <span className="font-mono font-semibold">{auto.renumber_to}</span> the next time this
          tablet is online.
        </p>
      )}

      <DriverStrip driver={driver} autoNumber={auto.auto_number} />

      <div>
        <div className="flex items-center gap-2">
          <label htmlFor={simId} className="w-9 flex-none text-xs text-text-faint">
            SIM
          </label>
          <input
            id={simId}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={simNumber}
            onChange={(e) => setSimNumber(e.target.value)}
            placeholder="Add SIM number"
            className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 text-base text-text focus:border-teal focus:outline-none sm:text-sm"
          />
          {simChanged ? (
            <button
              type="button"
              onClick={saveSim}
              disabled={simBusy}
              className="h-10 flex-none rounded-full bg-amber px-4 text-sm font-semibold text-on-amber transition-colors hover:bg-[#ffc250] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {simBusy ? "Saving…" : "Save"}
            </button>
          ) : (
            <PhoneActions number={auto.sim_number} name={`${auto.auto_number} SIM`} size="lg" />
          )}
        </div>
        {simError && (
          <p className="mt-1 text-xs text-red" role="alert">
            {simError}
          </p>
        )}
      </div>

      <div className="mt-auto border-t border-line pt-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={toggleScreen}
            disabled={screenBusy}
            className={`${actionClass} ${
              auto.screen_off
                ? "bg-amber text-on-amber hover:bg-[#ffc250]"
                : "border border-line text-text hover:border-text-faint"
            }`}
          >
            {screenBusy ? "Saving…" : auto.screen_off ? "Turn on screen" : "Turn off screen"}
          </button>
          <button
            type="button"
            onClick={handleRenumber}
            disabled={renumberBusy}
            className={`${actionClass} border border-line text-text hover:border-text-faint`}
          >
            {renumberBusy ? "Saving…" : "Change number"}
          </button>
        </div>
        {/* Rare and permanent, so it sits apart from the everyday buttons,
            quiet, where a thumb won't catch it by accident. */}
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteBusy}
            aria-label={`Delete ${auto.auto_number}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-text-faint transition-colors hover:bg-red/10 hover:text-red disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
              <path
                d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6m2 0-.6 9.1a1.5 1.5 0 0 1-1.5 1.4H8.1a1.5 1.5 0 0 1-1.5-1.4L6 6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {deleteBusy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </li>
  );
}
