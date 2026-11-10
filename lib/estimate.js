// The client-facing fleet page (/live/<key>): the live fleet plus
// the autos still planned, so a client can see roughly what the full fleet
// would look like before committing to it. Everything planned or estimated
// is labelled as such on the page. Pure functions — the data loading lives
// in lib/estimateData.js.
import { QUIET_END_HOUR, QUIET_START_HOUR } from "@/lib/time";

export const FLEET_TARGET = 20;

// Names for the planned autos' drivers, in order.
export const PLANNED_DRIVERS = [
  "Anwar Basha",
  "Shabeer",
  "Riaz",
  "Chiranjeevi",
  "Ravi",
  "Bhaskar",
  "Kumar",
  "Ravi Teja",
  "Ramu",
];

// Used only when no live auto has ever reported a position.
const FALLBACK_CENTER = { lat: 14.4673, lng: 78.8242 };
const LIVE_WINDOW_MIN = 15;
const SLOT_MS = 2 * 60 * 1000;
const IST_OFFSET_MS = 330 * 60 * 1000;

// The server runs in UTC; the fleet runs on India time.
export function istClock(now = new Date()) {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  const day = shifted.toISOString().slice(0, 10);
  const dayStart = new Date(Date.parse(`${day}T00:00:00Z`) - IST_OFFSET_MS);
  return { day, hour: shifted.getUTCHours(), dayStartIso: dayStart.toISOString() };
}

export function isPlayingHour(hour) {
  return hour >= QUIET_END_HOUR && hour < QUIET_START_HOUR;
}

function hourLabel(hour) {
  const h = hour % 12 || 12;
  return `${h} ${hour < 12 ? "AM" : "PM"}`;
}

export const PLAYING_HOURS_LABEL = `${hourLabel(QUIET_END_HOUR)} – ${hourLabel(QUIET_START_HOUR)}`;

// A live auto's status in words. Never a bare "offline": a tablet without
// signal keeps playing its downloaded ads, so what we actually know is when
// it last reported.
export function liveStatus(lastSeenIso, now = new Date()) {
  const { hour, dayStartIso } = istClock(now);
  if (!isPlayingHour(hour)) return { kind: "night", label: "Off for the night" };
  const seen = lastSeenIso ? new Date(lastSeenIso) : null;
  if (!seen || seen < new Date(dayStartIso)) return { kind: "parked", label: "Parked today" };
  const mins = Math.max(0, Math.floor((now - seen) / 60000));
  if (mins < LIVE_WINDOW_MIN) return { kind: "live", label: "Live" };
  return {
    kind: "recent",
    label: mins < 60 ? `Last update ${mins} min ago` : `Last update ${Math.floor(mins / 60)} hr ago`,
  };
}

// Next free AUTO-nn numbers after the live fleet's highest one.
function plannedNumbers(liveNumbers, count) {
  const used = new Set(liveNumbers);
  let next =
    Math.max(0, ...liveNumbers.map((n) => parseInt(/^AUTO-(\d+)$/.exec(n)?.[1] ?? "0", 10))) + 1;
  const numbers = [];
  while (numbers.length < count) {
    const number = `AUTO-${String(next).padStart(2, "0")}`;
    if (!used.has(number)) numbers.push(number);
    next += 1;
  }
  return numbers;
}

// Approximate spots for the planned autos: each circles slowly (about a
// lap every two hours, a step every 2 minutes) around one of the live
// autos' positions, so they sit where the fleet actually works. During
// quiet hours they hold their last evening spot.
export function plannedAutos(liveAutos, now = new Date(), target = FLEET_TARGET) {
  const count = Math.max(0, target - liveAutos.length);
  const anchors = liveAutos
    .filter((a) => a.last_lat != null && a.last_lng != null)
    .map((a) => ({ lat: a.last_lat, lng: a.last_lng }));
  if (!anchors.length) anchors.push(FALLBACK_CENTER);

  const { hour, dayStartIso } = istClock(now);
  const clock = isPlayingHour(hour)
    ? now.getTime()
    : Date.parse(dayStartIso) + (hour < QUIET_END_HOUR ? -3 : QUIET_START_HOUR) * 3600 * 1000;
  const slot = Math.floor(clock / SLOT_MS);

  return plannedNumbers(
    liveAutos.map((a) => a.auto_number),
    count
  ).map((auto_number, i) => {
    const anchor = anchors[i % anchors.length];
    const angle = ((i * 40 + slot * 6) * Math.PI) / 180;
    const radiusKm = 1.4 + (i % 4) * 0.6;
    const lat = anchor.lat + (radiusKm / 111) * Math.sin(angle);
    const lng = anchor.lng + (radiusKm / (111 * Math.cos((anchor.lat * Math.PI) / 180))) * Math.cos(angle);
    return { auto_number, driver: PLANNED_DRIVERS[i % PLANNED_DRIVERS.length], lat, lng };
  });
}

