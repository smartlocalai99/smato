"use client";

import { useState } from "react";
import Link from "next/link";
import { filterDrivers } from "@/lib/drivers/validation";
import { paymentStatus } from "@/lib/drivers/payment";
import PhoneActions from "@/components/admin/PhoneActions";

const DOCUMENTS = [
  { key: "photo_path", label: "Photo" },
  { key: "driving_licence_image_path", label: "Licence" },
  { key: "aadhaar_image_path", label: "Aadhaar" },
];

// 123456789012 → "1234 5678 9012", the way it's printed on the card.
function formatAadhaar(value) {
  return String(value || "").replace(/(\d{4})(?=\d)/g, "$1 ");
}

function initials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function Avatar({ name, url }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="h-11 w-11 flex-none rounded-full border border-line object-cover"
        src={url}
        alt={`Photo of ${name}`}
      />
    );
  }
  return (
    <span
      className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-line bg-panel-2 font-display text-sm font-semibold text-text-dim"
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

function DocumentStatus({ driver }) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label={`Documents for ${driver.name}`}>
      {DOCUMENTS.map((document) => {
        const present = Boolean(driver[document.key]);
        return (
          <span
            key={document.key}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
              present ? "bg-green/10 text-green" : "bg-panel-2 text-text-faint"
            }`}
          >
            <svg viewBox="0 0 16 16" className="h-3 w-3 flex-none" fill="none" aria-hidden="true">
              {present ? (
                <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M4 8h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
            {document.label}
            <span className="sr-only">{present ? " added" : " not added"}</span>
          </span>
        );
      })}
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-3 py-2.5">
      <dt className="pt-0.5 text-xs text-text-faint">{label}</dt>
      <dd className="min-w-0 text-sm text-text">{children}</dd>
    </div>
  );
}

function DriverCard({ driver, photoUrl, open, onToggle, onDelete, deleting }) {
  const payment = driver.created_at ? paymentStatus(driver) : null;
  const panelId = `driver-panel-${driver.id}`;
  const numbers = [driver.mobile, driver.alt_mobile].filter(Boolean);

  return (
    <li className={`rounded-2xl border bg-panel transition-colors ${open ? "border-text-faint/50" : "border-line"}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 rounded-2xl p-3.5 text-left sm:p-4"
      >
        <Avatar name={driver.name} url={photoUrl} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-semibold text-text">{driver.name}</span>
          <span className="flex min-w-0 items-center gap-2 text-sm text-text-dim">
            <span className="flex-none rounded-md bg-panel-2 px-1.5 py-0.5 font-mono text-[0.72rem] text-text">
              {driver.auto_number_plate}
            </span>
            <span className="truncate">{driver.mobile}</span>
          </span>
        </span>
        {payment && (
          <span
            className={`flex-none rounded-full px-2.5 py-1 text-xs font-semibold ${
              payment.isDue ? "bg-red/10 text-red" : "bg-green/10 text-green"
            }`}
          >
            {payment.isDue ? "Due" : "Paid"}
          </span>
        )}
        <svg
          viewBox="0 0 20 20"
          className={`h-5 w-5 flex-none text-text-faint transition-transform duration-200 motion-reduce:transition-none ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          aria-hidden="true"
        >
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div id={panelId} className="border-t border-line px-3.5 pb-3.5 sm:px-4 sm:pb-4">
          <dl className="divide-y divide-line">
            <DetailRow label={numbers.length > 1 ? "Phones" : "Phone"}>
              <div className="flex flex-col gap-2">
                {numbers.map((number) => (
                  <div key={number} className="flex items-center justify-between gap-3">
                    <span>{number}</span>
                    <PhoneActions number={number} name={driver.name} />
                  </div>
                ))}
              </div>
            </DetailRow>
            <DetailRow label="Licence">
              <span className="break-all font-mono text-[0.82rem]">{driver.driving_licence_number}</span>
            </DetailRow>
            <DetailRow label="Aadhaar">
              <span className="font-mono text-[0.82rem]">{formatAadhaar(driver.aadhaar_number)}</span>
            </DetailRow>
            <DetailRow label="Documents">
              <DocumentStatus driver={driver} />
            </DetailRow>
            {payment && (
              <DetailRow label="Payment">
                <span className={payment.isDue ? "text-red" : "text-text"}>
                  {payment.isDue
                    ? `Due — ${Math.abs(payment.daysRemaining)} day(s) overdue`
                    : `Paid — next due in ${payment.daysRemaining} day(s)`}
                </span>
              </DetailRow>
            )}
          </dl>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Link
              href={`/admin/drivers/${driver.id}`}
              aria-label={`View ${driver.name}`}
              className="flex min-h-11 items-center justify-center rounded-full bg-amber px-3 text-sm font-semibold text-on-amber transition-colors hover:bg-[#ffc250]"
            >
              View
            </Link>
            <Link
              href={`/admin/drivers/${driver.id}/edit`}
              aria-label={`Edit ${driver.name}`}
              className="flex min-h-11 items-center justify-center rounded-full border border-line px-3 text-sm font-semibold text-text transition-colors hover:border-text-faint"
            >
              Edit
            </Link>
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(driver)}
                disabled={deleting}
                aria-label={`Delete ${driver.name}`}
                className="flex min-h-11 items-center justify-center rounded-full border border-red/35 px-3 text-sm font-semibold text-red transition-colors hover:border-red disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

// The driver directory as a list of collapsible cards — the summary row
// (photo, name, auto, mobile, paid/due) fits a phone screen, and a tap
// opens the rest: both numbers with call/WhatsApp, IDs, documents, payment
// and actions. Same layout at every width; nothing scrolls sideways.
export default function DriverList({ drivers = [], photoUrls = {}, onDelete }) {
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState(() => new Set());
  const [deletingId, setDeletingId] = useState(null);
  const matchingDrivers = filterDrivers(drivers, query);

  function toggle(id) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(driver) {
    if (!confirm(`Delete ${driver.name}? This removes their record and documents for good.`)) return;
    setDeletingId(driver.id);
    try {
      await onDelete(driver);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section aria-labelledby="driver-directory-heading">
      <h2 id="driver-directory-heading" className="sr-only">
        Registered drivers
      </h2>
      <label htmlFor="driver-search" className="mb-4 block sm:max-w-sm">
        <span className="sr-only">Search drivers</span>
        <input
          id="driver-search"
          type="search"
          role="searchbox"
          placeholder="Search name, mobile, auto or licence"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-h-11 w-full rounded-full border border-line bg-panel px-4 py-2.5 text-base text-text placeholder:text-text-faint focus:border-teal focus:outline-none sm:text-sm"
        />
      </label>

      {matchingDrivers.length ? (
        <ul className="flex flex-col gap-2.5">
          {matchingDrivers.map((driver) => (
            <DriverCard
              key={driver.id}
              driver={driver}
              photoUrl={photoUrls[driver.photo_path]}
              open={openIds.has(driver.id)}
              onToggle={() => toggle(driver.id)}
              onDelete={onDelete ? handleDelete : undefined}
              deleting={deletingId === driver.id}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-text-dim">
          No drivers match your search.
        </p>
      )}
    </section>
  );
}
