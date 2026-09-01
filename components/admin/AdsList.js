"use client";

import { useState } from "react";
import { supabase, adFileUrl, ADS_BUCKET, notifyAdsChanged } from "@/lib/supabase";
import { todayStr } from "@/lib/time";

// Why an ad isn't in the "Running now" list — distinct from just "not
// running," since the fix is different for each (nothing to do, wait, or
// extend the date). Shared between the dashboard's Running now list and
// the dedicated History page.
export function adStatus(ad) {
  if (!ad.active) return "paused";
  const today = todayStr();
  if (ad.start_date && today < ad.start_date) return "upcoming";
  if (ad.end_date && today > ad.end_date) return "expired";
  return "running";
}

const STATUS_STYLES = {
  running: "bg-green/10 text-green",
  upcoming: "bg-teal/10 text-teal",
  expired: "bg-text-faint/15 text-text-faint",
  paused: "bg-amber/10 text-amber",
};

export default function AdsList({ ads, onChange, emptyMessage, showOrder = true }) {
  const [busyId, setBusyId] = useState(null);

  async function toggleActive(ad) {
    setBusyId(ad.id);
    await supabase.from("ads").update({ active: !ad.active }).eq("id", ad.id);
    setBusyId(null);
    notifyAdsChanged();
    onChange();
  }

  async function removeAd(ad) {
    if (!confirm(`Delete "${ad.title}"? This can't be undone.`)) return;
    setBusyId(ad.id);
    await supabase.storage.from(ADS_BUCKET).remove([ad.file_path]);
    await supabase.from("ads").delete().eq("id", ad.id);
    setBusyId(null);
    notifyAdsChanged();
    onChange();
  }

  if (!ads.length) {
    return (
      <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-text-dim">
        {emptyMessage}
      </div>
    );
  }

  // An ad only competes for a rotation slot against ads targeting the same
  // auto (or "All autos", which folds into every auto's own rotation) — not
  // against every ad in the list, which can span several different tablets.
  const groupCounts = new Map();
  const positions = ads.map((ad) => {
    const key = ad.auto_number || "ALL";
    const position = (groupCounts.get(key) || 0) + 1;
    groupCounts.set(key, position);
    return position;
  });

  return (
    <div className="flex flex-col gap-2.5">
      {ads.map((ad, index) => {
        const status = adStatus(ad);
        return (
          <div
            key={ad.id}
            className="grid grid-cols-1 items-center gap-2 rounded-lg border border-line bg-panel p-4 sm:grid-cols-[1fr_auto]"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">
                  <a href={adFileUrl(ad.file_path)} target="_blank" rel="noreferrer">
                    {ad.title}
                  </a>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[0.66rem] uppercase tracking-wide ${STATUS_STYLES[status]}`}
                >
                  {status}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-3 font-mono text-xs text-text-dim">
                <span className="text-amber">{ad.auto_number || "all autos"}</span>
                <span className="text-amber">{ad.media_type === "image" ? "image" : "video"}</span>
                <span>
                  {ad.start_date || "no start"} → {ad.end_date || "no end"}
                </span>
                {showOrder && (
                  <span>plays {positions[index]} of {groupCounts.get(ad.auto_number || "ALL")} here</span>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2">
              <button
                disabled={busyId === ad.id}
                onClick={() => toggleActive(ad)}
                className="rounded-md border border-line bg-panel-2 px-3 py-1.5 text-sm font-semibold text-text hover:border-text-faint disabled:cursor-not-allowed disabled:opacity-50"
              >
                {ad.active ? "Pause" : "Resume"}
              </button>
              <button
                disabled={busyId === ad.id}
                onClick={() => removeAd(ad)}
                className="rounded-md border border-line bg-panel-2 px-3 py-1.5 text-sm font-semibold text-red hover:border-red disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
