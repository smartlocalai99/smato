"use client";

import { useEffect, useRef } from "react";

// On a phone this is a bottom sheet: full width, rising from the bottom
// edge, never taller than the screen. On wider screens it's a centred
// dialog. Either way the header (title + close) stays put and only the body
// scrolls, so a long form can never push its own title off-screen. Escape
// and a backdrop tap both close it; background scroll is locked while open.
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-[modal-fade_0.18s_ease-out] motion-reduce:animate-none sm:items-center sm:p-6"
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
        className="console modal-sheet flex w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-line/60 bg-panel shadow-2xl outline-none animate-[sheet-up_0.3s_cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none motion-reduce:animate-none sm:rounded-3xl sm:animate-[modal-scale-in_0.22s_cubic-bezier(0.16,1,0.3,1)]"
      >
        <div className="flex flex-none items-center justify-between gap-4 border-b border-line px-5 py-3.5 sm:border-b-0 sm:px-8 sm:pb-2 sm:pt-7">
          <h2 id="modal-title" className="font-display text-xl font-semibold text-text">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-11 w-11 flex-none items-center justify-center rounded-full text-text-faint transition-colors hover:bg-panel-2 hover:text-text"
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
        <div className="modal-sheet__body min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 sm:px-8 sm:pt-4">
          {children}
        </div>
      </div>
    </div>
  );
}
