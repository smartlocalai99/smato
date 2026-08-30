import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("setup.sql", "utf8");

function policyStatements(keyword) {
  return [...sql.matchAll(new RegExp(`${keyword}\\s+policy[\\s\\S]*?;`, "gi"))]
    .map(([statement]) => statement.replace(/\s+/g, " ").trim());
}

function policyTarget(statement) {
  const match = statement.match(/policy(?: if exists)? "([^"]+)" on ([a-z_.]+)/i);
  return match && `${match[1]}@${match[2]}`;
}

describe("setup.sql policy statements", () => {
  it("uses valid PostgreSQL DROP POLICY grammar for every policy", () => {
    const drops = policyStatements("drop");

    expect(drops.length).toBeGreaterThan(0);
    for (const statement of drops) {
      expect(statement).toMatch(/^drop policy if exists "[^"]+" on [a-z_.]+;$/i);
    }
  });

  it("pairs every policy creation with an idempotent drop for the same table", () => {
    const drops = new Set(policyStatements("drop").map(policyTarget));
    const creates = policyStatements("create").map(policyTarget);

    expect(creates.length).toBeGreaterThan(0);
    expect(new Set(creates).size).toBe(creates.length);
    for (const target of creates) expect(drops).toContain(target);
  });

  it("requires the trusted admin role and a permanent user for every admin policy", () => {
    const adminPolicies = policyStatements("create")
      .filter((statement) => /policy "[^"]*_admin"/i.test(statement));

    expect(adminPolicies.length).toBeGreaterThan(0);
    for (const statement of adminPolicies) {
      expect(statement).toMatch(/\bto authenticated\b/i);
      expect(statement).toMatch(/auth\.jwt\(\)\s*->\s*'app_metadata'\s*->>\s*'role'\)\s*=\s*'admin'/i);
      expect(statement).toMatch(/auth\.jwt\(\)\s*->>\s*'is_anonymous'\)\s+is distinct from\s+'true'/i);
    }
  });
});
