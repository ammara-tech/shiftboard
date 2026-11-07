"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Icon from "@/components/Icon";
import { joinTeam, readInvite } from "@/lib/actions";
import { codeFromInput } from "@/lib/invite";
import { useApp } from "@/lib/store";
import type { Invite } from "@/lib/types";

/*
  /join?code=XXXXXXXXXXXX: the page an invite link opens.
  It looks up the code, says which team it's for, and joins when you press Join.
  (Signed-out visitors see the sign-in screen first, with a note that they've been invited.)
*/
export default function JoinPage() {
  return (
    <Suspense>
      <Join />
    </Suspense>
  );
}

function Join() {
  const params = useSearchParams();
  const router = useRouter();
  const { profile } = useApp();
  const code = codeFromInput(params.get("code") ?? "");
  const [invite, setInvite] = useState<Invite | null | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    if (!code) setInvite(null);
    else readInvite(code).then((found) => live && setInvite(found));
    return () => {
      live = false;
    };
  }, [code]);

  async function join() {
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      await joinTeam(code);
      router.push("/");
    } catch (e) {
      setError(e instanceof Error && e.message.includes("invite") ? e.message : "Couldn't join. Check your connection and try again.");
      setBusy(false);
    }
  }

  const already = invite && invite !== "loading" && profile.teams.includes(invite.teamId);

  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-marker-soft text-marker">
        <Icon name="people" className="h-7 w-7" />
      </span>
      {invite === "loading" ? (
        <p role="status" className="mt-6 text-ink-soft">
          Checking your invite…
        </p>
      ) : invite ? (
        <>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Join {invite.teamName}?</h1>
          <p className="mt-3 text-ink-soft">
            {already ? "You're already in this team." : "You'll see the team's rota and your own shifts, and everyone in the team will see your name."}
          </p>
          {error && (
            <p role="alert" className="mt-4 text-sm font-semibold text-alert">
              {error}
            </p>
          )}
          <div className="mt-8 flex justify-center gap-3">
            {already ? (
              <Link href="/" className="btn">
                Open the rota
              </Link>
            ) : (
              <button type="button" onClick={join} disabled={busy} className="btn px-8">
                {busy ? "Joining…" : "Join"}
              </button>
            )}
            <Link href="/" className="btn-quiet">
              Not now
            </Link>
          </div>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight">This invite link doesn&apos;t work</h1>
          <p className="mt-3 text-ink-soft">
            It may have been replaced with a new one, or copied only partly. Ask your manager for a fresh link.
          </p>
          <Link href="/" className="btn-quiet mt-8">
            Back to ShiftBoard
          </Link>
        </>
      )}
    </div>
  );
}
