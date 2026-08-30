"use client";

import { useEffect, useRef } from "react";

// A native-feeling sheet: backdrop blur, soft shadow, scale-and-fade in.
// Escape and a backdrop click both close it; background scroll is locked
// while it's open, same as a system dialog.
export default function Modal({ open, onClose, title, children }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm animate-[modal-fade_0.18s_ease-out] motion-reduce:animate-none"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className="console my-8 w-full max-w-xl origin-center rounded-3xl border border-line/60 bg-panel p-6 shadow-2xl outline-none animate-[modal-scale-in_0.22s_cubic-bezier(0.16,1,0.3,1)] motion-reduce:animate-none sm:p-8"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <h2 id="modal-title" className="font-display text-xl font-semibold text-text">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1.5 rounded-full p-1.5 text-text-faint transition-colors hover:bg-panel-2 hover:text-text"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M4 4L14 14M14 4L4 14"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
