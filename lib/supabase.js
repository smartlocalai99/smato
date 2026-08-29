import { createClient } from "@supabase/supabase-js";

// Fall back to placeholder values so the build doesn't crash when env vars
// aren't set yet (e.g. a bare `next build` before `.env.local` is filled
// in). At runtime with real env vars this is never used.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const ADS_BUCKET = "ads";

// Supabase Auth only has email + password. Admin sign-in is mobile number +
// PIN, so each admin's Supabase user is created with this synthetic email
// (digits only, e.g. 9876543210@smato.local) and the PIN as the password.
export function mobileToAuthEmail(mobile) {
  const digits = mobile.replace(/\D/g, "");
  return `${digits}@smato.local`;
}

// Public URL for a file stored in the `ads` bucket.
export function adFileUrl(filePath) {
  const { data } = supabase.storage.from(ADS_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

// Tells every connected player to sync right now. Uses Realtime Broadcast
// (plain pub/sub over the same websocket) rather than postgres_changes, so
// it works with zero Supabase dashboard setup — no "Replication" toggle to
// remember to flip. The admin calls this after an ad is added/edited/
// deleted; the player subscribes to the same channel name and re-syncs the
// moment a message arrives.
export const ADS_CHANNEL_NAME = "ads-broadcast";

let adsChannel = null;
function getAdsChannel() {
  if (!adsChannel) {
    adsChannel = supabase.channel(ADS_CHANNEL_NAME);
    adsChannel.subscribe();
  }
  return adsChannel;
}

// Call once on mount so the channel is already joined by the time an admin
// actually submits something — send() would still queue and flush even
// without this, but there's no reason to make the first notify race it.
export function warmAdsChannel() {
  getAdsChannel();
}

export function notifyAdsChanged() {
  getAdsChannel().send({ type: "broadcast", event: "changed", payload: {} });
}