function compact(value) {
  return String(value || "").replace(/\s/g, "").toUpperCase();
}

function adRunsOn(ad, day) {
  if (!ad.active) return false;
  if (ad.start_date && day < ad.start_date) return false;
  if (ad.end_date && day > ad.end_date) return false;
  return true;
}

// Each client ad: where it sits in the loop, which autos carry it, and how
// far those autos have driven today.
function clientSummary(running, live, plannedCount) {
  const byTitle = new Map();
  running.forEach((ad, index) => {
    const entry = byTitle.get(ad.title) || { title: ad.title, position: index + 1, allAutos: false, targets: new Set() };
    if (ad.auto_number) entry.targets.add(ad.auto_number);
    else entry.allAutos = true;
    byTitle.set(ad.title, entry);
  });
  return [...byTitle.values()].map(({ title, position, allAutos, targets }) => {
    const carriers = live.filter((a) => allAutos || targets.has(a.auto_number));
    return {
      title,
      position,
      liveAutos: carriers.length,
      plannedAutos: allAutos ? plannedCount : 0,
      kmToday: carriers.reduce((sum, a) => sum + a.km, 0),
      minutesToday: carriers.reduce((sum, a) => sum + a.minutes, 0),
    };
  });
}

// Everything the page shows, from one cached fleet snapshot plus today's
// per-auto distance and time on the road.
export function buildEstimate({ autos = [], drivers = [], ads = [], statsByAuto = {} }, now = new Date()) {
  const { day, hour } = istClock(now);
  const driverByAuto = Object.fromEntries(drivers.map((d) => [compact(d.auto_number_plate), d.name]));
  const running = ads
    .filter((ad) => adRunsOn(ad, day))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const fleetLoop = running.filter((ad) => !ad.auto_number).map((ad) => ad.title);

  const live = [...autos]
    .sort((a, b) => a.auto_number.localeCompare(b.auto_number))
    .map((a) => {
      const status = liveStatus(a.last_seen_at, now);
      return {
        auto_number: a.auto_number,
        driver: driverByAuto[compact(a.auto_number)] || null,
        planned: false,
        lat: a.last_lat,
        lng: a.last_lng,
        status,
        playing: status.kind === "night" ? null : a.now_playing_title || null,
        loop: running.filter((ad) => !ad.auto_number || ad.auto_number === a.auto_number).map((ad) => ad.title),
        km: statsByAuto[a.auto_number]?.km || 0,
        minutes: statsByAuto[a.auto_number]?.minutes || 0,
      };
    });

  // Planned autos keep the same clock as the live ones (off for the night
  // outside playing hours); `planned` stays set so the page always labels them.
  const planned = plannedAutos(autos, now).map((p) => ({
    ...p,
    planned: true,
    status: isPlayingHour(hour) ? { kind: "planned", label: "Planned" } : { kind: "night", label: "Off for the night" },
    playing: null,
    loop: fleetLoop,
    km: 0,
    minutes: 0,
  }));

  const kmToday = live.reduce((sum, a) => sum + a.km, 0);
  const driving = live.filter((a) => a.km > 0).length;
  const kmPerAuto = driving ? kmToday / driving : 0;
  const minutesPerAuto = driving ? live.reduce((sum, a) => sum + (a.km > 0 ? a.minutes : 0), 0) / driving : 0;

  return {
    day,
    playingNow: isPlayingHour(hour),
    playingHours: PLAYING_HOURS_LABEL,
    target: FLEET_TARGET,
    liveCount: live.length,
    plannedCount: planned.length,
    activeToday: live.filter((a) => a.status.kind === "live" || a.status.kind === "recent").length,
    kmToday,
    minutesToday: live.reduce((sum, a) => sum + a.minutes, 0),
    // Approx: today's average per auto that drove, across the full fleet.
    kmEstimate: kmPerAuto * (live.length + planned.length),
    minutesEstimate: Math.round(minutesPerAuto * (live.length + planned.length)),
    loop: running.map((ad) => ({ title: ad.title, autoNumber: ad.auto_number || null })),
    clients: clientSummary(running, live, planned.length),
    autos: [...live, ...planned],
    updatedAt: now.toISOString(),
  };
}
