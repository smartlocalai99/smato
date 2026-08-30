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
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-panel-2 p-3.5">
      <label htmlFor={id} className="text-sm font-semibold text-text">
        {label}
      </label>
      <p className="m-0 font-mono text-[0.68rem] tracking-wide text-text-faint" id={hintId}>
        JPEG, PNG or WebP · max 5 MB
      </p>
      {existingUrl && !file && (
        <span className="font-mono text-[0.68rem] tracking-wide text-teal">Replace image</span>
      )}
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        onChange={(event) => onChange(event.target.files?.[0] || null)}
        className="max-w-full text-[0.78rem] file:mr-2.5 file:rounded-full file:border file:border-line file:bg-panel file:px-3 file:py-1.5 file:font-medium file:text-text"
      />
      {imageUrl && (
        <img
          className="aspect-[16/10] w-full rounded-lg border border-line object-cover"
          src={imageUrl}
          alt={imageDescription}
        />
      )}
      {error && (
        <p className="text-xs text-red" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
