"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DriverForm from "@/components/drivers/DriverForm";
import { driverApi } from "@/lib/drivers/api";
import { registerDriver } from "@/lib/drivers/mutations";

export default function NewDriverPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [autos, setAutos] = useState([]);

  useEffect(() => {
    driverApi.listAutos().then(setAutos).catch(() => {});
  }, []);

  async function handleRegister(payload) {
    setBusy(true);
    setError("");
    try {
      await registerDriver(payload);
      router.push("/admin/drivers?created=1");
    } catch (submissionError) {
      setError(submissionError.message || "Couldn't register the driver.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-10">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Register a driver</h1>
        <p className="mt-1 text-text-dim">Add their contact, vehicle, and required identity documents.</p>
      </header>
      <DriverForm
        mode="register"
        initialValues={{}}
        existingUrls={{}}
        onSubmit={handleRegister}
        busy={busy}
        status={error}
        autos={autos}
      />
    </main>
  );
}
