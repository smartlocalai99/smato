import { describe, expect, test } from "vitest";
import { isAdCurrentlyRunning } from "@/lib/time";

describe("isAdCurrentlyRunning", () => {
  test("can be used directly as an Array.filter callback", () => {
    const ads = [
      { id: "live", active: true },
      { id: "paused", active: false },
    ];

    expect(ads.filter(isAdCurrentlyRunning).map((ad) => ad.id)).toEqual(["live"]);
  });
});
