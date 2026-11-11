import { describe, expect, it } from "vitest";
import { buildEstimate, istClock, liveStatus, plannedAutos, PLANNED_DRIVERS } from "@/lib/estimate";

// 2026-11-11 15:30 in India (10:00 UTC).
const AFTERNOON = new Date("2026-11-11T10:00:00Z");
// 2026-11-11 23:00 in India.
const NIGHT = new Date("2026-11-11T17:30:00Z");
const minsBefore = (date, mins) => new Date(date.getTime() - mins * 60000).toISOString();

function liveFleet(count) {
  return Array.from({ length: count }, (_, i) => ({
    auto_number: `AUTO-${String(i + 1).padStart(2, "0")}`,
    last_lat: 14.47 + i * 0.002,
    last_lng: 78.82,
    last_seen_at: minsBefore(AFTERNOON, 2),
    now_playing_title: "skandakshi",
  }));
}

describe("istClock", () => {
  it("works on India time even though the server runs in UTC", () => {
    expect(istClock(new Date("2026-11-10T19:00:00Z"))).toEqual({
      day: "2026-11-11",
      hour: 0,
      dayStartIso: "2026-11-10T18:30:00.000Z",
    });
  });
});

describe("liveStatus", () => {
  it("never says offline: live, last update, parked or off for the night", () => {
    expect(liveStatus(minsBefore(AFTERNOON, 3), AFTERNOON).label).toBe("Live");
    expect(liveStatus(minsBefore(AFTERNOON, 25), AFTERNOON).label).toBe("Last update 25 min ago");
    expect(liveStatus(minsBefore(AFTERNOON, 130), AFTERNOON).label).toBe("Last update 2 hr ago");
    expect(liveStatus(minsBefore(AFTERNOON, 60 * 30), AFTERNOON).label).toBe("Parked today");
    expect(liveStatus(null, AFTERNOON).label).toBe("Parked today");
    expect(liveStatus(minsBefore(NIGHT, 3), NIGHT).label).toBe("Off for the night");
  });
});

describe("plannedAutos", () => {
  it("fills the fleet up to 20 with the next numbers and the planned drivers' names", () => {
    const planned = plannedAutos(liveFleet(11), AFTERNOON);
    expect(planned.map((p) => p.auto_number)).toEqual([
      "AUTO-12", "AUTO-13", "AUTO-14", "AUTO-15", "AUTO-16", "AUTO-17", "AUTO-18", "AUTO-19", "AUTO-20",
    ]);
    expect(planned.map((p) => p.driver)).toEqual(PLANNED_DRIVERS);
  });

  it("keeps planned autos near the live fleet and moves them every 2 minutes", () => {
    const now = plannedAutos(liveFleet(11), AFTERNOON);
    const later = plannedAutos(liveFleet(11), new Date(AFTERNOON.getTime() + 2 * 60000));
    for (const p of now) {
      expect(Math.abs(p.lat - 14.48)).toBeLessThan(0.05);
      expect(Math.abs(p.lng - 78.82)).toBeLessThan(0.05);
    }
    expect(later[0].lat).not.toBeCloseTo(now[0].lat, 6);
  });

  it("holds planned autos still overnight", () => {
    const a = plannedAutos(liveFleet(11), NIGHT);
    const b = plannedAutos(liveFleet(11), new Date(NIGHT.getTime() + 30 * 60000));
    expect(b).toEqual(a);
  });
});

describe("buildEstimate", () => {
  it("labels planned autos and estimates the full fleet's distance from today's average", () => {
    const estimate = buildEstimate(
      {
        autos: liveFleet(11),
        drivers: [{ name: "Ravi Kumar", auto_number_plate: "AUTO-02" }],
        ads: [
          { title: "skandakshi", auto_number: null, active: true, sort_order: 1 },
          { title: "dhruva", auto_number: "AUTO-03", active: true, sort_order: 0 },
          { title: "kusuma", auto_number: null, active: false, sort_order: 2 },
        ],
        statsByAuto: { "AUTO-01": { km: 30, minutes: 120 }, "AUTO-02": { km: 50, minutes: 200 } },
      },
      AFTERNOON
    );

    expect(estimate.liveCount).toBe(11);
    expect(estimate.plannedCount).toBe(9);
    expect(estimate.autos).toHaveLength(20);
    expect(estimate.autos[1].driver).toBe("Ravi Kumar");
    expect(estimate.autos.slice(11).every((a) => a.planned && a.status.label === "Planned")).toBe(true);
    expect(estimate.kmToday).toBe(80);
    expect(estimate.kmEstimate).toBe(40 * 20);
    expect(estimate.loop.map((ad) => ad.title)).toEqual(["dhruva", "skandakshi"]);
    expect(estimate.autos[11].loop).toEqual(["skandakshi"]);
    expect(estimate.minutesToday).toBe(320);
    expect(estimate.minutesEstimate).toBe(160 * 20);
    expect(estimate.clients.slice(0, 2)).toEqual([
      { title: "dhruva", name: "Dhruva", position: 1, planned: false, liveAutos: 1, plannedAutos: 0, kmToday: 0, minutesToday: 0 },
      { title: "skandakshi", name: "Skandakshi", position: 2, planned: false, liveAutos: 11, plannedAutos: 9, kmToday: 80, minutesToday: 320 },
    ]);
    // Signed-up clients without an ad running today are listed as planned.
    expect(estimate.clients.slice(2).map((c) => [c.title, c.planned])).toEqual([
      ["Kusuma", true],
      ["Lifeline", true],
      ["Cakewala", true],
      ["Kakatiya Restaurant", true],
    ]);
    // Planned autos get today's live average, marked approx.
    const planned = estimate.autos[11];
    expect(planned.approx).toBe(true);
    expect(planned.km).toBeCloseTo(40 * 0.82);
    expect(planned.minutes).toBe(Math.round(160 * 0.82));
    // Planned autos differ from each other but still add up to the average.
    const plannedKm = estimate.autos.slice(11).map((a) => a.km);
    expect(new Set(plannedKm.map((km) => km.toFixed(2))).size).toBe(9);
    expect(plannedKm.reduce((sum, km) => sum + km, 0)).toBeCloseTo(40 * 9);
    // A preview of the loop, never reported as playing.
    expect(planned.playing).toBeNull();
    expect(estimate.loop.map((ad) => ad.title)).toContain(planned.preview);
    expect(estimate.autos[0].approx).toBeUndefined();
  });

  it("puts planned autos on the same clock as live ones, still labelled planned", () => {
    const night = buildEstimate({ autos: liveFleet(11) }, NIGHT);
    const planned = night.autos.filter((a) => a.planned);
    expect(planned).toHaveLength(9);
    expect(planned.every((a) => a.status.label === "Off for the night")).toBe(true);
  });
});
