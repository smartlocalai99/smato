// The admin's side of TV control (app/admin/tvs): what to show for each TV
// and each command, and sending commands. The TV's side is lib/tvDevice.js;
// the command queue and its rules live in docs/sql/tv-control.sql.
import { notifyDeviceCommand } from "@/lib/supabase";

export const COMMAND_LABELS = {
  lock: "Start ads",
  unlock: "Unlock TV",
  restart: "Restart ads",
  unpair: "Unpair",
};

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

// TVs check in every 3 minutes, so 5 minutes allows one missed beat.
export function isOnline(device, now = new Date()) {
  if (!device?.last_seen_at) return false;
  return now - new Date(device.last_seen_at) < ONLINE_WINDOW_MS;
}

export function isPending(command) {
  return command?.status === "requested" || command?.status === "received";
}

// Where a command is, in words — never "done" until the TV says so.
export function commandStage(command, device, now = new Date()) {
  if (!command) return null;
  const label = COMMAND_LABELS[command.command] || command.command;
  switch (command.status) {
    case "requested":
      return isOnline(device, now)
        ? { kind: "requested", text: `${label} requested, waiting for the TV` }
        : { kind: "offline", text: `${label} requested. The TV is offline; it runs when the TV reconnects` };
    case "received":
      return { kind: "received", text: `${label} received by the TV` };
    case "completed":
      return { kind: "completed", text: `${label} completed` };
    case "failed":
      return { kind: "failed", text: `${label} failed` };
    case "cancelled":
      return { kind: "cancelled", text: `${label} cancelled` };
    default:
      return { kind: command.status, text: `${label}: ${command.status}` };
  }
}

// The newest command per TV, from a newest-first list.
export function latestByDevice(commands = []) {
  const latest = {};
  for (const command of commands) {
    if (!latest[command.auto_number]) latest[command.auto_number] = command;
  }
  return latest;
}

export function validPin(pin) {
  return /^\d{4,8}$/.test(String(pin || ""));
}

// Same recipe the TV checks against offline (DeviceState.hashPin).
export async function pinHash(pin) {
  const bytes = new TextEncoder().encode(`smato-pin:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Queues a command, then nudges the TV over realtime so an online TV acts
// within seconds; an offline one picks it up when it reconnects.
export async function sendCommand(supabase, autoNumber, command, payload = {}) {
  const { data, error } = await supabase
    .from("device_commands")
    .insert({ auto_number: autoNumber, command, payload })
    .select()
    .single();
  if (error) throw error;
  notifyDeviceCommand(autoNumber);
  return data;
}

export async function cancelCommand(supabase, command) {
  const { error } = await supabase
    .from("device_commands")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", command.id)
    .in("status", ["requested", "received"]);
  if (error) throw error;
}

export async function saveRecoveryPin(supabase, autoNumber, pin) {
  const { error } = await supabase
    .from("device_secrets")
    .upsert({ auto_number: autoNumber, recovery_pin_hash: await pinHash(pin) }, { onConflict: "auto_number" });
  if (error) throw error;
  notifyDeviceCommand(autoNumber);
}

// A database without the TV tables yet answers with an error naming them.
export function needsTvSetup(error) {
  return /device_type|device_commands|device_secrets|does not exist|schema cache/i.test(error?.message || "");
}
