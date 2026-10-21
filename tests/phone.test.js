import { describe, expect, it } from "vitest";
import { phoneDigits, telHref, whatsappHref } from "@/lib/phone";

describe("phone links", () => {
  it.each([
    ["9876543210", "919876543210"],
    ["98765 43210", "919876543210"],
    ["+91-98765-43210", "919876543210"],
    ["098765 43210", "919876543210"],
  ])("normalises %s", (raw, expected) => {
    expect(phoneDigits(raw)).toBe(expected);
  });

  it("builds call and WhatsApp links", () => {
    expect(telHref("98665 31011")).toBe("tel:+919866531011");
    expect(whatsappHref("98665 31011")).toBe("https://wa.me/919866531011");
  });

  it.each([null, "", "12345", "AUTO-01"])("gives no link for %s", (raw) => {
    expect(telHref(raw)).toBeNull();
    expect(whatsappHref(raw)).toBeNull();
  });
});
