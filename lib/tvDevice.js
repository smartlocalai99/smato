// The player's side of TV control: the admin's TVs page queues commands in
// device_commands, this fetches them through the device_poll function,
// hands each one to the Android wrapper (window.AndroidNative) and reports
// back through device_ack — received first, then completed or failed with
// what the TV actually said. Only active inside the Android app on a TV;
// tablets and plain browsers never get here.

const ACK_ATTEMPTS = 3;
const ACK_RETRY_MS = 2000;

// What the Android wrapper reports about itself, or null when this isn't
// running inside a TV-capable build of the app.
export function nativeInfo() {
  try {
    const raw = window.AndroidNative?.getDeviceInfo?.();
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Calls one of the wrapper's TV controls. Every one answers { ok, detail };
// an older app build without it says so instead of pretending.
export function nativeCall(method, ...args) {
  try {
    const fn = window.AndroidNative?.[method];
    if (typeof fn !== "function") {
      return { ok: false, detail: "This TV's SMATO app is too old for that — install the latest APK." };
    }
    const raw = fn.apply(window.AndroidNative, args);
    return raw ? JSON.parse(raw) : { ok: true, detail: "" };
  } catch (err) {
    return { ok: false, detail: err?.message || "The TV app reported an error." };
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Claims this auto number for this TV (first time) or confirms it's still
// ours. False means another TV holds it until an admin unpairs it.
export async function pairTv(supabase, autoNumber, token) {
  const { data, error } = await supabase.rpc("device_pair", { p_auto: autoNumber, p_token: token });
  if (error) throw error;
  return data === true;
}

function makeAck(supabase, autoNumber, token) {
  return async (id, status, detail = null) => {
    for (let attempt = 0; attempt < ACK_ATTEMPTS; attempt += 1) {
      if (attempt) await wait(ACK_RETRY_MS);
      const { data, error } = await supabase.rpc("device_ack", {
        p_auto: autoNumber,
        p_token: token,
        p_id: id,
        p_status: status,
        p_detail: detail,
      });
      if (!error) return data === true;
    }
    return false;
  };
}

// Runs one command end to end. `native` is { call(method, ...args) } and
// `ack(id, status, detail)` reports to the server; both injectable for tests.
export async function executeCommand(command, { native, ack, reload, forgetPairing }) {
  const { id } = command;
  await ack(id, "received");

  switch (command.command) {
    case "lock": {
      const result = native.call("lockTv");
      await ack(id, result.ok ? "completed" : "failed", result.detail);
      return;
    }
    case "unlock": {
      const result = native.call("unlockTv");
      // Report before leaving: once SMATO hands over to the TV's launcher
      // it stops running and can't report anything.
      await ack(id, result.ok ? "completed" : "failed", result.detail);
      if (result.ok) native.call("goHome");
      return;
    }
    case "restart": {
      await ack(id, "completed", "Player restarted.");
      reload();
      return;
    }
    case "unpair": {
      const result = native.call("unlockTv");
      forgetPairing();
      const detail = `Unpaired. ${result.detail || ""}`.trim();
      await ack(id, result.ok ? "completed" : "failed", detail);
      native.call("goHome");
      return;
    }
    default:
      await ack(id, "failed", `This TV doesn't know the command "${command.command}".`);
  }
}

// One round: fetch what the TV should be doing, keep its recovery PIN in
// line, then run any outstanding commands in the order they were sent.
// Resolves { paired: false } if the server no longer recognises this TV.
export async function pollTv({ supabase, autoNumber, token, native, reload, forgetPairing }) {
  const { data, error } = await supabase.rpc("device_poll", { p_auto: autoNumber, p_token: token });
  if (error) throw error;
  if (!data) return { paired: false };

  native.call("setRecoveryPinHash", data.recovery_pin_hash || "");

  const ack = makeAck(supabase, autoNumber, token);
  for (const command of data.commands || []) {
    await executeCommand(command, { native, ack, reload, forgetPairing });
  }
  return { paired: true, ran: (data.commands || []).length };
}
