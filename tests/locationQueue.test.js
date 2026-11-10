import { afterEach, describe, expect, it, vi } from "vitest";
import { flushFixes, pendingFixCount, queueFix } from "@/lib/locationQueue";

const fix = (n) => ({ auto_number: "AUTO-01", lat: 14 + n / 1000, lng: 78, accuracy: 10, recorded_at: `t${n}` });

afterEach(() => {
  localStorage.clear();
});

describe("location queue", () => {
  it("keeps fixes taken without signal and uploads them, in order, once it's back", async () => {
    queueFix(fix(1));
    queueFix(fix(2));
    const offline = vi.fn().mockResolvedValue({ error: new Error("network") });
    await flushFixes(offline);
    expect(pendingFixCount()).toBe(2);

    const insert = vi.fn().mockResolvedValue({ error: null });
    await flushFixes(insert);
    expect(insert).toHaveBeenCalledWith([fix(1), fix(2)]);
    expect(pendingFixCount()).toBe(0);
  });

  it("uploads a long gap in batches and survives a thrown network error", async () => {
    for (let i = 0; i < 250; i += 1) queueFix(fix(i));
    const insert = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await flushFixes(insert);
    expect(insert.mock.calls[0][0]).toHaveLength(100);
    expect(pendingFixCount()).toBe(150);

    const rest = vi.fn().mockResolvedValue({ error: null });
    await flushFixes(rest);
    expect(rest).toHaveBeenCalledTimes(2);
    expect(rest.mock.calls[0][0][0]).toEqual(fix(100));
    expect(pendingFixCount()).toBe(0);
  });

  it("caps what it keeps, dropping the oldest", () => {
    for (let i = 0; i < 650; i += 1) queueFix(fix(i));
    expect(pendingFixCount()).toBe(600);
  });
});
