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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    } catch {
      setRecord({ loading: false, driver: null, signedUrls: {}, error: "Couldn't load this driver." });
    }
  }, [params.id]);

  useEffect(() => {
    loadDriver();
  }, [loadDriver]);

  async function handleSave({ values, files }) {
    setBusy(true);
    setError("");
    try {
      await saveDriver({ current: record.driver, values, replacements: files });
      router.push("/admin/drivers?updated=1");
    } catch (submissionError) {
      setError(submissionError.message || "Couldn't save the driver.");
    } finally {
      setBusy(false);
    }
  }

  if (record.loading) {
    return <main className="driver-page"><p className="driver-page__state" role="status">Loading driver…</p></main>;
  }

  if (record.error) {
    return (
      <main className="driver-page">
        <div className="driver-page__state" role="alert">
          <p>{record.error}</p>
          <button className="btn" type="button" onClick={loadDriver}>Try again</button>
        </div>
      </main>
    );
  }

  if (!record.driver) {
    return (
      <main className="driver-page">
        <section className="empty-state" aria-labelledby="driver-not-found-heading">
          <h1 id="driver-not-found-heading">Driver not found</h1>
          <p>This driver may have been removed.</p>
          <Link href="/admin/drivers">Back to drivers</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="driver-page">
      <header className="driver-page__header">
        <h1>Edit driver</h1>
        <p>Update contact, vehicle, and identity documents.</p>
      </header>
      <DriverForm
        mode="edit"
        initialValues={record.driver}
        existingUrls={existingUrls(record.driver, record.signedUrls)}
        onSubmit={handleSave}
        busy={busy}
        status={error}
      />
    </main>
  );
}
