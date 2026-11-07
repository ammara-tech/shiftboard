"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { createTeam } from "@/lib/actions";
import { codeFromInput } from "@/lib/invite";
import { useApp } from "@/lib/store";

/*
  The first screen for someone who isn't in a team yet:
  start a new one, or join one with an invite link someone sent them.
*/
export default function Welcome() {
  const { profile } = useApp();
  const router = useRouter();
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  async function start(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createTeam(name);
    } catch {
      setError("Couldn't create the team. Check your connection and try again.");
      setBusy(false);
    }
  }

  function join(e: FormEvent) {
    e.preventDefault();
    const code = codeFromInput(link);
    if (!code) {
      setLinkError("That doesn't look like a ShiftBoard invite link. Paste the whole link, or the 12-letter code.");
      return;
    }
    router.push(`/join?code=${code}`);
  }

  return (
    <div className="py-6">
      <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">Hi {profile.name || "there"}! Let&apos;s get you on the rota.</h1>
      <p className="mt-4 max-w-xl text-lg text-ink-soft">
        Managers: start your team (your café, salon or shop) and invite your staff with a link. Staff: open the link your manager sent you, or paste it here.
      </p>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <form onSubmit={start} className="rounded-2xl border border-line bg-card p-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-marker-soft text-marker">
            <Icon name="calendar" className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-xl font-extrabold">Start a team</h2>
          <label className="mt-4 block text-sm font-semibold">
            Your business's name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} required placeholder="e.g. Corner Café" className="field mt-1 font-normal" />
          </label>
          {error && (
            <p role="alert" className="mt-3 text-sm font-semibold text-alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="btn mt-5 w-full">
            {busy ? "Creating…" : "Create team"}
          </button>
        </form>

        <form onSubmit={join} className="rounded-2xl border border-line bg-card p-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-soft text-amber">
            <Icon name="link" className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-xl font-extrabold">Join with a link</h2>
          <label className="mt-4 block text-sm font-semibold">
            Invite link or code
            <input
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setLinkError(null);
              }}
              placeholder="Paste it here"
              required
              className="field mt-1 font-normal"
            />
          </label>
          {linkError && (
            <p role="alert" className="mt-3 text-sm font-semibold text-alert">
              {linkError}
            </p>
          )}
          <button type="submit" className="btn-quiet mt-5 w-full">
            Join the team
          </button>
        </form>
      </div>
    </div>
  );
}
