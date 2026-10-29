"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, adFileUrl, ADS_CHANNEL_NAME } from "@/lib/supabase";
import { adCacheUrl, getDownloadedAdIds, putAd, deleteAds, downloadAd } from "@/lib/adCache";
import { adsForAuto, isAdActiveNow, hasCampaignEnded, isQuietHours } from "@/lib/time";

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
// added/edited/deleted, and the tablet catches up every time its realtime
// connection comes back), not on a timer. This interval only exists as a
// safety net for a broadcast that never arrived — still rare enough that
// it stays "sync when something actually changed," not polling.
const SYNC_FALLBACK_INTERVAL_MS = 15 * 60 * 1000;
// After a sync that didn't fully finish (a download cut off, the schedule
// fetch failing), try again on its own, backing off so a tablet stuck on a
// bad signal doesn't keep spending the free bandwidth allowance.
const SYNC_RETRY_MIN_MS = 2 * 60 * 1000;
const SYNC_RETRY_MAX_MS = 30 * 60 * 1000;
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
  // Reopened from the debug HUD, for a tablet set up with the wrong number
  // or moved to a different auto.
  const [changingAuto, setChangingAuto] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(AUTO_KEY) : null;
    setAutoNumber(saved || "");
  }, []);

  if (autoNumber === null) return null;
  if (!autoNumber || changingAuto) {
    return (
      <SetupScreen
        current={autoNumber}
        onSaved={(number) => {
          setAutoNumber(number);
          setChangingAuto(false);
        }}
        onCancel={autoNumber ? () => setChangingAuto(false) : null}
      />
    );
  }
  return <Player key={autoNumber} autoNumber={autoNumber} onChangeAuto={() => setChangingAuto(true)} />;
}

function samePlaylist(a, b) {
  return (
    a.length === b.length &&
    a.every(
      (item, i) =>
        item.id === b[i].id &&
        item.title === b[i].title &&
        item.sortOrder === b[i].sortOrder &&
        item.mediaType === b[i].mediaType
    )
  );
}

// AUTO-01, AUTO-02, ... — the next unused number in that sequence, so
// whoever's setting up a new tablet doesn't have to go check what the
// last one was called. Only ever a suggestion: still a plain editable
// field, for the rare case of deliberately reusing or skipping a number.
function nextAutoNumber(autos) {
  const used = autos
    .map((a) => /^AUTO-(\d+)$/.exec(a.auto_number))
    .filter(Boolean)
    .map((match) => parseInt(match[1], 10));
  const next = used.length ? Math.max(...used) + 1 : 1;
  return `AUTO-${String(next).padStart(2, "0")}`;
}

// Tells the Android wrapper whether touch should do anything right now.
// Blocking is only ever appropriate while an ad is actually playing with
// nothing to interact with — the setup screen and the debug HUD both need
// real taps, so they explicitly ask for touch back while they're shown.
// No-ops in a plain browser, where there's no native wrapper listening.
function notifyNativeTouch(enabled) {
  try {
    window.AndroidNative?.setTouchEnabled?.(enabled);
  } catch {
    // Not running inside the Android wrapper — nothing to do.
  }
}

