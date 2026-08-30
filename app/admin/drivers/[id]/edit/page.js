"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DriverForm from "@/components/drivers/DriverForm";
import { driverApi } from "@/lib/drivers/api";
import { saveDriver } from "@/lib/drivers/mutations";

function existingUrls(driver, signedUrls) {
  return {
    photo: signedUrls[driver.photo_path],
    drivingLicence: signedUrls[driver.driving_licence_image_path],
    aadhaar: signedUrls[driver.aadhaar_image_path],
  };
}

export default function EditDriverPage({ params }) {
  const router = useRouter();
  const [record, setRecord] = useState({ loading: true, driver: null, signedUrls: {}, error: "" });
  const [autos, setAutos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saveCommitted, setSaveCommitted] = useState(false);

  const loadDriver = useCallback(async () => {
    setRecord({ loading: true, driver: null, signedUrls: {}, error: "" });
    try {
      const driver = await driverApi.get(params.id);
      if (!driver) {
        setRecord({ loading: false, driver: null, signedUrls: {}, error: "" });
        return;
      }

      const paths = [
        driver.photo_path,
        driver.driving_licence_image_path,
        driver.aadhaar_image_path,
      ].filter(Boolean);
      const signedUrls = await driverApi.sign(paths);
      setRecord({ loading: false, driver, signedUrls, error: "" });
    } catch (err) {
      const detail = err?.message ? ` (${err.message})` : "";
      setRecord({ loading: false, driver: null, signedUrls: {}, error: `Couldn't load this driver.${detail}` });
    }
  }, [params.id]);

  useEffect(() => {
    loadDriver();
    driverApi.listAutos().then(setAutos).catch(() => {});
  }, [loadDriver]);

  async function handleSave({ values, files }) {
    setBusy(true);
    setError("");
    try {
      await saveDriver({ current: record.driver, values, replacements: files });
      router.push("/admin/drivers?updated=1");
    } catch (submissionError) {
      if (submissionError.code === "DRIVER_CLEANUP_INCOMPLETE" && submissionError.saved) {
        setSaveCommitted(true);
        router.push("/admin/drivers?updated=1&cleanup=1");
      } else {
        setError(submissionError.message || "Couldn't save the driver.");
      }
    } finally {
      setBusy(false);
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
            onClick={loadDriver}
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
        <section
          aria-labelledby="driver-not-found-heading"
          className="rounded-2xl border border-dashed border-line p-10 text-center"
        >
          <h1 id="driver-not-found-heading" className="font-display text-xl font-semibold">
            Driver not found
          </h1>
          <p className="mt-1 text-text-dim">This driver may have been removed.</p>
          <Link href="/admin/drivers" className="mt-3 inline-block font-semibold text-teal">
            Back to drivers
          </Link>
        </section>
      </main>
    );
  }

  if (saveCommitted) {
    return (
      <main className={shellClass}>
        <p className="text-sm text-text-dim" role="status">Driver saved. Returning to drivers…</p>
      </main>
    );
  }

  return (
    <main className={shellClass}>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Edit driver</h1>
        <p className="mt-1 text-text-dim">Update contact, vehicle, and identity documents.</p>
      </header>
      <DriverForm
        mode="edit"
        initialValues={record.driver}
        existingUrls={existingUrls(record.driver, record.signedUrls)}
        onSubmit={handleSave}
        busy={busy}
        status={error}
        autos={autos}
      />
    </main>
  );
}
