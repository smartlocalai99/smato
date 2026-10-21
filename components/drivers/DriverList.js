"use client";

import { useState } from "react";
import Link from "next/link";
import { filterDrivers } from "@/lib/drivers/validation";
import { paymentStatus } from "@/lib/drivers/payment";
import PhoneActions from "@/components/admin/PhoneActions";

const DOCUMENTS = [
  { key: "photo_path", label: "Photo" },
  { key: "driving_licence_image_path", label: "Driving Licence" },
  { key: "aadhaar_image_path", label: "Aadhaar" },
];

function DocumentStatus({ driver }) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label={`Document status for ${driver.name}`}>
      {DOCUMENTS.map((document) => {
        const present = Boolean(driver[document.key]);
        return (
          <span
            key={document.key}
            className={`whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[0.64rem] tracking-wide ${
              present ? "bg-green/10 text-green" : "bg-amber/10 text-amber"
            }`}
          >
            {document.label} {present ? "present" : "missing"}
          </span>
        );
      })}
    </div>
  );
}

function PaymentBadge({ driver }) {
  if (!driver.created_at) return null;
  const payment = paymentStatus(driver);
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[0.64rem] uppercase tracking-wide ${
        payment.isDue ? "bg-red/10 text-red" : "bg-green/10 text-green"
      }`}
    >
      {payment.isDue ? "payment due" : `paid · ${payment.daysRemaining}d left`}
    </span>
  );
}

export default function DriverList({ drivers = [], photoUrls = {}, onDelete }) {
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const matchingDrivers = filterDrivers(drivers, query);

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
      <div className="mb-4 flex justify-end">
        <label htmlFor="driver-search" className="w-full max-w-sm">
          <span className="sr-only">Search drivers</span>
          <input
            id="driver-search"
            type="search"
            role="searchbox"
            placeholder="Search name, mobile, plate, or licence"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-full border border-line bg-panel px-4 py-2.5 text-sm text-text placeholder:text-text-faint focus:border-teal focus:outline-none"
          />
        </label>
      </div>

      {matchingDrivers.length ? (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[54rem] border-collapse text-sm">
            <caption id="driver-directory-heading" className="sr-only">
              Registered drivers
            </caption>
            <thead>
              <tr className="bg-panel-2 text-left font-mono text-[0.66rem] uppercase tracking-wide text-text-faint">
                <th scope="col" className="px-4 py-3 font-medium">Driver</th>
                <th scope="col" className="px-4 py-3 font-medium">Mobile</th>
                <th scope="col" className="px-4 py-3 font-medium">Auto</th>
                <th scope="col" className="px-4 py-3 font-medium">Driving Licence</th>
                <th scope="col" className="px-4 py-3 font-medium">Aadhaar</th>
                <th scope="col" className="px-4 py-3 font-medium">Documents</th>
                <th scope="col" className="px-4 py-3 font-medium">Payment</th>
                <th scope="col" className="px-4 py-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {matchingDrivers.map((driver) => {
                const photoUrl = photoUrls[driver.photo_path];
                return (
                  <tr key={driver.id} className="border-t border-line hover:bg-panel-2/60">
                    <th scope="row" className="px-4 py-3 text-left font-semibold">
                      <Link
                        href={`/admin/drivers/${driver.id}`}
                        className="flex items-center gap-2.5 text-text"
                      >
                        {photoUrl ? (
                          <img
                            className="h-9 w-9 flex-none rounded-full border border-line object-cover"
                            src={photoUrl}
                            alt={`Photo of ${driver.name}`}
                          />
                        ) : (
                          <span
                            className="h-9 w-9 flex-none rounded-full border border-line bg-panel-2"
                            aria-hidden="true"
                          />
                        )}
                        <span>{driver.name}</span>
                      </Link>
                    </th>
                    <td className="px-4 py-3 text-text-dim">
                      <div className="flex flex-col gap-1.5">
                        {[driver.mobile, driver.alt_mobile].filter(Boolean).map((number) => (
                          <div key={number} className="flex items-center gap-2">
                            <span className="whitespace-nowrap">{number}</span>
                            <PhoneActions number={number} name={driver.name} />
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[0.8rem]">{driver.auto_number_plate}</td>
                    <td className="px-4 py-3 text-text-dim">{driver.driving_licence_number}</td>
                    <td className="px-4 py-3 text-text-dim">{driver.aadhaar_number}</td>
                    <td className="px-4 py-3">
                      <DocumentStatus driver={driver} />
                    </td>
                    <td className="px-4 py-3">
                      <PaymentBadge driver={driver} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          className="whitespace-nowrap rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold transition-colors hover:border-text-faint"
                          href={`/admin/drivers/${driver.id}/edit`}
                          aria-label={`Edit ${driver.name}`}
                        >
                          Edit
                        </Link>
                        {onDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(driver)}
                            disabled={deletingId === driver.id}
                            aria-label={`Delete ${driver.name}`}
                            className="whitespace-nowrap rounded-full border border-red/35 px-3.5 py-1.5 text-xs font-semibold text-red transition-colors hover:border-red disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingId === driver.id ? "Deleting…" : "Delete"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-text-dim">
          No drivers match your search.
        </p>
      )}
    </section>
  );
}
