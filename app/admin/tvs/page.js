"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import TvCard from "@/components/admin/TvCard";
import { claimTvCode, isPending, latestByDevice, needsTvSetup } from "@/lib/tvAdmin";

// Quick while a command is on its way, so its progress shows as the TV
// acknowledges each step; slow otherwise. Never while the page is hidden.
const ACTIVE_REFRESH_MS = 5000;
const IDLE_REFRESH_MS = 60000;

export default function TvsPage() {
  const [tvs, setTvs] = useState([]);
  const [latest, setLatest] = useState({});
  const [secrets, setSecrets] = useState({});
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: devices, error: devicesError } = await supabase
        .from("autos")
        .select("*")
        .eq("device_type", "tv")
        .order("auto_number");
      if (devicesError) throw devicesError;
      const numbers = (devices || []).map((d) => d.auto_number);

      const [commands, secretRows, adRows] = numbers.length
        ? await Promise.all([
            supabase
              .from("device_commands")
              .select("*")
              .in("auto_number", numbers)
              .order("created_at", { ascending: false })
              .limit(200),
            supabase.from("device_secrets").select("auto_number,recovery_pin_hash,token_hash").in("auto_number", numbers),
            // For each TV's playlist (lib/tvAdmin tvPlaylist).
            supabase
              .from("ads")
              .select("id,title,auto_number,active,start_date,end_date,sort_order,media_type")
              .order("sort_order"),
          ])
        : [{ data: [] }, { data: [] }, { data: [] }];
      if (commands.error) throw commands.error;

      setTvs(devices || []);
      setAds(adRows.data || []);
      setLatest(latestByDevice(commands.data || []));
      // Only whether a PIN / pairing exists ever reaches the page, not the hashes.
      setSecrets(
        Object.fromEntries(
          (secretRows.data || []).map((s) => [
            s.auto_number,
            { pinSet: Boolean(s.recovery_pin_hash), paired: Boolean(s.token_hash) },
          ])
        )
      );
      setSetupNeeded(false);
      setError("");
    } catch (err) {
      if (needsTvSetup(err)) setSetupNeeded(true);
      else setError(err.message || "Couldn't load the TVs.");
    } finally {
      setLoading(false);
    }
  }, []);

  const anyPending = Object.values(latest).some(isPending);

  useEffect(() => {
    load();
    const id = setInterval(
      () => document.visibilityState === "visible" && load(),
      anyPending ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS
    );
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, anyPending]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header className="mb-5 flex items-start justify-between gap-3 sm:mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">TVs</h1>
          <p className="mt-1 max-w-xl text-text-dim">
            Smart TVs playing your ads. Link a new one with the code on its screen.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setRefreshing(true);
            load().finally(() => setRefreshing(false));
          }}
          disabled={refreshing}
          className="min-h-10 flex-none rounded-full border border-line px-4 text-sm font-semibold hover:border-text-faint disabled:cursor-wait disabled:opacity-60"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {!loading && !setupNeeded && <AddTvForm tvs={tvs} onAdded={load} />}

      {loading ? (
        <p className="text-sm text-text-dim" role="status">Loading TVs…</p>
      ) : setupNeeded ? (
        <div className="rounded-2xl border border-amber/40 bg-amber/10 p-5 text-sm leading-relaxed">
          <p className="font-semibold">TV control needs a one-time database update.</p>
          <p className="mt-1 text-text-dim">
            In Supabase, open SQL Editor, paste everything from <code>docs/sql/tv-control.sql</code> in the project,
            and run it. Then reload this page.
          </p>
        </div>
      ) : error && !tvs.length ? (
        <div className="rounded-2xl border border-red/25 bg-red/[0.06] p-6 text-center" role="alert">
          <p className="text-red">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-3 min-h-11 rounded-full border border-line px-4 text-sm font-semibold hover:border-text-faint"
          >
            Try again
          </button>
        </div>
      ) : tvs.length ? (
        <>
          {error && (
            <p className="mb-4 text-sm text-red" role="alert">
              {error}
            </p>
          )}
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label="TVs">
            {tvs.map((device) => (
              <TvCard
                key={device.id}
                device={device}
                latest={latest[device.auto_number]}
                secrets={secrets[device.auto_number]}
                ads={ads}
                onChange={load}
              />
            ))}
          </ul>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-line p-8 text-sm leading-relaxed text-text-dim">
          <p className="font-semibold text-text">No TVs linked yet.</p>
          <p className="mt-1">
            Install SMATO Ads (smato-tv.apk) on the TV and open it. A 6-digit code shows in the corner; enter it above
            with a name, and the TV appears here.
          </p>
        </div>
      )}
    </main>
  );
}

// TV-01, TV-02, … — the next unused name, as a suggestion.
function nextTvName(tvs) {
  const used = tvs.map((t) => /^TV-(\d+)$/.exec(t.auto_number)).filter(Boolean).map((m) => parseInt(m[1], 10));
  return `TV-${String((used.length ? Math.max(...used) : 0) + 1).padStart(2, "0")}`;
}

// Linking a TV: the code SMATO Ads shows on screen, plus a name for it.
function AddTvForm({ tvs, onAdded }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    const finalName = (name.trim() || nextTvName(tvs)).toUpperCase();
    if (code.length !== 6) {
      setStatus({ type: "error", text: "Enter the 6-digit code shown on the TV." });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const saved = await claimTvCode(supabase, code, finalName);
      setStatus({ type: "ok", text: `Linked as ${saved}. The TV confirms within a few seconds.` });
      setCode("");
      setName("");
      onAdded();
    } catch (err) {
      setStatus({ type: "error", text: err.message || "Couldn't link that TV." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-5 rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <h2 className="font-semibold">Add a TV</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tvCode" className="text-xs text-text-faint">
            Code on the TV
          </label>
          <input
            id="tvCode"
            inputMode="numeric"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="482913"
            className="h-11 rounded-lg border border-line bg-ink px-3 font-mono text-lg tracking-widest text-text focus:border-teal focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tvName" className="text-xs text-text-faint">
            Name
          </label>
          <input
            id="tvName"
            value={name}
            autoCapitalize="characters"
            onChange={(e) => setName(e.target.value)}
            placeholder={nextTvName(tvs)}
            className="h-11 rounded-lg border border-line bg-ink px-3 text-base text-text focus:border-teal focus:outline-none sm:text-sm"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 w-full rounded-full bg-amber px-5 font-semibold text-on-amber hover:bg-[#ffc250] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {busy ? "Linking…" : "Link TV"}
          </button>
        </div>
      </div>
      {status && (
        <p className={`mt-3 text-sm ${status.type === "error" ? "text-red" : "text-green"}`} role="status">
          {status.text}
        </p>
      )}
    </form>
  );
}
