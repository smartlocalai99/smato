import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Creates a new admin login (mobile number + PIN). Runs server-side only —
// it's the one place allowed to hold the service role key, which is what
// lets it pre-confirm the account so sign-in works immediately instead of
// getting stuck waiting on a confirmation email that a fake @smato.local
// address could never receive.
export async function POST(request) {
  if (!serviceRoleKey || !url || !anonKey) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY (or the Supabase URL/anon key)." },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Only someone who already has a valid admin session can create another one.
  const callerClient = createClient(url, anonKey);
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(token);
  if (callerError || !callerData?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const digits = String(body.mobile || "").replace(/\D/g, "");
  const pin = String(body.pin || "");

  if (digits.length < 10) {
    return NextResponse.json({ error: "Enter a full mobile number." }, { status: 400 });
  }
  if (pin.length < 6) {
    return NextResponse.json({ error: "PIN needs to be at least 6 digits." }, { status: 400 });
  }

  const adminClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await adminClient.auth.admin.createUser({
    email: `${digits}@smato.local`,
    password: pin,
    email_confirm: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
