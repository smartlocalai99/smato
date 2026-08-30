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
  { key: "auto_number_plate", label: "Auto number plate", type: "text" },
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
  busy,
  status,
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
    <form className="driver-form" noValidate onSubmit={handleSubmit}>
      {status && <p className="driver-form__status" role="alert">{status}</p>}

      <div className="driver-form__fields">
        {FIELDS.map((field) => {
          const id = fieldId(field.key);
          const error = errors[field.key];
          const errorId = `${id}-error`;
          return (
            <div className="field" key={field.key}>
              <label htmlFor={id}>{field.label}</label>
              <input
                id={id}
                type={field.type}
                inputMode={field.inputMode}
                autoComplete={field.autoComplete}
                required
                value={values[field.key]}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => updateValue(field.key, event.target.value)}
              />
              {error && <p className="field-error" id={errorId} role="alert">{error}</p>}
            </div>
          );
        })}
      </div>

      <section className="driver-form__documents" aria-labelledby="driver-documents-heading">
        <h2 id="driver-documents-heading">Documents</h2>
        <div className="driver-form__uploads">
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

      <section className="document-status" aria-label="Document status">
        {DOCUMENTS.map((document) => {
          const ready = Boolean(files[document.key] || existingUrls[document.key]);
          return (
            <div className="document-status__item" key={document.key}>
              <span>{document.label}</span>
              <strong>{ready ? "Ready" : "Missing"}</strong>
            </div>
          );
        })}
      </section>

      <button className="btn btn--primary" type="submit" disabled={busy}>
        {busy ? "Saving…" : registration ? "Register driver" : "Save changes"}
      </button>
    </form>
  );
}
