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
    <div className="signin">
      <form className="signin__card" onSubmit={handleSubmit}>
        <div>
          <span className="landing__mark">smato · admin</span>
          <h1 className="signin__title">Sign in</h1>
        </div>
        <div className="field">
          <label htmlFor="mobile">Mobile number</label>
          <input
            id="mobile"
            type="tel"
            inputMode="numeric"
            placeholder="98765 43210"
            required
            autoComplete="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="pin">PIN</label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            placeholder="6-digit PIN"
            required
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </div>
        {error && <div className="signin__error">{error}</div>}
        <button className="btn btn--primary" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
