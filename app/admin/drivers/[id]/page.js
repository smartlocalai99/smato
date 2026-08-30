"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { driverApi } from "@/lib/drivers/api";
import { maskAadhaar, maskLicence } from "@/lib/drivers/validation";
import { PAYMENT_AMOUNT, paymentStatus } from "@/lib/drivers/payment";
import { supabase } from "@/lib/supabase";
import { STATUS_STYLES, autoStatus, timeAgo, useAutoAddress } from "@/lib/autoStatus";

function DocumentTile({ label, url }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel-2">
      {url ? (
        <img src={url} alt={label} className="aspect-[16/10] w-full object-cover" />
      ) : (
        <div className="flex aspect-[16/10] items-center justify-center text-xs text-text-faint">
          No image
        </div>
      )}
      <div className="px-3 py-2 text-xs font-semibold">{label}</div>
    </div>
  );
}

function LinkedAuto({ autoNumber }) {
  const [auto, setAuto] = useState(undefined); // undefined = loading, null = no match

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("autos")
      .select("*")
      .eq("auto_number", autoNumber)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setAuto(data || null);
      });
    return () => {
      cancelled = true;
    };
  }, [autoNumber]);

  const s = auto ? autoStatus(auto) : "offline";
  const styles = STATUS_STYLES[s];
  const hasGps = auto?.last_lat != null && auto?.last_lng != null;
  const address = useAutoAddress(auto?.last_lat, auto?.last_lng);
  const mapUrl = hasGps ? `https://www.google.com/maps?q=${auto.last_lat},${auto.last_lng}` : null;

  if (auto === undefined) {
    return <p className="text-sm text-text-dim">Checking tablet status…</p>;
  }

  if (!auto) {
    return (
      <p className="text-sm text-text-dim">
        No tablet has checked in under <span className="font-mono">{autoNumber}</span> yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 flex-none rounded-full ${styles.dot}`} />
        <span className={`font-mono text-xs uppercase tracking-wide ${styles.text}`}>{s}</span>
        <span className="text-text-dim">· last seen {timeAgo(auto.last_seen_at)}</span>
      </div>
      <div className="text-text-dim">
        Now playing: <span className="text-text">{auto.now_playing_title || "idle"}</span>
      </div>
      {hasGps && (
        <a href={mapUrl} target="_blank" rel="noreferrer" className="text-teal">
          {address || `${auto.last_lat.toFixed(4)}, ${auto.last_lng.toFixed(4)}`}
        </a>
      )}
    </div>
  );
}

export default function DriverProfilePage({ params }) {
  const [record, setRecord] = useState({ loading: true, driver: null, signedUrls: {}, error: "" });
  const [payBusy, setPayBusy] = useState(false);

  const load = useCallback(async () => {
    setRecord({ loading: true, driver: null, signedUrls: {}, error: "" });
    try {
      const driver = await driverApi.get(params.id);
      if (!driver) {
        setRecord({ loading: false, driver: null, signedUrls: {}, error: "" });
        return;
      }
      const paths = [driver.photo_path, driver.driving_licence_image_path, driver.aadhaar_image_path].filter(
        Boolean
      );
      const signedUrls = await driverApi.sign(paths);
      setRecord({ loading: false, driver, signedUrls, error: "" });
    } catch {
      setRecord({ loading: false, driver: null, signedUrls: {}, error: "Couldn't load this driver." });
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMarkPaid() {
    setPayBusy(true);
    try {
      await driverApi.markPaid(params.id);
      await load();
    } finally {
      setPayBusy(false);
    }
  }

  const shellClass = "mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-10";

  if (record.loading) {
    return (
      <main className={shellClass}>
        <p className="text-sm text-text-dim" role="status">Loading driver…</p>
      </main>
    );
  }

  if (record.error) {
    return (
      <main className={shellClass}>
        <div className="rounded-2xl border border-red/25 bg-red/[0.06] p-6 text-center" role="alert">
          <p className="text-red">{record.error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-3 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-text-faint"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!record.driver) {
    return (
      <main className={shellClass}>
        <section className="rounded-2xl border border-dashed border-line p-10 text-center">
          <h1 className="font-display text-xl font-semibold">Driver not found</h1>
          <p className="mt-1 text-text-dim">This driver may have been removed.</p>
          <Link href="/admin/drivers" className="mt-3 inline-block font-semibold text-teal">
            Back to drivers
          </Link>
        </section>
      </main>
    );
  }

  const driver = record.driver;
  const photoUrl = record.signedUrls[driver.photo_path];
  const payment = paymentStatus(driver);

  return (
    <main className={shellClass}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={`Photo of ${driver.name}`}
              className="h-16 w-16 flex-none rounded-full border border-line object-cover"
            />
          ) : (
            <span className="h-16 w-16 flex-none rounded-full border border-line bg-panel-2" aria-hidden="true" />
          )}
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{driver.name}</h1>
            <p className="text-text-dim">{driver.mobile}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/drivers"
            className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-text-faint"
          >
            Back
          </Link>
          <Link
            href={`/admin/drivers/${driver.id}/edit`}
            className="rounded-full bg-amber px-4 py-2 text-sm font-semibold text-on-amber transition-colors hover:bg-[#ffc250]"
          >
            Edit
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-line bg-panel p-5">
          <h2 className="mb-3 font-display text-base font-semibold">Vehicle &amp; tablet</h2>
          <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="font-mono text-[0.66rem] uppercase tracking-wide text-text-faint">Auto plate</dt>
              <dd className="font-mono">{driver.auto_number_plate}</dd>
            </div>
            <div>
              <dt className="font-mono text-[0.66rem] uppercase tracking-wide text-text-faint">Onboarded</dt>
              <dd>{new Date(driver.created_at).toLocaleDateString()}</dd>
            </div>
          </dl>
          <div className="border-t border-line pt-4">
            <LinkedAuto autoNumber={driver.auto_number_plate} />
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-panel p-5">
          <h2 className="mb-3 font-display text-base font-semibold">Payment cycle</h2>
          <p className="text-sm text-text-dim">₹{PAYMENT_AMOUNT.toLocaleString("en-IN")} / month</p>
          <div className="mt-3 flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 font-mono text-xs uppercase tracking-wide ${
                payment.isDue ? "bg-red/10 text-red" : "bg-green/10 text-green"
              }`}
            >
              {payment.isDue ? "Payment due" : "Paid up"}
            </span>
            <span className="text-sm text-text-dim">
              {payment.isDue
                ? `${Math.abs(payment.daysRemaining)} day(s) overdue`
                : `due in ${payment.daysRemaining} day(s)`}
            </span>
          </div>
          <p className="mt-2 text-xs text-text-faint">
            {payment.everPaid
              ? `Last paid ${new Date(driver.last_paid_at).toLocaleDateString()}`
              : "No payment recorded yet — counting from onboarding."}
          </p>
          <button
            type="button"
            onClick={handleMarkPaid}
            disabled={payBusy}
            className="mt-4 rounded-full bg-amber px-4 py-2 text-sm font-semibold text-on-amber transition-colors hover:bg-[#ffc250] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {payBusy ? "Saving…" : "Mark this month as paid"}
          </button>
        </section>

        <section className="rounded-2xl border border-line bg-panel p-5 sm:col-span-2">
          <h2 className="mb-3 font-display text-base font-semibold">Identity documents</h2>
          <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="font-mono text-[0.66rem] uppercase tracking-wide text-text-faint">
                Driving Licence
              </dt>
              <dd>{maskLicence(driver.driving_licence_number)}</dd>
            </div>
            <div>
              <dt className="font-mono text-[0.66rem] uppercase tracking-wide text-text-faint">Aadhaar</dt>
              <dd>{maskAadhaar(driver.aadhaar_number)}</dd>
            </div>
          </dl>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <DocumentTile label="Photo" url={photoUrl} />
            <DocumentTile label="Driving Licence" url={record.signedUrls[driver.driving_licence_image_path]} />
            <DocumentTile label="Aadhaar" url={record.signedUrls[driver.aadhaar_image_path]} />
          </div>
        </section>
      </div>
    </main>
  );
}
