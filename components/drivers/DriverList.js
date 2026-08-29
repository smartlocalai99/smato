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
    <div className="driver-document-status" aria-label={`Document status for ${driver.name}`}>
      {DOCUMENTS.map((document) => {
        const present = Boolean(driver[document.key]);
        return (
          <span
            className={`driver-document-status__item${present ? " is-present" : ""}`}
            key={document.key}
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
    <section className="driver-directory" aria-labelledby="driver-directory-heading">
      <div className="driver-directory__tools">
        <label className="driver-directory__search" htmlFor="driver-search">
          <span>Search drivers</span>
          <input
            id="driver-search"
            type="search"
            role="searchbox"
            placeholder="Name, mobile, plate, or licence"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      {matchingDrivers.length ? (
        <div className="driver-table-wrap">
          <table className="driver-table">
            <caption id="driver-directory-heading">Registered drivers</caption>
            <thead>
              <tr>
                <th scope="col">Driver</th>
                <th scope="col">Mobile</th>
                <th scope="col">Auto</th>
                <th scope="col">Driving Licence</th>
                <th scope="col">Aadhaar</th>
                <th scope="col">Documents</th>
                <th scope="col" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {matchingDrivers.map((driver) => {
                const photoUrl = photoUrls[driver.photo_path];
                return (
                  <tr key={driver.id}>
                    <th className="driver-table__driver" scope="row" data-label="Driver">
                      {photoUrl ? (
                        <img className="driver-table__photo" src={photoUrl} alt={`Photo of ${driver.name}`} />
                      ) : (
                        <span className="driver-table__photo-placeholder" aria-hidden="true" />
                      )}
                      <span>{driver.name}</span>
                    </th>
                    <td data-label="Mobile">{driver.mobile}</td>
                    <td className="driver-table__plate" data-label="Auto">{driver.auto_number_plate}</td>
                    <td data-label="Driving Licence">{maskLicence(driver.driving_licence_number)}</td>
                    <td data-label="Aadhaar">{maskAadhaar(driver.aadhaar_number)}</td>
                    <td data-label="Documents"><DocumentStatus driver={driver} /></td>
                    <td className="driver-table__action" data-label="">
                      <Link className="btn btn--ghost" href={`/admin/drivers/${driver.id}/edit`} aria-label={`Edit ${driver.name}`}>
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
        <p className="empty-state">No drivers match your search.</p>
      )}
    </section>
  );
}
