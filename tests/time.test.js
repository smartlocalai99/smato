import { describe, expect, test } from "vitest";
import { isAdCurrentlyRunning, isQuietHours } from "@/lib/time";

describe("isQuietHours", () => {
  const at = (hour, minute = 0) => new Date(2026, 9, 23, hour, minute);

  test("is quiet from 9 PM through the night until 9 AM", () => {
    expect(isQuietHours(at(21, 0))).toBe(true);
    expect(isQuietHours(at(23, 59))).toBe(true);
    expect(isQuietHours(at(0, 0))).toBe(true);
    expect(isQuietHours(at(8, 59))).toBe(true);
  });

  test("plays normally from 9 AM until 9 PM", () => {
    expect(isQuietHours(at(9, 0))).toBe(false);
    expect(isQuietHours(at(14, 30))).toBe(false);
    expect(isQuietHours(at(20, 59))).toBe(false);
  });
});

describe("isAdCurrentlyRunning", () => {
  test("can be used directly as an Array.filter callback", () => {
    const ads = [
      { id: "live", active: true },
      { id: "paused", active: false },
    ];

    expect(ads.filter(isAdCurrentlyRunning).map((ad) => ad.id)).toEqual(["live"]);
  });
});
