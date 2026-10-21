"use client";

import { useEffect, useState } from "react";

export default function DocumentUpload({
  id,
  label,
  file,
  existingUrl,
  required,
  error,
  onChange,
}) {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const imageUrl = previewUrl || existingUrl;
  const imageDescription = previewUrl ? `${label} preview` : `Current ${label}`;
  const ready = Boolean(file || existingUrl);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  // The native "Choose File / No file chosen" control is tiny and its text
  // runs off the edge on a phone. The real input stays (screen readers and
  // keyboards still land on it); this label is the thumb-sized target.
  const action = file ? "Change image" : existingUrl ? "Replace image" : "Choose image";

  return (
    <div
      className={`flex min-w-0 flex-col gap-2.5 rounded-xl border bg-panel-2 p-3.5 ${
        error ? "border-red" : "border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <label htmlFor={id} className="min-w-0 text-sm font-semibold text-text">
          {label}
        </label>
        <span
          className={`flex-none rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${
            ready ? "bg-green/10 text-green" : "bg-amber/15 text-[#8a5a00]"
          }`}
        >
          {ready ? "Ready" : "Missing"}
        </span>
      </div>
      {imageUrl && (
        <img
          className="aspect-[16/10] w-full rounded-lg border border-line object-cover"
          src={imageUrl}
          alt={imageDescription}
        />
      )}
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        onChange={(event) => onChange(event.target.files?.[0] || null)}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal ${
          ready
            ? "border border-line bg-panel text-text hover:border-text-faint"
            : "border border-dashed border-text-faint/60 bg-panel text-text hover:border-text-dim"
        }`}
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4 flex-none" fill="none" aria-hidden="true">
          <path
            d="M3 6.5A1.5 1.5 0 0 1 4.5 5h1.8l1.2-1.6h5l1.2 1.6h1.8A1.5 1.5 0 0 1 17 6.5v8A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <circle cx="10" cy="10.3" r="2.8" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        {action}
      </label>
      <p className="m-0 text-xs text-text-faint" id={hintId}>
        JPEG, PNG or WebP · max 5 MB
      </p>
      {error && (
        <p className="text-xs text-red" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
