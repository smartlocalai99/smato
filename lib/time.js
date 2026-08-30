// Date + time-slot helpers shared by the admin scheduler and the player.
// All checks run against the tablet's own clock, so schedules start and
// stop on their own with no network needed.

export function todayStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// True if `ad` should be playing right now, for the given auto. Ads loop by
// play order all day — the only gates are whether they're active, targeted
// at this auto (or every auto), and inside their optional campaign dates.
export function isAdActiveNow(ad, autoNumber, now = new Date()) {
  if (!ad.active) return false;
  if (ad.auto_number && ad.auto_number !== autoNumber) return false;

  const today = todayStr(now);
  if (ad.start_date && today < ad.start_date) return false;
  if (ad.end_date && today > ad.end_date) return false;

  return true;
}

// Ads assigned to this specific auto, or to every auto (auto_number null),
// sorted for playback.
export function adsForAuto(ads, autoNumber) {
  return ads
    .filter((ad) => !ad.auto_number || ad.auto_number === autoNumber)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

// True if `ad` is actually live somewhere right now — the admin-side view,
// not tied to one auto the way isAdActiveNow is. Same active/date rules,
// just without the per-tablet targeting check.
export function isAdCurrentlyRunning(ad, now = new Date()) {
  if (!ad.active) return false;
  // Array#filter passes (value, index, array); only treat the optional
  // argument as a clock when it is actually a Date instance.
  const today = todayStr(now instanceof Date ? now : new Date());
  if (ad.start_date && today < ad.start_date) return false;
  if (ad.end_date && today > ad.end_date) return false;
  return true;
}

// True once an ad's campaign end date has passed — the tablet purges it
// from local storage at that point instead of holding onto it forever.
// Deliberately doesn't check start_date: an ad that hasn't started yet
// should still be downloaded ahead of time, ready to play the moment it does.
export function hasCampaignEnded(ad, now = new Date()) {
  return Boolean(ad.end_date) && todayStr(now) > ad.end_date;
}
