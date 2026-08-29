"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, adFileUrl } from "@/lib/supabase";
import { getAllVideos, putVideo, deleteVideos } from "@/lib/idb";
import { adsForAuto, isAdActiveNow } from "@/lib/time";

const AUTO_KEY = "smato.autoNumber";
const LABEL_KEY = "smato.autoLabel";
// Ads sync is event-driven (Supabase Realtime fires the moment an ad is
// added/edited/deleted), not on a timer. This interval only exists as a
// safety net in case the realtime connection silently drops — deliberately
// rare so it stays "sync when something actually changed," not polling.
const SYNC_FALLBACK_INTERVAL_MS = 60 * 60 * 1000;
const SW_UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const TICK_INTERVAL_MS = 60 * 1000;
const GPS_MIN_INTERVAL_MS = 30 * 1000;
const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const IMAGE_DURATION_MS = 8 * 1000;

export const dynamic = "force-dynamic";

export default function PlayerPage() {
  const [autoNumber, setAutoNumber] = useState(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(AUTO_KEY) : null;
    setAutoNumber(saved || "");
  }, []);

  if (autoNumber === null) return null;
  if (!autoNumber) return <SetupScreen onSaved={setAutoNumber} />;
  return <Player autoNumber={autoNumber} />;
}

function SetupScreen({ onSaved }) {
  const [value, setValue] = useState("AUTO-01");
  const [label, setLabel] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const number = value.trim().toUpperCase();
    if (!number) return;
    localStorage.setItem(AUTO_KEY, number);
    if (label.trim()) localStorage.setItem(LABEL_KEY, label.trim());
    onSaved(number);
  }

  return (
    <div className="setup-screen">
      <form className="setup-card" onSubmit={handleSubmit}>
        <div>
          <span className="landing__mark">smato · player setup</span>
          <h1 className="signin__title">Which auto is this?</h1>
        </div>
        <div className="field">
          <label htmlFor="autoNumber">Auto number</label>
          <input
            id="autoNumber"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="AUTO-01"
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="label">Label (optional)</label>
          <input
            id="label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Route 12 driver"
          />
        </div>
        <button className="btn btn--primary" type="submit">
          Save & start playing
        </button>
        <p className="upload-status">Saved permanently on this tablet. You won't see this screen again.</p>
      </form>
    </div>
  );
}

