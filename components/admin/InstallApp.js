"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/admin/Modal";
import {
  canPromptInstall,
  isIos,
  isRunningInstalled,
  promptInstall,
  subscribeInstall,
} from "@/lib/installPrompt";

// "Install app" in the admin header. Where the browser offers a real install
// dialog (Chrome, Edge, Samsung Internet on Android) the button opens it
// directly; iPhone Safari has no such dialog, so the button explains the
// two taps instead. Hidden once smato is already running from the home screen.
export default function InstallApp() {
  const [state, setState] = useState({ ready: false, installed: false });
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const sync = () => setState({ ready: true, installed: isRunningInstalled() });
    sync();
    // An installable page needs a service worker; the same one the player
    // uses (it leaves /admin requests alone, so the console stays live).
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
    return subscribeInstall(sync);
  }, []);

  if (!state.ready || state.installed) return null;

  async function handleClick() {
    if (canPromptInstall()) {
      await promptInstall();
      return;
    }
    setHelpOpen(true);
  }

  const ios = isIos();

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-panel px-3 py-1.5 text-sm font-semibold text-text hover:border-text-faint"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4 flex-none" fill="none" aria-hidden="true">
          <rect x="5.5" y="2" width="9" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 6.5v6m0 0-2.5-2.5M10 12.5l2.5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Install<span className="hidden sm:inline"> app</span>
      </button>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Add smato to your home screen">
        <p className="text-text-dim">
          smato opens from its own icon, full screen, without the browser bar.
        </p>
        <ol className="mt-5 flex flex-col gap-4">
          {(ios
            ? [
                <>Open this page in <strong className="text-text">Safari</strong>.</>,
                <>
                  Tap the <strong className="text-text">Share</strong> button
                  <ShareIcon /> at the bottom of the screen.
                </>,
                <>Scroll down and tap <strong className="text-text">Add to Home Screen</strong>, then <strong className="text-text">Add</strong>.</>,
              ]
            : [
                <>Open this page in <strong className="text-text">Chrome</strong>.</>,
                <>
                  Tap the <strong className="text-text">menu</strong>
                  <MenuIcon /> at the top right.
                </>,
                <>Tap <strong className="text-text">Add to Home screen</strong> or <strong className="text-text">Install app</strong>, then confirm.</>,
              ]
          ).map((step, index) => (
            <li key={index} className="flex gap-3">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-amber font-display text-sm font-semibold text-on-amber">
                {index + 1}
              </span>
              <span className="pt-0.5 leading-relaxed text-text-dim">{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-6 rounded-xl border border-line bg-panel-2 px-4 py-3 text-sm leading-relaxed text-text-dim">
          Already have a smato icon that opens the player screen? Press and hold it, remove it,
          then add smato again from this page.
        </p>
        <button
          type="button"
          onClick={() => setHelpOpen(false)}
          className="mt-6 w-full rounded-full border border-line px-5 py-3 font-semibold text-text hover:border-text-faint sm:w-auto sm:py-2.5"
        >
          Done
        </button>
      </Modal>
    </>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 20 20" className="mx-1 inline h-4 w-4 align-[-2px] text-teal" fill="none" aria-hidden="true">
      <path d="M10 2.5v10M10 2.5 6.5 6M10 2.5 13.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 8.5H5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 5 17.5h10a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 15 8.5h-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 20 20" className="mx-1 inline h-4 w-4 align-[-2px] text-teal" fill="currentColor" aria-hidden="true">
      <circle cx="10" cy="4.5" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="10" cy="15.5" r="1.6" />
    </svg>
  );
}
