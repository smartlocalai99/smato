"use client";

import { useState } from "react";
import { supabase, setAutoScreen } from "@/lib/supabase";
import Modal from "@/components/admin/Modal";
import { timeAgo } from "@/lib/autoStatus";
import {
  cancelCommand,
  commandStage,
  isAdsApp,
  isOnline,
  isPending,
  playlistPosition,
  saveRecoveryPin,
  sendCommand,
  tvPlaylist,
  validPin,
} from "@/lib/tvAdmin";

const buttonClass =
  "min-h-11 rounded-full px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const primaryClass = `${buttonClass} bg-amber text-on-amber hover:bg-[#ffc250]`;
const secondaryClass = `${buttonClass} border border-line text-text hover:border-text-faint`;

const STAGE_STYLES = {
  requested: "text-text-dim",
  offline: "text-amber",
  received: "text-teal",
  completed: "text-green",
  failed: "text-red",
  cancelled: "text-text-faint",
};

// What each risky action does, said once before it happens.
const CONFIRM = {
  unlock: {
    title: "Unlock this TV?",
    body: "SMATO stops advertising mode and hands the TV back to its own home screen. It stays unlocked after a restart, and SMATO can then be uninstalled from the TV's Settings. Nothing else on the TV is changed.",
    action: "Unlock TV",
  },
  unpair: {
    title: "Unpair this TV?",
    body: "The TV is unlocked the same way, then forgets this pairing. It stops taking commands from the dashboard until it's set up again.",
    action: "Unpair TV",
  },
  // A SMATO Ads TV has nothing locked; unpairing only unlinks it.
  unpairAds: {
    title: "Unpair this TV?",
    body: "The TV keeps playing the All-autos ads but is no longer linked to your dashboard. It shows its code again, so you can link it again with the same number.",
    action: "Unpair TV",
  },
  update: {
    title: "Update SMATO Ads on this TV?",
    body: "The TV downloads the newest SMATO Ads and shows Android's install screen. Someone at the TV presses Update on the remote; the ads pause for about a minute while it installs. If it's already up to date, nothing changes.",
    action: "Update app",
  },
  // Removes the TV from the dashboard altogether (its commands and pairing
  // go with it). A SMATO Ads TV keeps playing and shows its code again.
  delete: {
    title: "Delete this TV?",
    body: "It disappears from your dashboard, along with its command history and any ads sent only to this TV (All-autos ads aren't affected). The TV itself isn't changed: a SMATO Ads TV keeps playing the All-autos ads and shows its code again, so you can link it later.",
    action: "Delete TV",
  },
};

