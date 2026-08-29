// Date + time-slot helpers shared by the admin scheduler and the player.
// All checks run against the tablet's own clock, so schedules start and
// stop on their own with no network needed.

export function todayStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function currentHour(date = new Date()) {
  return date.getHours();
}

// True if `ad` should be playing right now, for the given auto.
export function isAdActiveNow(ad, autoNumber, now = new Date()) {
  if (!ad.active) return false;
  if (ad.auto_number && ad.auto_number !== autoNumber) return false;

  const today = todayStr(now);
  if (ad.start_date && today < ad.start_date) return false;
  if (ad.end_date && today > ad.end_date) return false;

  const hour = currentHour(now);
  const start = ad.start_hour ?? 0;
  const end = ad.end_hour ?? 23;
  if (start <= end) {
    if (hour < start || hour > end) return false;
  } else {
    // Wraps past midnight, e.g. 22 -> 4.
    if (hour < start && hour > end) return false;
  }
  return true;
}

// Ads assigned to this specific auto, or to every auto (auto_number null),
// sorted for playback.
export function adsForAuto(ads, autoNumber) {
  return ads
    .filter((ad) => !ad.auto_number || ad.auto_number === autoNumber)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

export function formatHour(hour) {
  const h = ((hour % 24) + 24) % 24;
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
}
