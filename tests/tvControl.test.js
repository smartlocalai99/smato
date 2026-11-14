// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ notifyDeviceCommand: vi.fn() }));

import { commandStage, latestByDevice, pinHash, validPin } from "@/lib/tvAdmin";
import { executeCommand, pollTv } from "@/lib/tvDevice";

const NOW = new Date("2026-11-14T10:00:00Z");
const online = { last_seen_at: "2026-11-14T09:58:00Z" };
const offline = { last_seen_at: "2026-11-14T08:00:00Z" };

// A fake Android wrapper: records calls, answers like the real one.
function fakeNative(results = {}) {
  const calls = [];
  return {
    calls,
    info: () => ({ isTv: true, adsMode: "advertising" }),
    call: (method, ...args) => {
      calls.push([method, ...args]);
      return results[method] || { ok: true, detail: `${method} done` };
    },
  };
}

function recorder() {
  const acks = [];
  return { acks, ack: async (id, status, detail) => acks.push([id, status, detail ?? null]) };
}

describe("executeCommand (the TV's side)", () => {
  it("acknowledges receipt, then reports what the TV actually did, before leaving for Home", async () => {
    const native = fakeNative({ unlockTv: { ok: true, detail: "Unlocked." } });
    const { acks, ack } = recorder();
    await executeCommand({ id: "c1", command: "unlock" }, { native, ack, reload: vi.fn(), forgetPairing: vi.fn() });

    expect(acks).toEqual([
      ["c1", "received", null],
      ["c1", "completed", "Unlocked."],
    ]);
    expect(native.calls.map((c) => c[0])).toEqual(["unlockTv", "goHome"]);
  });

  it("reports a blocked unlock as failed and stays put, rather than claiming success", async () => {
    const native = fakeNative({ unlockTv: { ok: false, detail: "Unlock incomplete: device owner restriction." } });
    const { acks, ack } = recorder();
    await executeCommand({ id: "c2", command: "unlock" }, { native, ack, reload: vi.fn(), forgetPairing: vi.fn() });

    expect(acks.at(-1)).toEqual(["c2", "failed", "Unlock incomplete: device owner restriction."]);
    expect(native.calls.map((c) => c[0])).not.toContain("goHome");
  });

  it("unpair unlocks, forgets the pairing and leaves; restart reloads; unknown commands fail", async () => {
    const forgetPairing = vi.fn();
    const reload = vi.fn();
    const native = fakeNative();
    const { acks, ack } = recorder();

    await executeCommand({ id: "u", command: "unpair" }, { native, ack, reload, forgetPairing });
    await executeCommand({ id: "r", command: "restart" }, { native, ack, reload, forgetPairing });
    await executeCommand({ id: "x", command: "self_destruct" }, { native, ack, reload, forgetPairing });

    expect(forgetPairing).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(acks.filter((a) => a[1] === "completed").map((a) => a[0])).toEqual(["u", "r"]);
    expect(acks.at(-1)).toEqual(["x", "failed", 'This TV doesn\'t know the command "self_destruct".']);
  });
});

describe("pollTv", () => {
  it("keeps the recovery PIN in line, then runs outstanding commands in order", async () => {
    const native = fakeNative();
    const rpc = vi.fn(async (fn) => {
      if (fn === "device_poll") {
        return {
          data: {
            recovery_pin_hash: "abc",
            commands: [
              { id: "1", command: "lock", status: "requested" },
              { id: "2", command: "restart", status: "requested" },
            ],
          },
          error: null,
        };
      }
      return { data: true, error: null };
    });
    const reload = vi.fn();

    const result = await pollTv({
      supabase: { rpc },
      autoNumber: "TV-01",
      token: "secret",
      native,
      reload,
      forgetPairing: vi.fn(),
    });

    expect(result).toEqual({ paired: true, ran: 2 });
    expect(native.calls[0]).toEqual(["setRecoveryPinHash", "abc"]);
    const acked = rpc.mock.calls.filter(([fn]) => fn === "device_ack").map(([, args]) => [args.p_id, args.p_status]);
    expect(acked).toEqual([
      ["1", "received"],
      ["1", "completed"],
      ["2", "received"],
      ["2", "completed"],
    ]);
    expect(reload).toHaveBeenCalled();
  });

  it("says when the server no longer recognises this TV", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const result = await pollTv({ supabase: { rpc }, autoNumber: "TV-01", token: "x", native: fakeNative() });
    expect(result).toEqual({ paired: false });
  });
});

describe("the admin's view of a command", () => {
  it("never reads as done until the TV acknowledges, and flags an offline TV", () => {
    const unlock = (status) => ({ command: "unlock", status });
    expect(commandStage(unlock("requested"), online, NOW).kind).toBe("requested");
    expect(commandStage(unlock("requested"), offline, NOW)).toEqual({
      kind: "offline",
      text: "Unlock TV requested. The TV is offline; it runs when the TV reconnects",
    });
    expect(commandStage(unlock("received"), online, NOW).text).toBe("Unlock TV received by the TV");
    expect(commandStage(unlock("completed"), online, NOW).text).toBe("Unlock TV completed");
    expect(commandStage(unlock("failed"), online, NOW).text).toBe("Unlock TV failed");
  });

  it("picks the newest command per TV", () => {
    const latest = latestByDevice([
      { auto_number: "TV-01", id: "new" },
      { auto_number: "TV-02", id: "only" },
      { auto_number: "TV-01", id: "old" },
    ]);
    expect(latest["TV-01"].id).toBe("new");
    expect(latest["TV-02"].id).toBe("only");
  });
});

describe("recovery PIN", () => {
  it("accepts 4 to 8 digits", () => {
    expect(validPin("1234")).toBe(true);
    expect(validPin("12345678")).toBe(true);
    expect(validPin("123")).toBe(false);
    expect(validPin("12a4")).toBe(false);
  });

  it("hashes exactly the way the TV checks it offline (smato-pin:<pin>, SHA-256)", async () => {
    expect(await pinHash("1234")).toBe("ea1b7f45a2f01b64ef5759ab904507f24bc3c5bf51b8b1897f2e8c45377df488");
  });
});
