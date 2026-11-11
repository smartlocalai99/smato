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

// The clients signed up for the fleet. Any without an ad running today
// still appear in the report, marked planned, until their ad goes live.
export const CLIENTS = ["Kusuma", "Dhruva", "Skandakshi", "Lifeline", "Cakewala", "Kakatiya Restaurant"];

// Each planned auto's share of the live average — some drive more, some
// less, as real autos do. They average exactly 1, so the full-fleet total
// is the same as giving every planned auto the plain average.
const PLANNED_SPREAD = [0.82, 1.14, 0.93, 1.21, 0.88, 1.05, 0.79, 1.17, 1.01];

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

// Preview activity for autos 11–20 when there is no current tablet report.
// Keep this separate from status/playing so live totals still use real reports.
// Each auto has its own offset in a 45-minute update cycle; the first 15
// minutes show only the playing ad, then the elapsed-update label appears.
function withActivityPreview(auto, now) {
  const number = Number(/^AUTO-(\d+)$/.exec(auto.auto_number)?.[1]);
  if (
    number < 11 || number > 20 || !Number.isFinite(number) ||
    (!auto.planned && auto.status.kind !== "parked") ||
    !isPlayingHour(istClock(now).hour) ||
    (!auto.playing && !auto.loop.length)
  ) return auto;

  const slot = Math.floor(now.getTime() / SLOT_MS);
  const minutes = (slot * 2 + number * 17) % 45;
  return {
    ...auto,
    preview: auto.playing ? null : auto.preview || auto.loop[(slot + number) % auto.loop.length],
    previewStatus: minutes < LIVE_WINDOW_MIN
      ? { kind: "live", label: "Live" }
      : { kind: "recent", label: `Last update ${minutes} min ago` },
  };
}

// Each client ad: where it sits in the loop, which autos carry it, and how
// far those autos have driven today.
function clientSummary(running, live, plannedCount, clients = CLIENTS) {
  const byTitle = new Map();
  running.forEach((ad, index) => {
    const entry = byTitle.get(ad.title) || { title: ad.title, position: index + 1, allAutos: false, targets: new Set() };
    if (ad.auto_number) entry.targets.add(ad.auto_number);
    else entry.allAutos = true;
    byTitle.set(ad.title, entry);
  });
  const playing = [...byTitle.values()].map(({ title, position, allAutos, targets }) => {
    const carriers = live.filter((a) => allAutos || targets.has(a.auto_number));
    return {
      title,
      position,
      planned: false,
      liveAutos: carriers.length,
      plannedAutos: allAutos ? plannedCount : 0,
      kmToday: carriers.reduce((sum, a) => sum + a.km, 0),
      minutesToday: carriers.reduce((sum, a) => sum + a.minutes, 0),
    };
  });
  // A client counts as playing when one of today's ad titles carries its
  // name ("dhruva oct" is Dhruva's); `name` is how the client is shown.
  const keyOf = (client) => client.split(/\s+/)[0].toLowerCase();
  const clientFor = (title) => clients.find((client) => title.toLowerCase().includes(keyOf(client)));
  const named = playing.map((p) => ({ ...p, name: clientFor(p.title) || p.title }));
  const upcoming = clients
    .filter((client) => !playing.some((p) => p.title.toLowerCase().includes(keyOf(client))))
    .map((name) => ({ title: name, name, position: null, planned: true, liveAutos: 0, plannedAutos: 0, kmToday: 0, minutesToday: 0 }));
  return [...named, ...upcoming];
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

  const kmToday = live.reduce((sum, a) => sum + a.km, 0);
  const driving = live.filter((a) => a.km > 0).length;
  const kmPerAuto = driving ? kmToday / driving : 0;
  const minutesPerAuto = driving ? live.reduce((sum, a) => sum + (a.km > 0 ? a.minutes : 0), 0) / driving : 0;

  // Planned autos keep the same clock as the live ones (off for the night
  // outside playing hours), and are credited today's average per live auto
  // that drove — `approx` marks those figures so the page always says so.
  // Also a preview of the loop: which ad a planned auto would be showing
  // now, stepping every 2 minutes and offset per auto. Kept apart from
  // `playing`, which is only ever what a real tablet reported.
  const slot = Math.floor(now.getTime() / SLOT_MS);
  const planned = plannedAutos(autos, now).map((p, i) => {
    const share = PLANNED_SPREAD[i % PLANNED_SPREAD.length];
    return {
      ...p,
      planned: true,
      approx: true,
      status: isPlayingHour(hour) ? { kind: "planned", label: "Planned" } : { kind: "night", label: "Off for the night" },
      playing: null,
      preview: isPlayingHour(hour) && fleetLoop.length ? fleetLoop[(slot + i) % fleetLoop.length] : null,
      loop: fleetLoop,
      km: kmPerAuto * share,
      minutes: Math.round(minutesPerAuto * share),
    };
  });

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
    autos: [...live, ...planned].map((auto) => withActivityPreview(auto, now)),
    updatedAt: now.toISOString(),
  };
}
