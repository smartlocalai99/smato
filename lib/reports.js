// Turns raw GPS fixes (auto_locations rows) into the numbers the Reports
// page shows: distance, online time, first/last seen — per auto, per day,
// and totals. Pure functions, so the maths is testable without a database.

// A fix this inaccurate (metres) is a guess, not a position.
const MAX_ACCURACY_M = 150;
// Faster than an auto can go — a jump like this is a GPS glitch.
const MAX_SPEED_KMH = 90;
// Movements smaller than this are a parked tablet's GPS drifting.
const MIN_MOVE_KM = 0.025;
// Tablets report every ~3 minutes; a longer silence means it was off.
const MAX_ONLINE_GAP_MS = 10 * 60 * 1000;

function pad(n) {
  return String(n).padStart(2, "0");
}

// Local calendar date ("2026-10-21") of a timestamp or Date.
export function localDay(value) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(dayStr, days) {
  const d = new Date(`${dayStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDay(d);
}

export const PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "custom", label: "Custom" },
];

// The inclusive first/last local day a period covers.
export function periodDays(key, { today = localDay(new Date()), from, to } = {}) {
  switch (key) {
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "custom": {
      const start = from || today;
      const end = to || start;
      return start <= end ? { from: start, to: end } : { from: end, to: start };
    }
    default:
      return { from: today, to: today };
  }
}

// [from 00:00, day after `to` 00:00) in the device's timezone, as ISO.
export function dayRangeIso(from, to) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export function listDays(from, to) {
  const days = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

export function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Drops inaccurate fixes and impossible jumps, keeping time order.
export function cleanTrack(points) {
  const track = [];
  for (const point of points) {
    if (point.accuracy != null && point.accuracy > MAX_ACCURACY_M) continue;
    const prev = track[track.length - 1];
    if (prev) {
      const hours = (new Date(point.recorded_at) - new Date(prev.recorded_at)) / 3600000;
      if (hours > 0 && haversineKm(prev, point) / hours > MAX_SPEED_KMH) continue;
    }
    track.push(point);
  }
  return track;
}

// One stretch of fixes (one auto, one day) → its numbers.
export function summarizeTrack(points) {
  const track = cleanTrack(points);
  let distanceKm = 0;
  let onlineMs = 0;
  let anchor = track[0];
  for (let i = 1; i < track.length; i += 1) {
    const gap = new Date(track[i].recorded_at) - new Date(track[i - 1].recorded_at);
    if (gap <= MAX_ONLINE_GAP_MS) onlineMs += gap;
    // Measure from the last point that counted as a real move, so a slow
    // crawl still adds up while parked drift doesn't.
    const moved = haversineKm(anchor, track[i]);
    if (moved >= MIN_MOVE_KM) {
      distanceKm += moved;
      anchor = track[i];
    }
  }
  return {
    points: points.length,
    distanceKm,
    onlineMinutes: Math.round(onlineMs / 60000),
    firstAt: points[0]?.recorded_at ?? null,
    lastAt: points[points.length - 1]?.recorded_at ?? null,
    track,
  };
}

// rows: auto_locations rows (any order, any autos) → per-auto, per-day
// summaries plus fleet totals. Every auto in `autoNumbers` gets an entry,
// even with no data, so idle autos show up in the report too.
export function buildReport(rows, autoNumbers = []) {
  const grouped = new Map();
  for (const number of autoNumbers) grouped.set(number, new Map());
  const sorted = [...rows].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
  for (const row of sorted) {
    if (!grouped.has(row.auto_number)) grouped.set(row.auto_number, new Map());
    const days = grouped.get(row.auto_number);
    const day = localDay(row.recorded_at);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(row);
  }

  const autos = [...grouped].map(([autoNumber, days]) => {
    const dayList = [...days].map(([day, points]) => ({ day, ...summarizeTrack(points) }));
    const distanceKm = dayList.reduce((sum, d) => sum + d.distanceKm, 0);
    const onlineMinutes = dayList.reduce((sum, d) => sum + d.onlineMinutes, 0);
    return {
      autoNumber,
      days: dayList,
      daysActive: dayList.length,
      distanceKm,
      onlineMinutes,
      points: dayList.reduce((sum, d) => sum + d.points, 0),
      firstAt: dayList[0]?.firstAt ?? null,
      lastAt: dayList[dayList.length - 1]?.lastAt ?? null,
    };
  });

  autos.sort(
    (a, b) => b.distanceKm - a.distanceKm || a.autoNumber.localeCompare(b.autoNumber, undefined, { numeric: true })
  );

  const active = autos.filter((a) => a.points > 0);
  return {
    autos,
    totals: {
      distanceKm: autos.reduce((sum, a) => sum + a.distanceKm, 0),
      onlineMinutes: autos.reduce((sum, a) => sum + a.onlineMinutes, 0),
      activeAutos: active.length,
      totalAutos: autos.length,
      points: autos.reduce((sum, a) => sum + a.points, 0),
    },
  };
}

export function formatKm(km) {
  if (!km) return "0 km";
  return `${km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString("en-IN")} km`;
}

export function formatDuration(minutes) {
  if (!minutes) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDay(day, { weekday = true } = {}) {
  return new Date(`${day}T00:00:00`).toLocaleDateString([], {
    ...(weekday ? { weekday: "short" } : {}),
    day: "numeric",
    month: "short",
  });
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// One row per auto per day with data — opens straight into Excel/Sheets.
export function reportCsv(report, driversByAuto = {}) {
  const lines = [["Auto", "Driver", "Driver mobile", "Date", "Distance (km)", "Online (hours)", "First seen", "Last seen", "GPS points"]];
  for (const auto of report.autos) {
    const driver = driversByAuto[auto.autoNumber];
    for (const day of auto.days) {
      lines.push([
        auto.autoNumber,
        driver?.name || "",
        driver?.mobile || "",
        day.day,
        day.distanceKm.toFixed(2),
        (day.onlineMinutes / 60).toFixed(2),
        formatTime(day.firstAt),
        formatTime(day.lastAt),
        day.points,
      ]);
    }
  }
  return lines.map((line) => line.map(csvCell).join(",")).join("\n");
}

// Supabase caps how many rows one request returns (1000 by default, and a
// project can set it lower), so page through the range until a page comes
// back empty — never assume a short page was the last one.
export async function fetchLocations(client, { autoNumber, startIso, endIso }, { pageSize = 1000, maxRows = 60000 } = {}) {
  const rows = [];
  while (rows.length < maxRows) {
    let query = client
      .from("auto_locations")
      .select("auto_number,lat,lng,accuracy,recorded_at")
      .gte("recorded_at", startIso)
      .lt("recorded_at", endIso);
    if (autoNumber) query = query.eq("auto_number", autoNumber);
    const { data, error } = await query
      .order("recorded_at")
      .range(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
  }
  return rows;
}
