import { describe, expect, it, vi } from "vitest";
import {
  buildReport,
  cleanTrack,
  dayRangeIso,
  fetchLocations,
  formatDuration,
  formatKm,
  listDays,
  periodDays,
  reportCsv,
  summarizeTrack,
} from "@/lib/reports";

// ~1.11 km per 0.01° of latitude.
function fix(auto, minutes, lat, { lng = 78.8, accuracy = 10, day = "2026-10-20" } = {}) {
  const at = new Date(`${day}T08:00:00`);
  at.setMinutes(at.getMinutes() + minutes);
  return { auto_number: auto, lat, lng, accuracy, recorded_at: at.toISOString() };
}

describe("periods", () => {
  const today = "2026-10-21";

  it.each([
    ["today", { from: "2026-10-21", to: "2026-10-21" }],
    ["yesterday", { from: "2026-10-20", to: "2026-10-20" }],
    ["7d", { from: "2026-10-15", to: "2026-10-21" }],
    ["30d", { from: "2026-09-22", to: "2026-10-21" }],
  ])("%s covers the right days", (key, expected) => {
    expect(periodDays(key, { today })).toEqual(expected);
  });

  it("orders a custom range that was entered backwards", () => {
    expect(periodDays("custom", { today, from: "2026-10-10", to: "2026-10-01" })).toEqual({ from: "2026-10-01", to: "2026-10-10" });
  });

  it("lists every day and spans whole local days", () => {
    expect(listDays("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    const { startIso, endIso } = dayRangeIso("2026-10-20", "2026-10-20");
    expect(new Date(endIso) - new Date(startIso)).toBe(24 * 60 * 60 * 1000);
  });
});

describe("track maths", () => {
  it("adds up real movement and online time", () => {
    const summary = summarizeTrack([fix("A", 0, 14.40), fix("A", 3, 14.41), fix("A", 6, 14.42)]);

    expect(summary.distanceKm).toBeCloseTo(2.22, 1);
    expect(summary.onlineMinutes).toBe(6);
    expect(summary.points).toBe(3);
  });

  it("ignores parked GPS drift", () => {
    const drift = [0, 3, 6, 9, 12].map((m, i) => fix("A", m, 14.4 + (i % 2) * 0.0001));
    expect(summarizeTrack(drift).distanceKm).toBe(0);
  });

  it("drops inaccurate fixes and impossible jumps", () => {
    const track = cleanTrack([
      fix("A", 0, 14.40),
      fix("A", 3, 14.90), // 55 km in 3 minutes
      fix("A", 6, 14.41, { accuracy: 900 }),
      fix("A", 9, 14.41),
    ]);
    expect(track.map((p) => p.lat)).toEqual([14.40, 14.41]);
  });

  it("does not count a long silence as online time", () => {
    expect(summarizeTrack([fix("A", 0, 14.4), fix("A", 3, 14.4), fix("A", 120, 14.4)]).onlineMinutes).toBe(3);
  });
});

describe("buildReport", () => {
  const rows = [
    fix("AUTO-2", 0, 14.40), fix("AUTO-2", 3, 14.41),
    fix("AUTO-1", 0, 14.40), fix("AUTO-1", 3, 14.43),
    fix("AUTO-1", 0, 14.50, { day: "2026-10-21" }), fix("AUTO-1", 3, 14.51, { day: "2026-10-21" }),
  ];

  it("groups by auto and day, sorts by distance, and keeps idle autos", () => {
    const report = buildReport(rows, ["AUTO-1", "AUTO-2", "AUTO-3"]);

    expect(report.autos.map((a) => a.autoNumber)).toEqual(["AUTO-1", "AUTO-2", "AUTO-3"]);
    expect(report.autos[0].days.map((d) => d.day)).toEqual(["2026-10-20", "2026-10-21"]);
    // The overnight jump between days is not counted as travel.
    expect(report.autos[0].distanceKm).toBeCloseTo(4.45, 1);
    expect(report.autos[2]).toMatchObject({ points: 0, daysActive: 0, distanceKm: 0 });
    expect(report.totals).toMatchObject({ activeAutos: 2, totalAutos: 3, points: 6 });
  });

  it("exports one CSV row per auto per day with the driver", () => {
    const csv = reportCsv(buildReport(rows), { "AUTO-1": { name: "Ravi, Jr", mobile: "9876543210" } });
    const lines = csv.split("\n");

    expect(lines[0]).toBe("Auto,Driver,Driver mobile,Date,Distance (km),Online (hours),First seen,Last seen,GPS points");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(/^AUTO-1,"Ravi, Jr",9876543210,2026-10-20,3\.\d\d,0\.05,/);
  });
});

describe("formatting", () => {
  it("formats distance and duration for people", () => {
    expect(formatKm(0)).toBe("0 km");
    expect(formatKm(3.456)).toBe("3.5 km");
    expect(formatKm(1234.4)).toBe("1,234 km");
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(135)).toBe("2h 15m");
  });
});

describe("fetchLocations", () => {
  it("pages through results and filters by auto when one is chosen", async () => {
    const calls = [];
    // A short page (the server's own cap) is not taken as the end.
    const pages = [[1, 2], [3], [4, 5], []];
    const client = {
      from: () => {
        const q = {
          select: () => q,
          gte: () => q,
          lt: () => q,
          eq: (col, value) => (calls.push(["eq", col, value]), q),
          order: () => q,
          range: (from, to) => (calls.push(["range", from, to]), Promise.resolve({ data: pages.shift(), error: null })),
        };
        return q;
      },
    };

    const rows = await fetchLocations(client, { autoNumber: "AUTO-1", startIso: "a", endIso: "b" }, { pageSize: 2 });

    expect(rows).toEqual([1, 2, 3, 4, 5]);
    expect(calls.filter(([op]) => op === "range")).toEqual([["range", 0, 1], ["range", 2, 3], ["range", 3, 4], ["range", 5, 6]]);
    expect(calls.filter(([op]) => op === "eq")).toHaveLength(4);
  });

  it("surfaces a database error", async () => {
    const q = { select: () => q, gte: () => q, lt: () => q, order: () => q, range: vi.fn().mockResolvedValue({ data: null, error: new Error("nope") }) };
    await expect(fetchLocations({ from: () => q }, { startIso: "a", endIso: "b" })).rejects.toThrow("nope");
  });
});
