"use client";

import { useState } from "react";
import DocumentUpload from "@/components/drivers/DocumentUpload";
import {
  normalizeDriverFields,
  validateDriverFields,
  validateDriverFile,
} from "@/lib/drivers/validation";

const FIELDS = [
  { key: "name", label: "Name", type: "text", autoComplete: "name" },
  { key: "mobile", label: "Mobile number", type: "tel", inputMode: "numeric", autoComplete: "tel" },
  { key: "auto_number_plate", label: "Auto number plate", type: "text", list: "known-autos" },
  { key: "driving_licence_number", label: "Driving Licence number", type: "text" },
  { key: "aadhaar_number", label: "Aadhaar number", type: "text", inputMode: "numeric" },
];

const DOCUMENTS = [
  { key: "photo", label: "Driver photo" },
  { key: "drivingLicence", label: "Driving Licence image" },
  { key: "aadhaar", label: "Aadhaar image" },
];

function fieldId(key) {
  return `driver-${key}`;
}

export default function DriverForm({
  mode,
  initialValues = {},
  existingUrls = {},
  onSubmit,
  onCancel,
  busy,
  status,
  // Known tablets to attach this driver to — shown as pick-from suggestions
  // on the auto number field so linking a driver to a tablet is explicit,
  // not just something that happens to fall out of a matching plate number.
  autos = [],
  // Inside a Modal, the modal itself is already the card — a nested card
  // here would just double up the border/shadow/padding around it.
  embedded = false,
}) {
  const registration = mode === "register";
  const [values, setValues] = useState(() => ({
    name: initialValues.name || "",
    mobile: initialValues.mobile || "",
    auto_number_plate: initialValues.auto_number_plate || "",
    driving_licence_number: initialValues.driving_licence_number || "",
    aadhaar_number: initialValues.aadhaar_number || "",
  }));
  const [files, setFiles] = useState({});
  const [errors, setErrors] = useState({});

  function updateValue(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function updateFile(key, file) {
    setFiles((current) => ({ ...current, [key]: file }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validate() {
    const nextErrors = { ...validateDriverFields(values) };
    for (const document of DOCUMENTS) {
      const file = files[document.key];
      if (registration || file) {
        const error = validateDriverFile(file, document.label);
        if (error) nextErrors[document.key] = error;
      }
    }
    return nextErrors;
  }

  function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    onSubmit({ values: normalizeDriverFields(values), files });
  }

  return (
    <form
      className={
        embedded
          ? "flex flex-col gap-6"
          : "flex flex-col gap-6 rounded-2xl border border-line bg-panel p-6 shadow-sm sm:p-8"
      }
      noValidate
      onSubmit={handleSubmit}
    >
      {status && (
        <p
          className="rounded-xl border border-red/25 bg-red/[0.06] px-4 py-3 text-sm text-red"
          role="alert"
        >
          {status}
        </p>
      )}

      <datalist id="known-autos">
        {autos.map((auto) => (
          <option key={auto.auto_number} value={auto.auto_number} />
        ))}
      </datalist>

      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => {
          const id = fieldId(field.key);
          const error = errors[field.key];
          const errorId = `${id}-error`;
          return (
            <div className="flex flex-col gap-1.5" key={field.key}>
              <label htmlFor={id} className="font-mono text-xs tracking-wide text-text-dim">
                {field.label}
              </label>
              <input
                id={id}
                type={field.type}
                inputMode={field.inputMode}
                autoComplete={field.autoComplete}
                list={field.list}
                required
                value={values[field.key]}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : field.key === "auto_number_plate" ? `${id}-hint` : undefined}
                onChange={(event) => updateValue(field.key, event.target.value)}
                className={`rounded-xl border bg-ink px-3.5 py-2.5 text-text transition-colors focus:outline-none ${
                  error ? "border-red" : "border-line focus:border-teal"
                }`}
              />
              {field.key === "auto_number_plate" && !error && (
                <p className="text-xs text-text-faint" id={`${id}-hint`}>
                  This is what links the driver to their tablet — pick a checked-in auto below, or type a new number.
                </p>
              )}
              {error && (
                <p className="text-xs text-red" id={errorId} role="alert">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <section className="border-t border-line pt-6" aria-labelledby="driver-documents-heading">
        <h2 id="driver-documents-heading" className="mb-4 font-display text-base font-semibold">
          Documents
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {DOCUMENTS.map((document) => (
            <DocumentUpload
              key={document.key}
              id={fieldId(document.key)}
              label={document.label}
              file={files[document.key]}
              existingUrl={existingUrls[document.key]}
              required={registration}
              error={errors[document.key]}
              onChange={(file) => updateFile(document.key, file)}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-2 border-t border-line pt-5 sm:grid-cols-3" aria-label="Document status">
        {DOCUMENTS.map((document) => {
          const ready = Boolean(files[document.key] || existingUrls[document.key]);
          return (
            <div
              key={document.key}
              className={`flex flex-col gap-0.5 rounded-xl border px-3 py-2 font-mono text-[0.68rem] leading-relaxed ${
                ready
                  ? "border-green/30 bg-green/[0.07] text-green"
                  : "border-amber/30 bg-amber/[0.07] text-amber"
              }`}
            >
              <span className="text-text-dim">{document.label}</span>
              <strong className={ready ? "text-green" : "text-amber"}>
                {ready ? "Ready" : "Missing"}
              </strong>
            </div>
          );
        })}
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-amber px-5 py-2.5 font-semibold text-on-amber transition-all hover:bg-[#ffc250] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Saving…" : registration ? "Register driver" : "Save changes"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-line px-5 py-2.5 font-semibold text-text transition-all hover:border-text-faint active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
