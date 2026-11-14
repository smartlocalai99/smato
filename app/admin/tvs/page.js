"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import TvCard from "@/components/admin/TvCard";
import { isPending, latestByDevice, needsTvSetup } from "@/lib/tvAdmin";

// Quick while a command is on its way, so its progress shows as the TV
// acknowledges each step; slow otherwise. Never while the page is hidden.
const ACTIVE_REFRESH_MS = 5000;
const IDLE_REFRESH_MS = 60000;

export default function TvsPage() {
  const [tvs, setTvs] = useState([]);
  const [latest, setLatest] = useState({});
  const [secrets, setSecrets] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [setupNeeded, setSetupNeeded] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: devices, error: devicesError } = await supabase
        .from("autos")
        .select("*")
        .eq("device_type", "tv")
        .order("auto_number");
      if (devicesError) throw devicesError;
      const numbers = (devices || []).map((d) => d.auto_number);

      const [commands, secretRows] = numbers.length
        ? await Promise.all([
            supabase
              .from("device_commands")
              .select("*")
              .in("auto_number", numbers)
              .order("created_at", { ascending: false })
              .limit(200),
            supabase.from("device_secrets").select("auto_number,recovery_pin_hash,token_hash").in("auto_number", numbers),
          ])
        : [{ data: [] }, { data: [] }];
      if (commands.error) throw commands.error;

      setTvs(devices || []);
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
      <header className="mb-5 sm:mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">TVs</h1>
        <p className="mt-1 max-w-xl text-text-dim">
          Smart TVs running SMATO. Start or stop advertising mode, and unlock a TV to hand it back to normal use.
        </p>
      </header>

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
                onChange={load}
              />
            ))}
          </ul>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-line p-8 text-sm leading-relaxed text-text-dim">
          <p className="font-semibold text-text">No TVs yet.</p>
          <p className="mt-1">
            Install the latest SMATO APK on an Android TV and open it. It suggests a number like TV-01; save it, and the
            TV appears here within a few minutes. It plays ads full screen and locked; Unlock TV hands it back.
          </p>
        </div>
      )}
    </main>
  );
}
