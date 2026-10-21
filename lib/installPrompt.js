// Chrome/Edge/Samsung Internet fire `beforeinstallprompt` once, early, when
// the page qualifies as installable — often before any React component has
// mounted. Catch it at module load and hold on to it so the "Install app"
// button can trigger the real install dialog whenever it's tapped.
let deferredPrompt = null;
let installed = false;
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // our button replaces Chrome's own mini-infobar
    deferredPrompt = event;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

export function subscribeInstall(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function canPromptInstall() {
  return Boolean(deferredPrompt);
}

// Already running from the home screen (or just installed): nothing to offer.
export function isRunningInstalled() {
  if (installed) return true;
  if (typeof window === "undefined") return false;
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone
  );
}

export function isIos() {
  if (typeof navigator === "undefined") return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac; the touch screen gives it away.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

// Shows the browser's install dialog. Resolves true if the person accepted;
// false if they dismissed it or there was no dialog to show.
export async function promptInstall() {
  const event = deferredPrompt;
  if (!event) return false;
  deferredPrompt = null; // a prompt event can only be used once
  notify();
  event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === "accepted";
}
