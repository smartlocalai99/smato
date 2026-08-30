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
    <div className="document-upload">
      <label htmlFor={id}>{label}</label>
      <p className="document-upload__guidance" id={hintId}>
        JPEG, PNG or WebP · max 5 MB
      </p>
      {existingUrl && !file && <span className="document-upload__replace">Replace image</span>}
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        onChange={(event) => onChange(event.target.files?.[0] || null)}
      />
      {imageUrl && <img className="document-upload__preview" src={imageUrl} alt={imageDescription} />}
      {error && (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
