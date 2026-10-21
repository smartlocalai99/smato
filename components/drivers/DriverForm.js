"use client";

import { useState } from "react";
import DocumentUpload from "@/components/drivers/DocumentUpload";
import {
  normalizeDriverFields,
  validateDriverFields,
  validateDriverFile,
} from "@/lib/drivers/validation";

const DOCUMENTS = [
  { key: "photo", label: "Driver photo" },
  { key: "drivingLicence", label: "Driving Licence image" },
  { key: "aadhaar", label: "Aadhaar image" },
];

// Sentinel <option> value for "the auto isn't in the list yet".
const NEW_AUTO = "__new__";

const labelClass = "font-mono text-xs tracking-wide text-text-dim";

function fieldId(key) {
  return `driver-${key}`;
}

function controlClass(error) {
  return `min-h-11 w-full min-w-0 rounded-xl border bg-ink px-3.5 py-2.5 text-base text-text transition-colors focus:outline-none ${
    error ? "border-red" : "border-line focus:border-teal"
  }`;
}

function FieldError({ id, error }) {
  if (!error) return null;
  return (
    <p className="text-xs text-red" id={id} role="alert">
      {error}
    </p>
  );
}

function TextField({
  field,
  label,
  value,
  error,
  onChange,
  required = true,
  type = "text",
  inputMode,
  autoComplete,
  autoCapitalize,
}) {
  const id = fieldId(field);
  const errorId = `${id}-error`;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        required={required}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={controlClass(error)}
      />
      <FieldError id={errorId} error={error} />
    </div>
  );
}

// Which auto this driver drives. A dropdown of every auto in the fleet;
// autos another driver already has are shown but can't be picked (one
// driver per auto). "Add a new auto number" swaps in a text box for an auto
// that isn't in the fleet yet — saving the driver creates it.
function AutoPicker({ autos, value, onChange, error, currentDriverId }) {
  const known = autos.some((auto) => auto.auto_number === value);
  // The fleet list arrives after the form opens, so "no autos yet" is
  // derived each render; only an explicit "add a new one" is remembered.
  const [wantsNew, setWantsNew] = useState(false);
  const typing = wantsNew || autos.length === 0;
  const errorId = `${fieldId("auto_number_plate")}-error`;
  const hintId = `${fieldId("auto_number_plate")}-hint`;

  // Editing a driver whose auto isn't in the fleet list (say it was
  // removed): keep it as an option so the form doesn't silently clear it.
  const options = value && !known && !typing ? [...autos, { auto_number: value, driver: null }] : autos;

  if (typing) {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={fieldId("auto_number_plate")} className={labelClass}>
            Auto number
          </label>
          {autos.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setWantsNew(false);
                onChange("");
              }}
              className="text-xs font-semibold text-teal"
            >
              Pick from the list
            </button>
          )}
        </div>
        <input
          id={fieldId("auto_number_plate")}
          type="text"
          autoCapitalize="characters"
          placeholder="AUTO-07"
          required
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : hintId}
          onChange={(event) => onChange(event.target.value)}
          className={controlClass(error)}
        />
        {!error && (
          <p className="text-xs text-text-faint" id={hintId}>
            A new auto is added to the fleet when you save.
          </p>
        )}
        <FieldError id={errorId} error={error} />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={fieldId("auto_number_plate")} className={labelClass}>
        Auto
      </label>
      <div className="relative">
        <select
          id={fieldId("auto_number_plate")}
          required
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : hintId}
          onChange={(event) => {
            if (event.target.value === NEW_AUTO) {
              setWantsNew(true);
              onChange("");
            } else {
              onChange(event.target.value);
            }
          }}
          className={`${controlClass(error)} appearance-none pr-10`}
        >
          <option value="" disabled>
            Choose an auto
          </option>
          {options.map((auto) => {
            const takenBy = auto.driver && auto.driver.id !== currentDriverId ? auto.driver.name : null;
            return (
              <option key={auto.auto_number} value={auto.auto_number} disabled={Boolean(takenBy)}>
                {takenBy ? `${auto.auto_number} — ${takenBy}` : auto.auto_number}
              </option>
            );
          })}
          <option value={NEW_AUTO}>+ Add a new auto number</option>
        </select>
        <svg
          viewBox="0 0 20 20"
          className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dim"
          fill="none"
          aria-hidden="true"
        >
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {!error && (
        <p className="text-xs text-text-faint" id={hintId}>
          Autos that already have a driver are greyed out.
        </p>
      )}
      <FieldError id={errorId} error={error} />
    </div>
  );
}

export default function DriverForm({
  mode,
  initialValues = {},
  existingUrls = {},
  onSubmit,
  onCancel,
  busy,
  status,
  // Every auto in the fleet with its current driver, from driverApi.listAutos().
  autos = [],
  // Inside a Modal, the modal itself is already the card — a nested card
  // here would just double up the border/shadow/padding around it.
  embedded = false,
}) {
  const registration = mode === "register";
  const [values, setValues] = useState(() => ({
    name: initialValues.name || "",
    mobile: initialValues.mobile || "",
    alt_mobile: initialValues.alt_mobile || "",
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
      const error = validateDriverFile(files[document.key], document.label);
      if (error) nextErrors[document.key] = error;
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

  const field = (key) => ({
    field: key,
    value: values[key],
    error: errors[key],
    onChange: (value) => updateValue(key, value),
  });

  return (
    <form
      className={
        embedded
          ? "flex flex-col gap-6"
          : "flex flex-col gap-6 rounded-2xl border border-line bg-panel p-5 shadow-sm sm:p-8"
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextField {...field("name")} label="Name" autoComplete="name" />
        </div>
        <TextField {...field("mobile")} label="Mobile number" type="tel" inputMode="numeric" autoComplete="tel" />
        <TextField
          {...field("alt_mobile")}
          label="Second mobile (optional)"
          type="tel"
          inputMode="numeric"
          required={false}
        />
        <div className="sm:col-span-2">
          <AutoPicker
            autos={autos}
            value={values.auto_number_plate}
            onChange={(value) => updateValue("auto_number_plate", value)}
            error={errors.auto_number_plate}
            currentDriverId={initialValues.id}
          />
        </div>
        <TextField {...field("driving_licence_number")} label="Driving Licence number" autoCapitalize="characters" />
        <TextField {...field("aadhaar_number")} label="Aadhaar number" inputMode="numeric" />
      </div>

      <section className="border-t border-line pt-5" aria-labelledby="driver-documents-heading">
        <h2 id="driver-documents-heading" className="font-display text-base font-semibold">
          Documents
        </h2>
        <p className="mb-4 mt-1 text-sm text-text-dim">
          Optional — add them now or later from Edit.
        </p>
        <div className="grid gap-3">
          {DOCUMENTS.map((document) => (
            <DocumentUpload
              key={document.key}
              id={fieldId(document.key)}
              label={document.label}
              file={files[document.key]}
              existingUrl={existingUrls[document.key]}
              error={errors[document.key]}
              onChange={(file) => updateFile(document.key, file)}
            />
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-2.5 border-t border-line pt-5 sm:flex-row sm:items-center sm:gap-3">
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-amber px-5 py-3 font-semibold text-on-amber transition-all hover:bg-[#ffc250] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-2.5"
        >
          {busy ? "Saving…" : registration ? "Register driver" : "Save changes"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="w-full rounded-full border border-line px-5 py-3 font-semibold text-text transition-all hover:border-text-faint active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-2.5"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
