// Server-only data for the estimate page. Uses the service role key (so
// it can read driver names and GPS history) and never sends it anywhere —
// the page only ever receives the finished, trimmed-down estimate.
//
// Both reads are cached on the server and shared by everyone viewing, so
// however many people have the page open, the database sees at most one
// fleet read every 2 minutes and one distance read every 15.
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { fetchLocations, summarizeTrack } from "@/lib/reports";
import { buildEstimate, istClock } from "@/lib/estimate";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server is missing the Supabase URL or service role key.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const loadFleet = unstable_cache(
  async () => {
    const supabase = serviceClient();
    const [autos, drivers, ads] = await Promise.all([
      supabase.from("autos").select("auto_number,last_lat,last_lng,last_seen_at,now_playing_title"),
      supabase.from("drivers").select("name,auto_number_plate"),
      supabase.from("ads").select("title,auto_number,active,start_date,end_date,sort_order"),
    ]);
    if (autos.error) throw autos.error;
    return { autos: autos.data || [], drivers: drivers.data || [], ads: ads.data || [] };
  },
  ["estimate-fleet"],
  { revalidate: 120 }
);

// Keyed by the India-time date, so a new day starts from zero.
const loadDistance = unstable_cache(
  async (day) => {
    const { dayStartIso } = istClock();
    const rows = await fetchLocations(serviceClient(), {
      startIso: dayStartIso,
      endIso: new Date().toISOString(),
    });
    const byAuto = {};
    for (const row of rows) (byAuto[row.auto_number] ||= []).push(row);
    return Object.fromEntries(
      Object.entries(byAuto).map(([autoNumber, points]) => {
        const { distanceKm, onlineMinutes } = summarizeTrack(points);
        return [autoNumber, { km: distanceKm, minutes: onlineMinutes }];
      })
    );
  },
  ["estimate-distance-v2"],
  { revalidate: 900 }
);

export async function getEstimate() {
  const [fleet, statsByAuto] = await Promise.all([
    loadFleet(),
    // A failed distance read just shows no distance or time yet.
    loadDistance(istClock().day).catch(() => ({})),
  ]);
  return buildEstimate({ ...fleet, statsByAuto });
}

// The link's secret part, compared without leaking timing. With no key
// configured the page doesn't exist at all.
export function isEstimateKey(key) {
  const expected = process.env.ESTIMATE_LINK_KEY || "";
  const given = String(key || "");
  if (!expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
