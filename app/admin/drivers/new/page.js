"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DriverForm from "@/components/drivers/DriverForm";
import { registerDriver } from "@/lib/drivers/mutations";

export default function NewDriverPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    <main className="driver-page">
      <header className="driver-page__header">
        <h1>Register a driver</h1>
        <p>Add their contact, vehicle, and required identity documents.</p>
      </header>
      <DriverForm
        mode="register"
        initialValues={{}}
        existingUrls={{}}
        onSubmit={handleRegister}
        busy={busy}
        status={error}
      />
    </main>
  );
}
