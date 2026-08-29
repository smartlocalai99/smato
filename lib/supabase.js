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

// Public URL for a file stored in the `ads` bucket.
export function adFileUrl(filePath) {
  const { data } = supabase.storage.from(ADS_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}
