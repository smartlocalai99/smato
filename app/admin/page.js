"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, adFileUrl, ADS_BUCKET, mobileToAuthEmail } from "@/lib/supabase";
import { formatHour } from "@/lib/time";
import SlotStrip from "@/components/SlotStrip";
import FleetStrip from "@/components/FleetStrip";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  const [session, setSession] = useState(undefined); // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (!session) return <SignIn />;
  return <Console session={session} />;
}

function SignIn() {
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

function Console({ session }) {
  const [autos, setAutos] = useState([]);
  const [ads, setAds] = useState([]);
  const [loadError, setLoadError] = useState("");

  const loadAutos = useCallback(async () => {
    const { data, error } = await supabase
      .from("autos")
      .select("*")
      .order("auto_number");
    if (!error) setAutos(data || []);
  }, []);

  const loadAds = useCallback(async () => {
    const { data, error } = await supabase
      .from("ads")
      .select("*")
      .order("sort_order");
    if (error) setLoadError(error.message);
    else setAds(data || []);
  }, []);

  useEffect(() => {
    loadAutos();
    loadAds();

    const channel = supabase
      .channel("admin-autos")
      .on("postgres_changes", { event: "*", schema: "public", table: "autos" }, loadAutos)
      .subscribe();

    // Fallback poll in case realtime isn't enabled on the project — keeps
    // the fleet view live either way.
    const poll = setInterval(loadAutos, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [loadAutos, loadAds]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="console">
      <div className="console__bar">
        <div className="console__brand">
          <span className="console__brand-dot" />
          <span className="console__brand-title">smato / admin</span>
        </div>
        <button className="btn btn--ghost" onClick={signOut}>
          Sign out
        </button>
      </div>

      <div className="console__body">
        <section>
          <div className="section-head">
            <h2>Fleet</h2>
            <span className="section-head__hint">{autos.length} auto(s) checked in</span>
          </div>
          <FleetStrip autos={autos} />
        </section>

        <section>
          <div className="section-head">
            <h2>Add an ad</h2>
          </div>
          <UploadForm autos={autos} onUploaded={loadAds} />
        </section>

        <section>
          <div className="section-head">
            <h2>Scheduled ads</h2>
            <span className="section-head__hint">{ads.length} total</span>
          </div>
          {loadError && <div className="signin__error">{loadError}</div>}
          <AdsList ads={ads} onChange={loadAds} />
        </section>

        <section>
          <div className="section-head">
            <h2>Team access</h2>
            <span className="section-head__hint">who can sign in to this console</span>
          </div>
          <TeamAccess session={session} />
        </section>
      </div>
    </div>
  );
}

function TeamAccess({ session }) {
  const [mobile, setMobile] = useState("");
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState(null); // { type: 'error'|'ok'|'busy', text }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus({ type: "busy", text: "Adding…" });
    try {
      const res = await fetch("/api/admin/create-admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ mobile, pin }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't add that login.");
      setStatus({ type: "ok", text: `${mobile} can now sign in.` });
      setMobile("");
      setPin("");
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    }
  }

  return (
    <form className="upload-card" onSubmit={handleSubmit}>
      <div className="upload-grid">
        <div className="field">
          <label htmlFor="teamMobile">Mobile number</label>
          <input
            id="teamMobile"
            type="tel"
            inputMode="numeric"
            placeholder="98765 43210"
            required
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="teamPin">PIN</label>
          <input
            id="teamPin"
            type="text"
            inputMode="numeric"
            placeholder="6-digit PIN"
            required
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </div>
      </div>
      <div className="upload-actions">
        <button className="btn btn--primary" type="submit" disabled={status?.type === "busy"}>
          {status?.type === "busy" ? "Adding…" : "Add login"}
        </button>
        {status && (
          <span
            className={`upload-status ${status.type === "error" ? "is-error" : ""} ${
              status.type === "ok" ? "is-ok" : ""
            }`}
          >
            {status.text}
          </span>
        )}
      </div>
    </form>
  );
}

function UploadForm({ autos, onUploaded }) {
  const [title, setTitle] = useState("");
  const [autoChoice, setAutoChoice] = useState("ALL");
  const [newAutoNumber, setNewAutoNumber] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startHour, setStartHour] = useState(0);
  const [endHour, setEndHour] = useState(23);
  const [sortOrder, setSortOrder] = useState(0);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(null); // { type: 'error'|'ok'|'busy', text }

  const hourOptions = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  function resetForm() {
    setTitle("");
    setAutoChoice("ALL");
    setNewAutoNumber("");
    setStartDate("");
    setEndDate("");
    setStartHour(0);
    setEndHour(23);
    setSortOrder(0);
    setFile(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus(null);

    if (!file) {
      setStatus({ type: "error", text: "Choose a video or image file first." });
      return;
    }

    let autoNumber = null;
    if (autoChoice === "NEW") {
      autoNumber = newAutoNumber.trim().toUpperCase();
      if (!autoNumber) {
        setStatus({ type: "error", text: "Enter the new auto's number." });
        return;
      }
    } else if (autoChoice !== "ALL") {
      autoNumber = autoChoice;
    }

    setStatus({ type: "busy", text: "Uploading…" });

    try {
      if (autoNumber) {
        // Make sure the auto exists so the foreign key + admin dropdown pick it up.
        await supabase.from("autos").upsert({ auto_number: autoNumber }, { onConflict: "auto_number" });
      }

      const mediaType = file.type.startsWith("image/") ? "image" : "video";
      const ext = file.name.split(".").pop();
      const path = `${autoNumber || "all"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const { error: uploadError } = await supabase.storage.from(ADS_BUCKET).upload(path, file, {
        cacheControl: "31536000",
        contentType: file.type || "video/mp4",
      });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("ads").insert({
        title: title.trim() || file.name,
        file_path: path,
        file_size: file.size,
        media_type: mediaType,
        auto_number: autoNumber,
        start_date: startDate || null,
        end_date: endDate || null,
        start_hour: Number(startHour),
        end_hour: Number(endHour),
        sort_order: Number(sortOrder) || 0,
      });
      if (insertError) throw insertError;

      setStatus({ type: "ok", text: "Uploaded. It'll reach the tablet on its next sync." });
      resetForm();
      onUploaded();
    } catch (err) {
      setStatus({ type: "error", text: err.message || "Upload failed." });
    }
  }

  return (
    <form className="upload-card" onSubmit={handleSubmit}>
      <div className="upload-grid">
        <div className="field">
          <label htmlFor="title">Title</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Diwali offer" />
        </div>

        <div className="field">
          <label htmlFor="auto">Plays on</label>
          <select id="auto" value={autoChoice} onChange={(e) => setAutoChoice(e.target.value)}>
            <option value="ALL">All autos</option>
            {autos.map((a) => (
              <option key={a.auto_number} value={a.auto_number}>
                {a.auto_number}
              </option>
            ))}
            <option value="NEW">+ New auto…</option>
          </select>
        </div>

        {autoChoice === "NEW" && (
          <div className="field">
            <label htmlFor="newAuto">New auto number</label>
            <input
              id="newAuto"
              value={newAutoNumber}
              onChange={(e) => setNewAutoNumber(e.target.value)}
              placeholder="AUTO-02"
            />
          </div>
        )}

        <div className="field">
          <label htmlFor="sortOrder">Play order</label>
          <input
            id="sortOrder"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="startDate">Start date (optional)</label>
          <input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="endDate">End date (optional)</label>
          <input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="startHour">From</label>
          <select id="startHour" value={startHour} onChange={(e) => setStartHour(e.target.value)}>
            {hourOptions.map((h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="endHour">Until</label>
          <select id="endHour" value={endHour} onChange={(e) => setEndHour(e.target.value)}>
            {hourOptions.map((h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="upload-preview">
        <SlotStrip startHour={Number(startHour)} endHour={Number(endHour)} />
      </div>

      <div className="upload-grid upload-grid--wide">
        <div className="field">
          <label htmlFor="file">Video or image file</label>
          <input
            id="file"
            type="file"
            accept="video/*,image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          {file && (
            <span className="upload-status">
              {file.type.startsWith("image/") ? "Image" : "Video"} — shown for{" "}
              {file.type.startsWith("image/") ? "8 seconds" : "its full length"} each time it plays.
            </span>
          )}
        </div>
      </div>

      <div className="upload-actions">
        <button className="btn btn--primary" type="submit" disabled={status?.type === "busy"}>
          {status?.type === "busy" ? "Uploading…" : "Upload & schedule"}
        </button>
        {status && (
          <span
            className={`upload-status ${status.type === "error" ? "is-error" : ""} ${
              status.type === "ok" ? "is-ok" : ""
            }`}
          >
            {status.text}
          </span>
        )}
      </div>
    </form>
  );
}

function AdsList({ ads, onChange }) {
  const [busyId, setBusyId] = useState(null);

  async function toggleActive(ad) {
    setBusyId(ad.id);
    await supabase.from("ads").update({ active: !ad.active }).eq("id", ad.id);
    setBusyId(null);
    onChange();
  }

  async function removeAd(ad) {
    if (!confirm(`Delete "${ad.title}"? This can't be undone.`)) return;
    setBusyId(ad.id);
    await supabase.storage.from(ADS_BUCKET).remove([ad.file_path]);
    await supabase.from("ads").delete().eq("id", ad.id);
    setBusyId(null);
    onChange();
  }

  if (!ads.length) {
    return <div className="empty-state">No ads yet. Upload one above.</div>;
  }

  return (
    <div className="ads-list">
      {ads.map((ad) => (
        <div key={ad.id} className={`ad-row ${ad.active ? "" : "is-inactive"}`}>
          <div>
            <div className="ad-row__title">
              <a href={adFileUrl(ad.file_path)} target="_blank" rel="noreferrer">
                {ad.title}
              </a>
            </div>
            <div className="ad-row__meta">
              <span className="tag">{ad.auto_number || "all autos"}</span>
              <span className="tag">{ad.media_type === "image" ? "image" : "video"}</span>
              <span>
                {formatHour(ad.start_hour)}–{formatHour(ad.end_hour)}
              </span>
              <span>
                {ad.start_date || "no start"} → {ad.end_date || "no end"}
              </span>
              <span>order {ad.sort_order}</span>
              <span>{ad.active ? "active" : "paused"}</span>
            </div>
          </div>
          <div className="ad-row__actions">
            <button className="btn" disabled={busyId === ad.id} onClick={() => toggleActive(ad)}>
              {ad.active ? "Pause" : "Resume"}
            </button>
            <button className="btn btn--danger" disabled={busyId === ad.id} onClick={() => removeAd(ad)}>
              Delete
            </button>
          </div>
          <div className="ad-row__strip">
            <SlotStrip startHour={ad.start_hour} endHour={ad.end_hour} compact />
          </div>
        </div>
      ))}
    </div>
  );
}
