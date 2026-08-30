"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import DriverList from "@/components/drivers/DriverList";
import { driverApi } from "@/lib/drivers/api";

export default function DriversPage() {
  const searchParams = useSearchParams();
  const [directory, setDirectory] = useState({ loading: true, drivers: [], photoUrls: {}, error: "" });

  const loadDirectory = useCallback(async () => {
    setDirectory({ loading: true, drivers: [], photoUrls: {}, error: "" });
    try {
      const drivers = await driverApi.list();
      const photoPaths = drivers.map((driver) => driver.photo_path).filter(Boolean);
      const photoUrls = photoPaths.length ? await driverApi.sign(photoPaths) : {};
      setDirectory({ loading: false, drivers, photoUrls, error: "" });
    } catch {
      setDirectory({ loading: false, drivers: [], photoUrls: {}, error: "Couldn't load drivers." });
    }
  }, []);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  const cleanupWarning = searchParams.get("updated") === "1" && searchParams.get("cleanup") === "1"
    ? "Driver saved, but old document cleanup needs attention."
    : "";
  const successMessage = cleanupWarning
    ? ""
    : searchParams.get("created") === "1"
    ? "Driver registered."
    : searchParams.get("updated") === "1"
      ? "Driver updated."
      : "";

  return (
    <main className="driver-page">
      <header className="driver-page__header">
        <div>
          <h1>Drivers</h1>
          <p>Search registered drivers and manage their records.</p>
        </div>
        <Link className="btn btn--primary" href="/admin/drivers/new">Register a driver</Link>
      </header>

      {cleanupWarning && <p className="driver-page__banner" role="alert">{cleanupWarning}</p>}
      {successMessage && <p className="driver-page__banner" role="status">{successMessage}</p>}

      {directory.loading ? (
        <p className="driver-page__state" role="status">Loading drivers…</p>
      ) : directory.error ? (
        <div className="driver-page__state" role="alert">
          <p>{directory.error}</p>
          <button className="btn" type="button" onClick={loadDirectory}>Try again</button>
        </div>
      ) : directory.drivers.length ? (
        <DriverList drivers={directory.drivers} photoUrls={directory.photoUrls} />
      ) : (
        <section className="empty-state" aria-label="No drivers registered">
          <p>No drivers have been registered yet.</p>
          <Link href="/admin/drivers/new">Register a driver</Link>
        </section>
      )}
    </main>
  );
}
