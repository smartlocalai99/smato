"use client";

import { useState } from "react";
import { mobileToAuthEmail, supabase } from "@/lib/supabase";

export default function SignIn() {
  const [mobile, setMobile] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: mobileToAuthEmail(mobile),
      password: pin,
    });
    setLoading(false);
    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Mobile number or PIN is wrong."
          : error.message
      );
    }
  }

  return (
    <div className="signin min-h-screen-safe flex items-center justify-center bg-ink p-6">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-line bg-panel p-8"
      >
        <div>
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-amber">
            smato · admin
          </span>
          <h1 className="mt-1 font-display text-2xl font-semibold">Sign in</h1>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mobile" className="font-mono text-xs tracking-wide text-text-dim">
            Mobile number
          </label>
          <input
            id="mobile"
            type="tel"
            inputMode="numeric"
            placeholder="98765 43210"
            required
            autoComplete="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            className="rounded-md border border-line bg-ink px-3 py-2.5 text-text focus:border-teal focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pin" className="font-mono text-xs tracking-wide text-text-dim">
            PIN
          </label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            placeholder="6-digit PIN"
            required
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="rounded-md border border-line bg-ink px-3 py-2.5 text-text focus:border-teal focus:outline-none"
          />
        </div>
        {error && <div className="text-sm text-red">{error}</div>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-amber px-4 py-2.5 font-semibold text-on-amber transition-colors hover:bg-[#ffc250] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