function Player({ autoNumber }) {
  const videoRef = useRef(null);
  const [playlist, setPlaylist] = useState([]); // [{id, title, url, sortOrder}]
  const [playIndex, setPlayIndex] = useState(0);
  const [hudOpen, setHudOpen] = useState(false);
  const [hud, setHud] = useState({
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    lastSync: null,
    syncError: null,
    downloadedCount: 0,
    gps: null,
    gpsError: null,
    now: new Date(),
  });

  const tapCountRef = useRef(0);
  const tapTimerRef = useRef(null);
  const objectUrlsRef = useRef([]);

  // --- tap-5x-corner to toggle the debug HUD ---------------------------------
  const handleCornerTap = useCallback(() => {
    tapCountRef.current += 1;
    clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 3000);
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      setHudOpen((v) => !v);
    }
  }, []);

  // --- service worker: app shell keeps loading with no network --------------
  // Also what makes a fresh deploy actually reach the tablet: once the new
  // worker takes over, reload once to pick it up instead of quietly running
  // whatever build happened to load first, possibly forever.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloaded = false;
    let updateInterval;

    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        const checkForUpdate = () => registration.update().catch(() => {});
        checkForUpdate();
        updateInterval = setInterval(checkForUpdate, SW_UPDATE_CHECK_INTERVAL_MS);
      })
      .catch(() => {});

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      clearInterval(updateInterval);
    };
  }, []);

  // --- network status ---------------------------------------------------------
  useEffect(() => {
    const goOnline = () => setHud((h) => ({ ...h, online: true }));
    const goOffline = () => setHud((h) => ({ ...h, online: false }));
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // --- heartbeat: tell the admin console this tablet is alive ----------------
  useEffect(() => {
    let cancelled = false;
    async function beat() {
      if (!navigator.onLine) return;
      await supabase
        .from("autos")
        .upsert(
          { auto_number: autoNumber, last_seen_at: new Date().toISOString() },
          { onConflict: "auto_number" }
        );
    }
    beat();
    const id = setInterval(() => !cancelled && beat(), HEARTBEAT_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [autoNumber]);

  // --- GPS: watch position, throttle writes, always keep monitoring ----------
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setHud((h) => ({ ...h, gpsError: "not supported" }));
      return;
    }
    let lastWrite = 0;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: new Date(),
        };
        setHud((h) => ({ ...h, gps: fix, gpsError: null }));

        const now = Date.now();
        if (now - lastWrite < GPS_MIN_INTERVAL_MS) return;
        lastWrite = now;
        if (!navigator.onLine) return;
        supabase
          .from("autos")
          .upsert(
            {
              auto_number: autoNumber,
              last_lat: fix.lat,
              last_lng: fix.lng,
              last_gps_accuracy: fix.accuracy,
              last_gps_at: fix.at.toISOString(),
              last_seen_at: fix.at.toISOString(),
            },
            { onConflict: "auto_number" }
          )
          .then(() => {});
      },
      (err) => setHud((h) => ({ ...h, gpsError: err.message })),
      { enableHighAccuracy: false, maximumAge: 20000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [autoNumber]);

  // --- sync: fetch schedule, download new videos, only then drop stale ones --
  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const { data: ads, error } = await supabase
        .from("ads")
        .select("*")
        .eq("active", true)
        .or(`auto_number.eq.${autoNumber},auto_number.is.null`);
      if (error) throw error;

      const relevant = adsForAuto(ads || [], autoNumber);
      const existing = await getAllVideos();
      const existingIds = new Set(existing.map((v) => v.id));
      const wantedIds = new Set(relevant.map((a) => a.id));

      for (const ad of relevant) {
        if (existingIds.has(ad.id)) continue;
        const res = await fetch(adFileUrl(ad.file_path));
        if (!res.ok) continue;
        const blob = await res.blob();
        await putVideo({
          id: ad.id,
          blob,
          filePath: ad.file_path,
          title: ad.title,
          mediaType: ad.media_type || "video",
          updatedAt: Date.now(),
        });
      }

      const staleIds = existing.filter((v) => !wantedIds.has(v.id)).map((v) => v.id);
      if (staleIds.length) await deleteVideos(staleIds);

      setHud((h) => ({ ...h, lastSync: new Date(), syncError: null }));
      await rebuildPlaylist(relevant);
    } catch (err) {
      setHud((h) => ({ ...h, syncError: err.message || "sync failed" }));
    }
  }, [autoNumber]);

  // Rebuild the local playlist from whatever is actually on disk right now,
  // filtered to ads that are time-active this minute.
  const rebuildPlaylist = useCallback(
    async (adsHint) => {
      const stored = await getAllVideos();
      const storedById = new Map(stored.map((v) => [v.id, v]));

      let scheduleAds = adsHint;
      if (!scheduleAds) {
        const { data } = await supabase
          .from("ads")
          .select("*")
          .eq("active", true)
          .or(`auto_number.eq.${autoNumber},auto_number.is.null`);
        scheduleAds = adsForAuto(data || [], autoNumber);
      }

      const now = new Date();
      const active = scheduleAds
        .filter((ad) => storedById.has(ad.id))
        .filter((ad) => isAdActiveNow(ad, autoNumber, now));

      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      objectUrlsRef.current = [];

      const next = active.map((ad) => {
        const rec = storedById.get(ad.id);
        const url = URL.createObjectURL(rec.blob);
        objectUrlsRef.current.push(url);
        return {
          id: ad.id,
          title: ad.title,
          url,
          sortOrder: ad.sort_order,
          mediaType: rec.mediaType || ad.media_type || "video",
        };
      });

      setPlaylist(next);
      setPlayIndex((i) => (next.length ? i % next.length : 0));
      setHud((h) => ({ ...h, downloadedCount: stored.length, now }));
    },
    [autoNumber]
  );

  // Initial load: play whatever is already downloaded instantly, then sync.
  useEffect(() => {
    rebuildPlaylist();
    sync();
    const syncId = setInterval(sync, SYNC_FALLBACK_INTERVAL_MS);
    return () => clearInterval(syncId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onOnline = () => sync();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [sync]);

  // The real trigger: sync the moment an ad is added, edited, or deleted,
  // instead of waiting on a timer. Requires Realtime turned on for the
  // `ads` table (Supabase → Database → Replication).
  useEffect(() => {
    const channel = supabase
      .channel(`player-ads-${autoNumber}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ads" }, () => sync())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [autoNumber, sync]);

  // Re-check which ads are time-active once a minute, offline-safe.
  useEffect(() => {
    const id = setInterval(() => rebuildPlaylist(), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [rebuildPlaylist]);

  useEffect(() => {
    return () => objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  // --- playback ---------------------------------------------------------------
  const current = playlist.length ? playlist[playIndex % playlist.length] : null;

  function handleEnded() {
    setPlayIndex((i) => (playlist.length ? (i + 1) % playlist.length : 0));
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !current || current.mediaType === "image") return;
    if (video.dataset.playingId === current.id) return;
    video.dataset.playingId = current.id;
    video.src = current.url;
    video.play().catch(() => {});
  }, [current]);

  // Images don't fire an "ended" event, so give each one a fixed slot.
  useEffect(() => {
    if (!current || current.mediaType !== "image") return;
    const timer = setTimeout(handleEnded, IMAGE_DURATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, playlist.length]);

  return (
    <div className="player">
      {current ? (
        current.mediaType === "image" ? (
          <img className="player__image" src={current.url} alt="" />
        ) : (
          <video ref={videoRef} muted playsInline autoPlay onEnded={handleEnded} />
        )
      ) : (
        <IdleScreen />
      )}
      <div className="player__tap-zone" onClick={handleCornerTap} />
      {hudOpen && (
        <Hud
          autoNumber={autoNumber}
          hud={hud}
          current={current}
          playlistLength={playlist.length}
          onClose={() => setHudOpen(false)}
        />
      )}
    </div>
  );
}

function IdleScreen() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="player__idle">
      <div className="player__idle-clock">
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
      <div>no ad scheduled right now</div>
    </div>
  );
}

function Hud({ autoNumber, hud, current, playlistLength, onClose }) {
  return (
    <div className="hud">
      <div className="hud__title">
        <span>{autoNumber}</span>
        <button className="hud__close" onClick={onClose}>
          close ✕
        </button>
      </div>
      <div className="hud__row">
        <span>network</span>
        <span>{hud.online ? "online" : "offline"}</span>
      </div>
      <div className="hud__row">
        <span>last sync</span>
        <span>{hud.lastSync ? hud.lastSync.toLocaleTimeString() : "—"}</span>
      </div>
      {hud.syncError && (
        <div className="hud__row">
          <span>sync error</span>
          <span>{hud.syncError}</span>
        </div>
      )}
      <div className="hud__row">
        <span>ads downloaded</span>
        <span>{hud.downloadedCount}</span>
      </div>
      <div className="hud__row">
        <span>playing now</span>
        <span>
          {current ? current.title : "idle"} ({playlistLength} in rotation)
        </span>
      </div>
      <div className="hud__row">
        <span>gps fix</span>
        <span>
          {hud.gps ? `${hud.gps.lat.toFixed(4)}, ${hud.gps.lng.toFixed(4)}` : hud.gpsError || "waiting…"}
        </span>
      </div>
      <div className="hud__row">
        <span>gps age</span>
        <span>{hud.gps ? `${Math.round((Date.now() - hud.gps.at.getTime()) / 1000)}s` : "—"}</span>
      </div>
    </div>
  );
}
