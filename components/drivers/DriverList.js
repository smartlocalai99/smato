"use client";

import { useState } from "react";
import Link from "next/link";
import { filterDrivers, maskAadhaar, maskLicence } from "@/lib/drivers/validation";

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

export default function DriverList({ drivers = [], photoUrls = {} }) {
  const [query, setQuery] = useState("");
  const matchingDrivers = filterDrivers(drivers, query);

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
            className="w-full rounded-full border border-line bg-panel px-4 py-2.5 text-sm text-text placeholder:text-text-faint focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
          />
        </label>
      </div>

      {matchingDrivers.length ? (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[42rem] border-collapse text-sm">
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
                <th scope="col" className="px-4 py-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {matchingDrivers.map((driver) => {
                const photoUrl = photoUrls[driver.photo_path];
                return (
                  <tr key={driver.id} className="border-t border-line hover:bg-panel-2/60">
                    <th scope="row" className="px-4 py-3 text-left font-semibold">
                      <div className="flex items-center gap-2.5">
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
                      </div>
                    </th>
                    <td className="px-4 py-3 text-text-dim">{driver.mobile}</td>
                    <td className="px-4 py-3 font-mono text-[0.8rem]">{driver.auto_number_plate}</td>
                    <td className="px-4 py-3 text-text-dim">{maskLicence(driver.driving_licence_number)}</td>
                    <td className="px-4 py-3 text-text-dim">{maskAadhaar(driver.aadhaar_number)}</td>
                    <td className="px-4 py-3">
                      <DocumentStatus driver={driver} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        className="whitespace-nowrap rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold transition-colors hover:border-text-faint"
                        href={`/admin/drivers/${driver.id}/edit`}
                        aria-label={`Edit ${driver.name}`}
                      >
                        Edit
                      </Link>
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
