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
  // "Add driver" on an auto's card (Autos page) links here with ?auto=…,
  // so that auto comes already picked.
  const [prefillAuto, setPrefillAuto] = useState("");

  useEffect(() => {
    driverApi.listAutos().then(setAutos).catch(() => {});
    setPrefillAuto(new URLSearchParams(window.location.search).get("auto") || "");
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
        <p className="mt-1 text-text-dim">Add their contact details and the auto they drive. Documents are optional.</p>
      </header>
      <DriverForm
        // The form reads its initial values once, so a prefill that arrives
        // after the first render starts it afresh.
        key={prefillAuto}
        mode="register"
        initialValues={prefillAuto ? { auto_number_plate: prefillAuto } : {}}
        existingUrls={{}}
        onSubmit={handleRegister}
        busy={busy}
        status={error}
        autos={autos}
      />
    </main>
  );
}