// `current` is set when changing an already set-up tablet's number: the
// form starts from it instead of suggesting the next free one.
function SetupScreen({ current = "", onSaved, onCancel }) {
  const [value, setValue] = useState(current);
  const [label, setLabel] = useState(() => (current && localStorage.getItem(LABEL_KEY)) || "");
  const touchedRef = useRef(Boolean(current));

  // The setup form needs real taps — make sure touch isn't left blocked
  // from some earlier state (shouldn't happen, but cheap to be sure).
  useEffect(() => {
    notifyNativeTouch(true);
  }, []);

  useEffect(() => {
    supabase
      .from("autos")
      .select("auto_number")
      .then(({ data }) => {
        if (!touchedRef.current) setValue(nextAutoNumber(data || []));
      });
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    const number = value.trim().toUpperCase();
    if (!number) return;
    localStorage.setItem(AUTO_KEY, number);
    if (label.trim()) localStorage.setItem(LABEL_KEY, label.trim());
    else localStorage.removeItem(LABEL_KEY);
    // The saved schedule belongs to the old number — start this one clean.
    // Its first sync downloads the new auto's ads and clears the old ones.
    if (current && number !== current) localStorage.removeItem(ADS_SNAPSHOT_KEY);
    onSaved(number);
  }

  return (
    <div className="setup-screen">
      <form className="setup-card" onSubmit={handleSubmit}>
        <div>
          <span className="landing__mark">smato · player setup</span>
          <h1 className="signin__title">{current ? "Change this tablet's auto" : "Which auto is this?"}</h1>
        </div>
        <div className="field">
          <label htmlFor="autoNumber">Auto number</label>
          <input
            id="autoNumber"
            value={value}
            onChange={(e) => {
              touchedRef.current = true;
              setValue(e.target.value);
            }}
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
        {onCancel && (
          <button className="btn btn--ghost" type="button" onClick={onCancel}>
            Cancel, keep {current}
          </button>
        )}
        <p className="upload-status">
          {current
            ? "Ads for the new auto download as soon as the tablet is online."
            : "Saved permanently on this tablet. You can change it later from the 5-tap corner panel."}
        </p>
      </form>
    </div>
  );
}

function Player({ autoNumber, onChangeAuto }) {
  // Lock only after setup has handed over to the content screen. This also
  // runs when a saved auto is restored, even before ads or the network load.
  useEffect(() => {
    try {
      window.AndroidNative?.onPlayerReady?.();
    } catch {
      // Browsers and older APKs can still play without this bridge method.
    }
  }, []);

  const videoRef = useRef(null);
  const [playlist, setPlaylist] = useState([]); // [{id, title, url, sortOrder}]
  const [playIndex, setPlayIndex] = useState(0);
  const [hudOpen, setHudOpen] = useState(false);
  const [screenOff, setScreenOff] = useState(false);
  // Overnight quiet hours — re-checked every minute below, offline-safe.
  const [quietHours, setQuietHours] = useState(() => isQuietHours());
  // Either one keeps the screen black: the admin's remote switch, or night.
  const dark = screenOff || quietHours;
  // Read inside the retry/autoplay-recovery logic below, which runs on its
  // own timer — a plain state variable in that closure would be stale.
  const screenOffRef = useRef(false);
  useEffect(() => {
    screenOffRef.current = dark;
  }, [dark]);
  // What's on screen, read by the heartbeat's own timer — so the admin view
  // corrects itself within one heartbeat even if a "now playing" write was
  // missed (say, the tablet was offline the moment quiet hours began).
  const nowPlayingRef = useRef(null);
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

  // Touch only gets blocked while actually playing, with the HUD closed —
  // the HUD's own close button lives inside this same WebView and needs
  // real taps to work, same as the corner tap-zone that opens it.
  useEffect(() => {
    notifyNativeTouch(hudOpen);
    return () => notifyNativeTouch(true);
  }, [hudOpen]);

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
            now_playing_title: nowPlayingRef.current,
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

        // A separate append-only row per fix, alongside the live "current
        // position" overwrite above — this is what an end-of-day route
        // report reads from, since the fields above only ever hold the
        // latest point.
        supabase
          .from("auto_locations")
          .insert({
            auto_number: autoNumber,
            lat: fix.lat,
            lng: fix.lng,
            accuracy: fix.accuracy,
            recorded_at: fix.at.toISOString(),
          })
          .then(() => {});
      },
      (err) => setHud((h) => ({ ...h, gpsError: err.message })),
      { enableHighAccuracy: false, maximumAge: 20000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [autoNumber]);

  // --- sync: fetch schedule, download new videos, only then drop stale ones --
  // Only one pass ever runs at a time. The realtime nudge, the reconnect
  // catch-up and the online event can all land together, and two passes
  // overlapping would each download the same new video. A request that
  // arrives mid-pass queues exactly one more pass for when it finishes.
  const syncingRef = useRef(false);
  const syncAgainRef = useRef(false);
  const retryTimerRef = useRef(null);
  const retryDelayRef = useRef(SYNC_RETRY_MIN_MS);

  // One pass. Resolves true once everything this tablet needs is on disk.
  const syncPass = useCallback(async () => {
    try {
      // Paused ads come back too: their files stay on the tablet (below),
      // so resuming one doesn't mean every tablet downloads it all again.
      const { data: ads, error } = await supabase
        .from("ads")
        .select("*")
        .or(`auto_number.eq.${autoNumber},auto_number.is.null`);
      if (error) throw error;
      saveAdsSnapshot(ads || []);

      // Pauses, deletions and reorders apply right away, not after however
      // long the downloads below take on a weak signal.
      const relevant = adsForAuto(ads || [], autoNumber);
      await rebuildPlaylist(relevant);

      const existingIds = new Set(await getDownloadedAdIds());
      // Deleted ads and ads whose campaign has already ended aren't worth
      // keeping on disk. A paused ad's file is kept — out of rotation, but
      // ready the moment it's resumed.
      const notExpired = relevant.filter((ad) => !hasCampaignEnded(ad));
      const wantedIds = new Set(notExpired.map((a) => a.id));

      let failed = 0;
      for (const ad of notExpired) {
        if (!ad.active || existingIds.has(ad.id)) continue;
        try {
          await putAd(ad.id, await downloadAd(adFileUrl(ad.file_path)));
        } catch {
          // One bad download doesn't hold up the rest — retried later.
          failed += 1;
        }
      }

      const staleIds = [...existingIds].filter((id) => !wantedIds.has(id));
      if (staleIds.length) await deleteAds(staleIds);

      await rebuildPlaylist(relevant);
      setHud((h) => ({
        ...h,
        lastSync: new Date(),
        syncError: failed ? `${failed} download(s) didn't finish, retrying` : null,
      }));
      return failed === 0;
    } catch (err) {
      setHud((h) => ({ ...h, syncError: err.message || "sync failed" }));
      return false;
    }
  }, [autoNumber]);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    if (syncingRef.current) {
      syncAgainRef.current = true;
      return;
    }
    syncingRef.current = true;
    clearTimeout(retryTimerRef.current);
    let ok = false;
    try {
      do {
        syncAgainRef.current = false;
        ok = await syncPass();
      } while (syncAgainRef.current);
    } finally {
      syncingRef.current = false;
    }

    if (ok) {
      retryDelayRef.current = SYNC_RETRY_MIN_MS;
      return;
    }
    const delay = retryDelayRef.current;
    retryDelayRef.current = Math.min(delay * 2, SYNC_RETRY_MAX_MS);
    retryTimerRef.current = setTimeout(sync, delay);
  }, [syncPass]);

  // Rebuild the local playlist from whatever is actually downloaded right
  // now, filtered to ads that are active. Each item's URL is just
  // /__ad-cache__/<id> — a stable, ordinary-looking same-origin URL served
  // by the service worker straight from Cache Storage, not a blob: URL, so
  // there's no per-rebuild churn to worry about and no revoke-while-playing
  // race to get wrong.
  //
  // Never touches the network: with no fresh schedule passed in, it uses
  // the copy saved by the last successful sync. The once-a-minute tick only
  // needs the tablet's own clock checked against that — asking the server
  // every minute, from every tablet, spent the free plan's bandwidth on a
  // schedule that only changes when someone edits it in the admin.
  const rebuildPlaylist = useCallback(
    async (adsHint) => {
      const downloadedIds = new Set(await getDownloadedAdIds());
      const scheduleAds = adsHint || adsForAuto(loadAdsSnapshot(), autoNumber);

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

      // Nothing changed → keep the very same array. A fresh copy every
      // minute made the ad on screen look "new" each time: an image's
      // 2-minute timer restarted before it could ever finish (so it never
      // moved on), and a video lost its stall-recovery listeners.
      setPlaylist((prev) => (samePlaylist(prev, next) ? prev : next));
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
    return () => {
      clearInterval(syncId);
      clearTimeout(retryTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onOnline = () => sync();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [sync]);

  // Picks up a blackout that was set while this tablet was offline — the
  // broadcast below only reaches a tablet that's already connected when it
  // fires, so this is the catch-up path for "was it off before I rebooted?"
  // (and for "did I miss one while my connection was down?", see below).
  const refreshScreenOff = useCallback(() => {
    supabase
      .from("autos")
      .select("screen_off")
      .eq("auto_number", autoNumber)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error) setScreenOff(Boolean(data?.screen_off));
      });
  }, [autoNumber]);

  useEffect(() => {
    refreshScreenOff();
  }, [refreshScreenOff]);

  // The real trigger: sync the moment admin submits an ad (add/edit/pause/
  // delete), instead of waiting on a timer. Plain Realtime Broadcast, not
  // postgres_changes — works with the anon key out of the box, no Supabase
  // dashboard setting to remember to flip.
  useEffect(() => {
    const channel = supabase
      .channel(ADS_CHANNEL_NAME)
      .on("broadcast", { event: "changed" }, () => sync())
      .on("broadcast", { event: "screen" }, ({ payload }) => {
        if (payload?.auto_number === autoNumber) setScreenOff(Boolean(payload.screen_off));
      })
      .subscribe((status) => {
        // Fires on the first join and again every time the connection comes
        // back after dropping — which in a moving auto is all day. Broadcasts
        // sent while it was down never arrive, so catch up on both here.
        if (status !== "SUBSCRIBED") return;
        sync();
        refreshScreenOff();
      });
    return () => supabase.removeChannel(channel);
  }, [sync, autoNumber, refreshScreenOff]);

  // Re-check which ads are time-active once a minute, offline-safe.
  useEffect(() => {
    const id = setInterval(() => {
      rebuildPlaylist();
      setQuietHours(isQuietHours());
    }, TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [rebuildPlaylist]);

  // --- playback ---------------------------------------------------------------
  // During quiet hours nothing is "current" at all — no video element, no
  // image rotation, and the admin view sees nothing playing.
  const current =
    !quietHours && playlist.length ? playlist[playIndex % playlist.length] : null;

  // Lets the admin Fleet view show what's actually on screen right now.
  useEffect(() => {
    nowPlayingRef.current = current ? current.title : null;
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
      // A remote screen-off is a deliberate pause, not something to fight —
      // skip it here instead of fighting the toggle below on every retry tick.
      if (screenOffRef.current) return;
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

  // Remote screen-off: pauses whatever's playing and covers it with solid
  // black (rendered below) — in every browser. Inside the Android wrapper
  // specifically, AndroidNative is also injected, which actually dims the
  // hardware backlight — a plain web page has no API for that, only native
  // code can touch real screen brightness. Both resume together the
  // instant it's switched back on from the admin side.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (dark) {
      video.pause();
    } else if (current && current.mediaType !== "image") {
      video.play().catch(() => {});
    }
  }, [dark, current]);

  useEffect(() => {
    try {
      window.AndroidNative?.setScreenOff?.(dark);
    } catch {
      // Not running inside the Android wrapper — nothing to do.
    }
  }, [dark]);

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
      {dark && <div className="player__blackout" aria-hidden="true" />}
      <div className="player__tap-zone" onClick={handleCornerTap} />
      {hudOpen && (
        <Hud
          autoNumber={autoNumber}
          hud={hud}
          current={current}
          playlistLength={playlist.length}
          onClose={() => setHudOpen(false)}
          onChangeAuto={onChangeAuto}
        />
      )}
    </div>
  );
}

// Shown whenever there's nothing to play — the smato poster, fitted whole
// (letterboxed on black) so its phone number and handle never get cropped.
// Nothing ticking or clickable. A blank ad slot should look like an
// idle screen, not a diagnostic readout.
function IdleScreen() {
  return <img className="player__idle" src="/idle.jpg" alt="" />;
}

function Hud({ autoNumber, hud, current, playlistLength, onClose, onChangeAuto }) {
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
      <button className="btn hud__action" onClick={onChangeAuto}>
        Change auto number
      </button>
    </div>
  );
}