function Chip({ tone, children }) {
  const tones = {
    good: "bg-green/10 text-green",
    warn: "bg-amber/15 text-text",
    quiet: "bg-panel-2 text-text-dim",
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

// One TV on the admin's TVs page: its state as the TV last reported it,
// the controls, and the progress of the latest command.
export default function TvCard({ device, latest, secrets, ads = [], onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(null);
  const [pin, setPin] = useState("");
  const [pinStatus, setPinStatus] = useState("");

  const online = isOnline(device);
  const pending = isPending(latest);
  const stage = commandStage(latest, device);
  const unlocked = device.ads_mode === "unlocked";
  const adsApp = isAdsApp(device);
  const playlist = adsApp ? tvPlaylist(ads, device.auto_number) : [];
  const { playing, upNext } = playlistPosition(playlist, device.now_playing_title);

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const { error: deleteError } = await supabase.from("autos").delete().eq("id", device.id);
      if (deleteError) throw deleteError;
      onChange();
    } catch (err) {
      setError(err.message || "Couldn't delete that TV.");
      setBusy(false);
      setConfirming(null);
    }
  }

  async function run(command, payload) {
    setBusy(true);
    setError("");
    try {
      await sendCommand(supabase, device.auto_number, command, payload);
      onChange();
    } catch (err) {
      setError(err.message || "Couldn't send that to the TV.");
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  // Turn off / on screen: the same switch the tablets use (autos.screen_off).
  // The TV goes black and stops the ads within about 20 seconds.
  async function toggleScreen() {
    setBusy(true);
    setError("");
    try {
      await setAutoScreen(device.auto_number, !device.screen_off);
      onChange();
    } catch (err) {
      setError(err.message || "Couldn't change the screen.");
    } finally {
      setBusy(false);
    }
  }

  async function savePin(e) {
    e.preventDefault();
    if (!validPin(pin)) {
      setPinStatus("Use 4 to 8 digits.");
      return;
    }
    setPinStatus("Saving…");
    try {
      await saveRecoveryPin(supabase, device.auto_number, pin);
      setPin("");
      setPinStatus("Saved. The TV picks it up the next time it checks in.");
      onChange();
    } catch (err) {
      setPinStatus(err.message || "Couldn't save the PIN.");
    }
  }

  async function cancel() {
    try {
      await cancelCommand(supabase, latest);
      onChange();
    } catch (err) {
      setError(err.message || "Couldn't cancel that command.");
    }
  }

  const confirm = confirming && CONFIRM[confirming];

  return (
    <li className="flex min-w-0 flex-col gap-4 rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-mono text-lg font-semibold leading-none">{device.auto_number}</h2>
          <p className="mt-1.5 text-xs text-text-dim">
            {device.last_seen_at ? `Last online ${timeAgo(device.last_seen_at)}` : "Hasn't checked in yet"}
            {device.app_version ? `, app ${device.app_version}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone={online ? "good" : "quiet"}>{online ? "Online" : "Offline"}</Chip>
          {adsApp && device.screen_off && <Chip tone="warn">Screen off</Chip>}
          {!adsApp && device.ads_mode && (
            <Chip tone={unlocked ? "warn" : "good"}>{unlocked ? "Unlocked" : "Advertising"}</Chip>
          )}
        </div>
      </div>

      {adsApp ? (
        <>
          {device.screen_off ? (
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel-2 px-3 py-3">
              <p className="text-sm text-text-dim">
                The screen is off: the TV shows black and the ads are stopped. It stays on standby for your commands.
              </p>
              <button type="button" className={`${primaryClass} self-start`} disabled={busy} onClick={toggleScreen}>
                Turn on screen
              </button>
            </div>
          ) : (
            <Playlist
              ads={playlist}
              playing={playing}
              upNext={upNext}
              nowPlayingTitle={device.now_playing_title}
              tvName={device.auto_number}
              disabled={busy || pending}
              onPlay={(ad) => run("play", { ad_id: ad.id, title: ad.title })}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {!device.screen_off && (
              <>
                <button
                  type="button"
                  className={primaryClass}
                  disabled={busy || pending}
                  onClick={() => run("restart")}
                >
                  Restart ads
                </button>
                <button type="button" className={secondaryClass} disabled={busy} onClick={toggleScreen}>
                  Turn off screen
                </button>
              </>
            )}
            <button
              type="button"
              className={secondaryClass}
              disabled={busy || pending}
              onClick={() => setConfirming("update")}
            >
              Update app
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          {unlocked ? (
            <button type="button" className={primaryClass} disabled={busy || pending} onClick={() => run("lock")}>
              Start ads
            </button>
          ) : (
            <button
              type="button"
              className={primaryClass}
              disabled={busy || pending}
              onClick={() => setConfirming("unlock")}
            >
              Unlock TV
            </button>
          )}
          {!unlocked && (
            <button type="button" className={secondaryClass} disabled={busy || pending} onClick={() => run("restart")}>
              Restart ads
            </button>
          )}
          {unlocked && (
            <p className="self-center text-xs text-text-dim">
              Start ads reaches the TV next time SMATO is open on it.
            </p>
          )}
        </div>
      )}

      {!adsApp && !unlocked && (
        <p className="text-xs text-text-dim">
          Full-screen kiosk: starts on its own after a restart, Home and Back stay in SMATO.
          {device.device_owner === false && " This TV isn't a device owner, so it uses Android screen pinning."}
        </p>
      )}

      {stage && (
        <div className="rounded-xl bg-panel-2 px-3 py-2.5" aria-live="polite">
          <p className={`text-sm font-semibold ${STAGE_STYLES[stage.kind] || "text-text"}`}>
            {stage.text}
            {latest.completed_at && !pending ? `, ${timeAgo(latest.completed_at)}` : ""}
          </p>
          {latest.detail && (
            <p className="mt-1 whitespace-pre-line break-words text-xs leading-relaxed text-text-dim">{latest.detail}</p>
          )}
          {pending && (
            <button
              type="button"
              onClick={cancel}
              className="mt-1 min-h-9 text-xs font-semibold text-text-dim underline-offset-2 hover:underline"
            >
              Cancel this command
            </button>
          )}
        </div>
      )}

      {!adsApp && (
        <form onSubmit={savePin} className="flex flex-col gap-1.5">
          <label htmlFor={`pin-${device.id}`} className="text-xs text-text-faint">
            Recovery PIN for the remote&rsquo;s emergency menu {secrets?.pinSet ? "(set)" : "(not set)"}
          </label>
          <div className="flex gap-2">
            <input
              id={`pin-${device.id}`}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder={secrets?.pinSet ? "New PIN" : "4 to 8 digits"}
              className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 text-base text-text focus:border-teal focus:outline-none sm:text-sm"
            />
            <button type="submit" className={`${secondaryClass} min-h-10`}>
              Save PIN
            </button>
          </div>
          {pinStatus && <p className="text-xs text-text-dim">{pinStatus}</p>}
        </form>
      )}

      {error && (
        <p className="text-sm text-red" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-1 border-t border-line pt-2">
        <button
          type="button"
          disabled={busy || pending}
          onClick={() => setConfirming(adsApp ? "unpairAds" : "unpair")}
          className="min-h-10 rounded-full px-3 text-sm font-medium text-text-faint transition-colors hover:bg-red/10 hover:text-red disabled:cursor-not-allowed disabled:opacity-50"
        >
          Unpair
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming("delete")}
          className="min-h-10 rounded-full px-3 text-sm font-medium text-text-faint transition-colors hover:bg-red/10 hover:text-red disabled:cursor-not-allowed disabled:opacity-50"
        >
          Delete TV
        </button>
      </div>

      <Modal open={Boolean(confirm)} onClose={() => setConfirming(null)} title={confirm?.title || ""}>
        {confirm && (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed text-text-dim">{confirm.body}</p>
            {!online && (
              <p className="text-sm text-amber">
                {device.auto_number} is offline. The command waits and runs when the TV reconnects.
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={secondaryClass} onClick={() => setConfirming(null)}>
                Keep it as it is
              </button>
              <button
                type="button"
                className={primaryClass}
                disabled={busy}
                onClick={() =>
                  confirming === "delete" ? remove() : run(confirming === "unpairAds" ? "unpair" : confirming)
                }
              >
                {confirm.action}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </li>
  );
}

// A SMATO Ads TV's playlist in play order: what's on screen, what's next,
// and Play now to jump straight to any ad.
function Playlist({ ads, playing, upNext, nowPlayingTitle, tvName, disabled, onPlay }) {
  if (!ads.length) {
    return (
      <p className="rounded-xl border border-dashed border-line px-3 py-3 text-sm text-text-dim">
        No ads for this TV right now. Upload one for All autos or for {tvName} on the Ads page.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Playlist</h3>
        <span className="text-xs text-text-faint">
          {ads.length} {ads.length === 1 ? "ad" : "ads"}, in order. Change the order on the Ads page.
        </span>
      </div>
      {playing < 0 && nowPlayingTitle && (
        <p className="text-xs text-text-dim">
          On screen: <span className="font-semibold text-text">{nowPlayingTitle}</span>
        </p>
      )}
      <ol className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line">
        {ads.map((ad, i) => {
          const isPlaying = i === playing;
          const isNext = i === upNext;
          return (
            <li
              key={ad.id}
              className={`flex min-h-12 items-center gap-3 px-3 py-2 ${isPlaying ? "bg-green/[0.07]" : ""}`}
            >
              <span className="w-5 flex-none text-right font-mono text-xs text-text-faint">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm ${isPlaying ? "font-semibold text-text" : "text-text"}`}>{ad.title}</p>
                {(isPlaying || isNext) && (
                  <p className={`text-xs font-semibold ${isPlaying ? "text-green" : "text-teal"}`}>
                    {isPlaying ? "Playing now" : "Up next"}
                  </p>
                )}
              </div>
              {!isPlaying && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onPlay(ad)}
                  className="min-h-9 flex-none rounded-full border border-line px-3 text-xs font-semibold text-text transition-colors hover:border-text-faint disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Play now
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
