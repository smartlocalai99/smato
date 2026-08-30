"use client";

import { useCallback, useEffect, useState } from "react";
import nextDynamic from "next/dynamic";
import { supabase, ADS_BUCKET, notifyAdsChanged, warmAdsChannel } from "@/lib/supabase";
import FleetStrip from "@/components/FleetStrip";
import { useAdminSession } from "@/components/admin/AdminShell";
import AdsList from "@/components/admin/AdsList";
import { isAdCurrentlyRunning } from "@/lib/time";

// Leaflet touches window/document at load time, so it can only ever run in
// the browser — never during Next's server render.
const FleetMap = nextDynamic(() => import("@/components/FleetMap"), { ssr: false });

export const dynamic = "force-dynamic";

const fieldClass =
  "rounded-md border border-line bg-ink px-3 py-2.5 text-text focus:border-teal focus:outline-none";
const labelClass = "font-mono text-xs tracking-wide text-text-dim";
const cardClass = "rounded-lg border border-line bg-panel p-6";

function statusClass(type) {
  if (type === "error") return "text-red";
  if (type === "ok") return "text-green";
  return "text-text-dim";
}

export default function AdminPage() {
  return <Console />;
}

function Console() {
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
    warmAdsChannel();

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

  return (
    <div className="flex flex-col gap-10 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg">Fleet</h2>
          <span className="font-mono text-xs text-text-faint">
            {autos.length} auto(s) checked in
          </span>
        </div>
        <FleetStrip autos={autos} />
        <FleetMap autos={autos} />
      </section>

      <section>
        <div className="mb-4">
          <h2 className="font-display text-lg">Add an ad</h2>
        </div>
        <UploadForm autos={autos} onUploaded={loadAds} />
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg">Running now</h2>
          <span className="font-mono text-xs text-text-faint">
            {ads.filter((ad) => isAdCurrentlyRunning(ad)).length} live
          </span>
        </div>
        {loadError && <div className="mb-3 text-sm text-red">{loadError}</div>}
        <AdsList
          ads={ads.filter((ad) => isAdCurrentlyRunning(ad))}
          onChange={loadAds}
          emptyMessage="Nothing is playing right now. Upload an ad above to get started."
        />
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg">Team access</h2>
          <span className="font-mono text-xs text-text-faint">who can sign in to this console</span>
        </div>
        <TeamAccess />
      </section>
    </div>
  );
}

function TeamAccess() {
  const session = useAdminSession();
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
    <form onSubmit={handleSubmit} className={cardClass}>
      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="teamMobile" className={labelClass}>
            Mobile number
          </label>
          <input
            id="teamMobile"
            type="tel"
            inputMode="numeric"
            placeholder="98765 43210"
            required
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="teamPin" className={labelClass}>
            PIN
          </label>
          <input
            id="teamPin"
            type="text"
            inputMode="numeric"
            placeholder="6-digit PIN"
            required
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={status?.type === "busy"}
          className="rounded-md bg-amber px-4 py-2.5 font-semibold text-on-amber transition-colors hover:bg-[#ffc250] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status?.type === "busy" ? "Adding…" : "Add login"}
        </button>
        {status && (
          <span className={`font-mono text-sm ${statusClass(status.type)}`}>{status.text}</span>
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
  const [sortOrder, setSortOrder] = useState(0);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState(null); // { type: 'error'|'ok'|'busy', text }

  function resetForm() {
    setTitle("");
    setAutoChoice("ALL");
    setNewAutoNumber("");
    setStartDate("");
    setEndDate("");
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
        sort_order: Number(sortOrder) || 0,
      });
      if (insertError) throw insertError;
      notifyAdsChanged();

      setStatus({ type: "ok", text: "Uploaded — playing on the tablet within a few seconds." });
      resetForm();
      onUploaded();
    } catch (err) {
      setStatus({ type: "error", text: err.message || "Upload failed." });
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cardClass}>
      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="title" className={labelClass}>
            Title
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Diwali offer"
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="auto" className={labelClass}>
            Plays on
          </label>
          <select
            id="auto"
            value={autoChoice}
            onChange={(e) => setAutoChoice(e.target.value)}
            className={fieldClass}
          >
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
          <div className="flex flex-col gap-1.5">
            <label htmlFor="newAuto" className={labelClass}>
              New auto number
            </label>
            <input
              id="newAuto"
              value={newAutoNumber}
              onChange={(e) => setNewAutoNumber(e.target.value)}
              placeholder="AUTO-02"
              className={fieldClass}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="sortOrder" className={labelClass}>
            Play order
          </label>
          <input
            id="sortOrder"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className={fieldClass}
          />
          <span className="text-xs text-text-faint">
            Ads loop all day in this order — lowest plays first.
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="startDate" className={labelClass}>
            Start date (optional)
          </label>
          <input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="endDate" className={labelClass}>
            End date (optional)
          </label>
          <input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-1.5">
        <label htmlFor="file" className={labelClass}>
          Video or image file
        </label>
        <input
          id="file"
          type="file"
          accept="video/*,image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className={fieldClass}
        />
        {file && (
          <span className="font-mono text-sm text-text-dim">
            {file.type.startsWith("image/") ? "Image" : "Video"} — shown for{" "}
            {file.type.startsWith("image/") ? "2 minutes" : "its full length"} each time it plays.
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={status?.type === "busy"}
          className="rounded-md bg-amber px-4 py-2.5 font-semibold text-on-amber transition-colors hover:bg-[#ffc250] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status?.type === "busy" ? "Uploading…" : "Upload & schedule"}
        </button>
        {status && (
          <span className={`font-mono text-sm ${statusClass(status.type)}`}>{status.text}</span>
        )}
      </div>
    </form>
  );
}
