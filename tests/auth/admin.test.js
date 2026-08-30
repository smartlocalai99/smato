import { describe, expect, it } from "vitest";
import { isAdminUser } from "@/lib/auth/admin";

describe("isAdminUser", () => {
  it("accepts only permanent users with the trusted admin app metadata role", () => {
    expect(isAdminUser({ app_metadata: { role: "admin" }, is_anonymous: false })).toBe(true);
    expect(isAdminUser({ app_metadata: { role: "driver" }, is_anonymous: false })).toBe(false);
    expect(isAdminUser({ app_metadata: {}, is_anonymous: false })).toBe(false);
    expect(isAdminUser({ app_metadata: { role: "admin" }, is_anonymous: true })).toBe(false);
    expect(isAdminUser(null)).toBe(false);
  });
});
