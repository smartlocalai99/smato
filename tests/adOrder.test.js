// @vitest-environment node
import { describe, expect, it } from "vitest";
import { moveAd } from "@/lib/adOrder";

const ads = [
  { id: "a", sort_order: 1 },
  { id: "b", sort_order: 2 },
  { id: "c", sort_order: 5 },
];

describe("moveAd (↑ ↓ on the Running now list)", () => {
  it("swaps an ad with its neighbour, touching only those two", () => {
    expect(moveAd(ads, 2, -1)).toEqual([
      { id: "c", sort_order: 2 },
      { id: "b", sort_order: 5 },
    ]);
    expect(moveAd(ads, 0, 1)).toEqual([
      { id: "a", sort_order: 2 },
      { id: "b", sort_order: 1 },
    ]);
  });

  it("does nothing past either end", () => {
    expect(moveAd(ads, 0, -1)).toEqual([]);
    expect(moveAd(ads, 2, 1)).toEqual([]);
    expect(moveAd([], 0, 1)).toEqual([]);
  });

  it("renumbers when old ads share a number, so the move really happens", () => {
    const tied = [
      { id: "a", sort_order: 0 },
      { id: "b", sort_order: 0 },
      { id: "c", sort_order: 0 },
    ];
    expect(moveAd(tied, 2, -1)).toEqual([
      { id: "c", sort_order: 1 },
      { id: "b", sort_order: 2 },
    ]);
  });

  it("treats a missing number as needing a renumber too", () => {
    const rows = moveAd([{ id: "a", sort_order: null }, { id: "b", sort_order: 3 }], 1, -1);
    expect(rows).toEqual([
      { id: "b", sort_order: 0 },
      { id: "a", sort_order: 1 },
    ]);
  });
});
