"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import DriverList from "@/components/drivers/DriverList";
import DriverForm from "@/components/drivers/DriverForm";
import Modal from "@/components/admin/Modal";
import { driverApi } from "@/lib/drivers/api";
import { registerDriver } from "@/lib/drivers/mutations";

export default function DriversPage() {
  const searchParams = useSearchParams();
  const [directory, setDirectory] = useState({ loading: true, drivers: [], photoUrls: {}, error: "" });
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerBusy, setRegisterBusy] = useState(false);
  const [registerError, setRegisterError] = useState("");
  // The modal doesn't navigate anywhere, so its success message lives here
  // instead of the ?created=1 query param the old full-page flow used.
  const [justRegistered, setJustRegistered] = useState(false);

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

  function openRegister() {
    setRegisterError("");
    setJustRegistered(false);
    setRegisterOpen(true);
  }

  function closeRegister() {
    if (registerBusy) return;
    setRegisterOpen(false);
  }

  async function handleRegister(payload) {
    setRegisterBusy(true);
    setRegisterError("");
    try {
      await registerDriver(payload);
      setRegisterOpen(false);
      setJustRegistered(true);
      loadDirectory();
    } catch (submissionError) {
      setRegisterError(submissionError.message || "Couldn't register the driver.");
    } finally {
      setRegisterBusy(false);
    }
  }

  const cleanupWarning = searchParams.get("updated") === "1" && searchParams.get("cleanup") === "1"
    ? "Driver saved, but old document cleanup needs attention."
    : "";
  const successMessage = cleanupWarning
    ? ""
    : justRegistered || searchParams.get("created") === "1"
    ? "Driver registered."
    : searchParams.get("updated") === "1"
      ? "Driver updated."
      : "";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Drivers</h1>
          <p className="mt-1 max-w-xl text-text-dim">Search registered drivers and manage their records.</p>
        </div>
        <button
          type="button"
          onClick={openRegister}
          className="rounded-full bg-amber px-5 py-2.5 font-semibold text-on-amber transition-all hover:bg-[#ffc250] active:scale-[0.98]"
        >
          Register a driver
        </button>
      </header>

      {cleanupWarning && (
        <p className="mb-5 rounded-xl border border-red/25 bg-red/[0.06] px-4 py-3 text-sm text-red" role="alert">
          {cleanupWarning}
        </p>
      )}
      {successMessage && (
        <p className="mb-5 rounded-xl border border-green/25 bg-green/[0.06] px-4 py-3 text-sm text-green" role="status">
          {successMessage}
        </p>
      )}

      {directory.loading ? (
        <p className="text-sm text-text-dim" role="status">Loading drivers…</p>
      ) : directory.error ? (
        <div className="rounded-2xl border border-red/25 bg-red/[0.06] p-6 text-center" role="alert">
          <p className="text-red">{directory.error}</p>
          <button
            type="button"
            onClick={loadDirectory}
            className="mt-3 rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-text-faint"
          >
            Try again
          </button>
        </div>
      ) : directory.drivers.length ? (
        <DriverList drivers={directory.drivers} photoUrls={directory.photoUrls} />
      ) : (
        <section
          aria-label="No drivers registered"
          className="rounded-2xl border border-dashed border-line p-10 text-center"
        >
          <p className="text-text-dim">No drivers have been registered yet.</p>
          <Link href="/admin/drivers/new" className="mt-2 inline-block font-semibold text-teal">
            Register a driver
          </Link>
        </section>
      )}

      <Modal open={registerOpen} onClose={closeRegister} title="Register a driver">
        <DriverForm
          mode="register"
          initialValues={{}}
          existingUrls={{}}
          onSubmit={handleRegister}
          onCancel={closeRegister}
          busy={registerBusy}
          status={registerError}
          embedded
        />
      </Modal>
    </main>
  );
}
