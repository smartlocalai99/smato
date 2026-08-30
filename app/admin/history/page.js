"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isAdCurrentlyRunning } from "@/lib/time";
import AdsList from "@/components/admin/AdsList";

export const dynamic = "force-dynamic";

export default function HistoryPage() {
  const [ads, setAds] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadAds = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("ads").select("*").order("sort_order");
    if (error) setLoadError(error.message);
    else setAds(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAds();
  }, [loadAds]);

  const history = ads
    .filter((ad) => !isAdCurrentlyRunning(ad))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-10">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">History</h1>
        <p className="mt-1 text-text-dim">
          Ads that aren&apos;t live right now — paused, not started yet, or already finished.
        </p>
      </header>

      {loadError && <div className="mb-4 text-sm text-red">{loadError}</div>}

      {loading ? (
        <p className="text-sm text-text-dim" role="status">Loading…</p>
      ) : (
        <AdsList ads={history} onChange={loadAds} emptyMessage="Nothing here yet." />
      )}
    </main>
  );
}
