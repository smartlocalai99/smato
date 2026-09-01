"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, adFileUrl, ADS_CHANNEL_NAME } from "@/lib/supabase";
import { adCacheUrl, getDownloadedAdIds, putAd, deleteAds } from "@/lib/adCache";
import { adsForAuto, isAdActiveNow, hasCampaignEnded } from "@/lib/time";

const AUTO_KEY = "smato.autoNumber";
const LABEL_KEY = "smato.autoLabel";
const ADS_SNAPSHOT_KEY = "smato.lastAdsSnapshot";

// A tiny local copy of the last-known schedule (titles, dates, sort order —
// not the videos themselves, those are already offline in Cache Storage).
// Without this, a tablet that reboots while genuinely offline — power cut,
// router down overnight — would fail its very first fetch of "what's the
// schedule" and sit on the idle screen despite every video already being
// downloaded and ready to play.
function saveAdsSnapshot(ads) {
  try {
    localStorage.setItem(ADS_SNAPSHOT_KEY, JSON.stringify(ads));
  } catch {
    // best-effort only — worst case, offline cold start has nothing to fall
    // back to and waits for the next successful sync like it used to.
  }
}

function loadAdsSnapshot() {
  try {
    const raw = localStorage.getItem(ADS_SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Fully Kiosk Browser (what every tablet actually runs) injects a `fully`
// JS interface with reliable, synchronous battery info once "Enable
// JavaScript Interface" is on in its Advanced Web Settings — try that
// first. The standard Battery Status API is the fallback for a plain
// browser during local testing, or a tablet where that setting isn't
// flipped yet. Neither one polls hardware; both just read a value the OS
// already tracks for its own power management.
async function readBattery() {
  try {
    if (window.fully?.getBatteryLevel) {
      return {
        level: Math.round(window.fully.getBatteryLevel()),
        charging: Boolean(window.fully.isPlugged?.()),
      };
    }
    if (navigator.getBattery) {
      const battery = await navigator.getBattery();
      return { level: Math.round(battery.level * 100), charging: battery.charging };
    }
  } catch {
    // Unsupported or blocked — reported as unknown below.
  }
  return { level: null, charging: null };
}
// Ads sync is event-driven (Supabase Realtime fires the moment an ad is
// added/edited/deleted), not on a timer. This interval only exists as a
// safety net in case the realtime connection silently drops — deliberately
// rare so it stays "sync when something actually changed," not polling.
const SYNC_FALLBACK_INTERVAL_MS = 60 * 60 * 1000;
const SW_UPDATE_CHECK_INTERVAL_MS = 3 * 60 * 1000;
const TICK_INTERVAL_MS = 60 * 1000;
// Both throttle how often a tablet writes to the database, not how often it
// reads its own GPS chip — kept well spaced out so ~20 tablets running all
// day stay comfortably inside Supabase's free-tier bandwidth allowance.
const GPS_MIN_INTERVAL_MS = 5 * 60 * 1000;
const HEARTBEAT_INTERVAL_MS = 3 * 60 * 1000;
const IMAGE_DURATION_MS = 2 * 60 * 1000;

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
        <p className="upload-status">Saved permanently on this tablet. You won&apos;t see this screen again.</p>
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
    playError: null,
    cacheNames: [],
    probe: null,
    now: new Date(),
  });

  const tapCountRef = useRef(0);
  const tapTimerRef = useRef(null);

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

  // Refresh cache/SW state every time the HUD opens, so "did the fix
  // actually reach this tablet yet" has a real answer instead of a guess.
  useEffect(() => {
    if (!hudOpen || typeof caches === "undefined") return;
    caches.keys().then((names) => setHud((h) => ({ ...h, cacheNames: names })));
  }, [hudOpen]);

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
      const battery = await readBattery();
      await supabase
        .from("autos")
        .upsert(
          {
            auto_number: autoNumber,
            last_seen_at: new Date().toISOString(),
            battery_level: battery.level,
            battery_charging: battery.charging,
          },
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
      saveAdsSnapshot(ads || []);

      const relevant = adsForAuto(ads || [], autoNumber);
      const existingIds = new Set(await getDownloadedAdIds());
      // Ads whose campaign has already ended aren't worth keeping on disk —
      // pausing, deleting, or letting the end date pass all clear the
      // tablet's local copy the same way, not just its spot in rotation.
      const notExpired = relevant.filter((ad) => !hasCampaignEnded(ad));
      const wantedIds = new Set(notExpired.map((a) => a.id));

      for (const ad of notExpired) {
        if (existingIds.has(ad.id)) continue;
        const res = await fetch(adFileUrl(ad.file_path));
        if (!res.ok) continue;
        await putAd(ad.id, res);
      }

      const staleIds = [...existingIds].filter((id) => !wantedIds.has(id));
      if (staleIds.length) await deleteAds(staleIds);

      setHud((h) => ({ ...h, lastSync: new Date(), syncError: null }));
      await rebuildPlaylist(relevant);
    } catch (err) {
      setHud((h) => ({ ...h, syncError: err.message || "sync failed" }));
    }
  }, [autoNumber]);

  // Rebuild the local playlist from whatever is actually downloaded right
  // now, filtered to ads that are active. Each item's URL is just
  // /__ad-cache__/<id> — a stable, ordinary-looking same-origin URL served
  // by the service worker straight from Cache Storage, not a blob: URL, so
  // there's no per-rebuild churn to worry about and no revoke-while-playing
  // race to get wrong.
  const rebuildPlaylist = useCallback(
    async (adsHint) => {
      const downloadedIds = new Set(await getDownloadedAdIds());

      let scheduleAds = adsHint;
      if (!scheduleAds) {
        try {
          const { data, error } = await supabase
            .from("ads")
            .select("*")
            .eq("active", true)
            .or(`auto_number.eq.${autoNumber},auto_number.is.null`);
          if (error) throw error;
          scheduleAds = adsForAuto(data || [], autoNumber);
        } catch {
          // Offline with nothing passed in — fall back to the schedule as
          // of the last successful sync instead of coming up empty.
          scheduleAds = adsForAuto(loadAdsSnapshot(), autoNumber);
        }
      }

      const now = new Date();
      const active = scheduleAds
        .filter((ad) => downloadedIds.has(ad.id))
        .filter((ad) => isAdActiveNow(ad, autoNumber, now));

      const next = active.map((ad) => ({
        id: ad.id,
        title: ad.title,
        url: adCacheUrl(ad.id),
        sortOrder: ad.sort_order,
        mediaType: ad.media_type || "video",
      }));

      setPlaylist(next);
      setPlayIndex((i) => (next.length ? i % next.length : 0));
      setHud((h) => ({ ...h, downloadedCount: downloadedIds.size, now }));
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

  // The real trigger: sync the moment admin submits an ad (add/edit/pause/
  // delete), instead of waiting on a timer. Plain Realtime Broadcast, not
  // postgres_changes — works with the anon key out of the box, no Supabase
  // dashboard setting to remember to flip.
  useEffect(() => {
    const channel = supabase
      .channel(ADS_CHANNEL_NAME)
      .on("broadcast", { event: "changed" }, () => sync())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [sync]);

  // Re-check which ads are time-active once a minute, offline-safe.
  useEffect(() => {
    const id = setInterval(() => rebuildPlaylist(), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [rebuildPlaylist]);

  // --- playback ---------------------------------------------------------------
  const current = playlist.length ? playlist[playIndex % playlist.length] : null;

  // Lets the admin Fleet view show what's actually on screen right now.
  useEffect(() => {
    if (!navigator.onLine) return;
    supabase
      .from("autos")
      .upsert(
        { auto_number: autoNumber, now_playing_title: current ? current.title : null },
        { onConflict: "auto_number" }
      )
      .then(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoNumber, current?.id]);

  function handleEnded() {
    // A single-ad rotation would advance from index 0 back to index 0 —
    // setPlayIndex sees an unchanged value, bails out of re-rendering, and
    // the src-assignment effect below (keyed on `current`) never re-fires,
    // so nothing ever calls play() again. Restart it directly instead of
    // depending on a state change nobody would actually see, and stop
    // depending on the video element's native `loop` attribute entirely —
    // it isn't consistently honored across every WebView this runs in.
    if (playlist.length <= 1) {
      const video = videoRef.current;
      if (video) {
        video.currentTime = 0;
        video.play().catch(() => {});
      }
      return;
    }
    setPlayIndex((i) => (i + 1) % playlist.length);
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !current || current.mediaType === "image") return;
    if (video.dataset.playingId === current.id) return;
    video.dataset.playingId = current.id;

    // React's `muted` prop doesn't always reach the element before autoplay
    // is attempted, and unmuted autoplay is silently blocked by the browser
    // — which used to fail here with no visible error, leaving the video
    // paused on its native play button forever. Set it directly, and keep
    // retrying: a kiosk tablet has nobody there to tap play.
    video.muted = true;
    video.defaultMuted = true;
    video.src = current.url;

    const tryPlay = () => {
      video.play().catch((err) => {
        setHud((h) => ({ ...h, playError: err?.message || "play() blocked" }));
      });
    };
    tryPlay();

    const onPlaying = () => setHud((h) => ({ ...h, playError: null }));
    const onCanPlay = () => {
      if (video.paused) tryPlay();
    };
    // play() rejecting only covers autoplay being blocked. A codec/format
    // the device genuinely can't decode fails differently — the element
    // loads, play() may not even reject, and it just never renders a frame.
    // That shows up here instead, on video.error.
    const onError = () => {
      const codeNames = { 1: "aborted", 2: "network", 3: "decode", 4: "format not supported" };
      const code = video.error?.code;
      setHud((h) => ({
        ...h,
        playError: `video error: ${codeNames[code] || "unknown"} (code ${code ?? "?"})`,
      }));

      // See exactly what our own endpoint hands back for this exact URL,
      // instead of inferring it from the video element's behavior.
      fetch(video.src, { headers: { Range: "bytes=0-1023" } })
        .then((res) =>
          res.arrayBuffer().then((buf) => ({
            status: res.status,
            contentType: res.headers.get("content-type"),
            contentRange: res.headers.get("content-range"),
            contentLength: res.headers.get("content-length"),
            bytesReceived: buf.byteLength,
          }))
        )
        .then((probe) => setHud((h) => ({ ...h, probe })))
        .catch((err) => setHud((h) => ({ ...h, probe: { fetchFailed: err.message } })));
    };
    video.addEventListener("playing", onPlaying);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("error", onError);
    const retryTimer = setInterval(() => {
      if (video.paused && video.dataset.playingId === current.id) tryPlay();
    }, 3000);

    return () => {
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("error", onError);
      clearInterval(retryTimer);
    };
  }, [current]);

  // Images don't fire an "ended" event, so give each one a fixed slot. A
  // single-image rotation never changes "current" between advances (same
  // array, same object, every time), so a one-shot setTimeout tied to that
  // dependency would only ever fire once — setInterval keeps re-firing on
  // its own without needing the effect to re-run at all.
  useEffect(() => {
    if (!current || current.mediaType !== "image") return;
    const timer = setInterval(handleEnded, IMAGE_DURATION_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, playlist.length]);

  return (
    <div className="player">
      {current ? (
        current.mediaType === "image" ? (
          <img className="player__image" src={current.url} alt="" />
        ) : (
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            // Looping is handled entirely in handleEnded (restarting the
            // same video, or advancing to the next one) rather than the
            // native `loop` attribute, which isn't consistently honored
            // across every WebView this runs in.
            onEnded={handleEnded}
          />
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
      <div className="hud__row hud__row--wrap">
        <span>browser</span>
        <span>{typeof navigator !== "undefined" ? navigator.userAgent : "—"}</span>
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
      {hud.playError && (
        <div className="hud__row">
          <span>play error</span>
          <span>{hud.playError}</span>
        </div>
      )}
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
      <div className="hud__row">
        <span>sw active</span>
        <span>
          {typeof navigator !== "undefined" && navigator.serviceWorker?.controller ? "yes" : "no"}
        </span>
      </div>
      <div className="hud__row hud__row--wrap">
        <span>cache versions</span>
        <span>{hud.cacheNames.length ? hud.cacheNames.join(", ") : "—"}</span>
      </div>
      {hud.probe && (
        <div className="hud__row hud__row--wrap">
          <span>source probe</span>
          <span>{JSON.stringify(hud.probe)}</span>
        </div>
      )}
    </div>
  );
}
