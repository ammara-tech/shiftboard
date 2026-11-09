"use client";

import { useState } from "react";
import { endDemo } from "@/lib/demo";

/*
  The strip at the top while someone is trying the demo (signed in as a guest, lib/demo.ts).
  "End the demo" deletes the example data and the guest account, which takes them back to the
  sign-in screen, where they can make a real account.
*/
export default function DemoBanner() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function end() {
    setBusy(true);
    setError(false);
    try {
      await endDemo();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-marker/40 bg-marker-soft">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm">
        <p className="flex-1">
          <strong>You&apos;re trying the demo.</strong> You're the manager of a made-up café: ending the demo deletes it all.
          {error && <span className="ml-1 font-semibold text-alert">Couldn&apos;t end it. Check your connection and try again.</span>}
        </p>
        <button type="button" onClick={end} disabled={busy} className="btn py-1.5 text-sm">
          {busy ? "Ending…" : "End the demo"}
        </button>
      </div>
    </div>
  );
}
