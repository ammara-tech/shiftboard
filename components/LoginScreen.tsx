"use client";

import { useEffect, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { authErrorMessage, errorCode, finishRedirectSignIn, resetPassword, signInDemo, signInEmail, signInGoogle, signUpEmail } from "@/lib/auth";

/*
  The sign-in screen is the week drawn on the staffroom whiteboard. The form is Monday's shift:
  a block with a time and a blue marker edge. On a laptop the rest of the week is behind it,
  with a few shifts already on the board, and "Try the demo" is an open shift in magenta.
  Someone who opened an invite link sees a note that they'll join after signing in.
*/
export default function LoginScreen() {
  const [mode, setMode] = useState<"signIn" | "create">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; code: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Opened from a "Try the demo" link (…/?demo): the demo box goes to the top
  const [fromDemoLink, setFromDemoLink] = useState(false);
  useEffect(() => {
    setFromDemoLink(new URLSearchParams(window.location.search).has("demo"));
  }, []);

  // "Try the demo" is an open shift, in magenta marker, waiting for someone to take it
  const demoBox = (
    <div className="rounded-2xl border-2 border-dashed border-amber bg-amber-soft p-4">
      <p className="font-mono text-xs font-bold text-amber">OPEN SHIFT · ANY TIME</p>
      <p className="font-bold">Just looking?</p>
      <p className="mt-1 text-sm text-ink-soft">Try ShiftBoard as the manager of a made-up café, with staff, a rota and a notice. No account needed, and everything is deleted when you end the demo.</p>
      <button type="button" disabled={busy} onClick={() => run(signInDemo)} className="btn mt-3 w-full py-2.5">
        Try the demo
      </button>
    </div>
  );
  const invited = usePathname() === "/join"; // the same on the server and in the browser

  // If Google sign-in went the full-page way and failed, say why when the page comes back.
  useEffect(() => {
    finishRedirectSignIn().catch((e) => {
      setError({ text: authErrorMessage(e), code: errorCode(e) });
      console.error("Sign-in failed:", errorCode(e) || e);
    });
  }, []);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      setError({ text: authErrorMessage(e), code: errorCode(e) });
      console.error("Sign-in failed:", errorCode(e) || e); // the code, for whoever is fixing it
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    run(() => (mode === "signIn" ? signInEmail(email, password) : signUpEmail(email, password)));
  }

  async function forgot() {
    if (!email.trim()) {
      setError({ text: "Type your email address first, then press \"Forgot your password?\" again.", code: "" });
      return;
    }
    await run(async () => {
      await resetPassword(email);
      setNotice("If there's an account for that email, a reset link is on its way. Check your inbox.");
    });
  }

  // The week on the whiteboard, behind the sign-in shift (decoration)
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <p className="flex items-center gap-2 text-xl font-extrabold">
          <Logo className="h-9 w-9" />
          ShiftBoard
        </p>
        <ThemeToggle />
      </div>

      {/* The week drawn on the board: day columns with a few shifts already on them (laptops only, decoration) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-20 mx-auto hidden max-w-6xl grid-cols-7 gap-3 px-5 lg:grid">
        {days.map((d, i) => (
          <div key={d} className="min-h-[34rem] border-l border-line/80 pl-2">
            <p className="font-mono text-sm font-bold text-ink-soft">
              {d} <span className="font-normal">{17 + i}</span>
            </p>
            {/* Kept to the right-hand days, so none sits behind the sign-in shift */}
            {i === 3 && <DecoShift who="Thandi" time="07:00 – 15:00" top="mt-4" />}
            {i === 4 && <DecoShift who="Open shift" time="10:00 – 18:00" top="mt-12" open />}
            {i === 5 && <DecoShift who="Lerato" time="08:00 – 14:00" top="mt-4" />}
            {i === 6 && <DecoShift who="Sipho" time="12:00 – 20:00" top="mt-20" />}
            {i === 6 && <DecoShift who="Draft" time="09:00 – 13:00" top="mt-[19rem]" open />}
          </div>
        ))}
      </div>

      <div className="relative z-10 mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-6 lg:grid-cols-[minmax(0,26rem)_1fr] lg:pt-16">
        {/* The sign-in form is Monday's shift: a block on the rota with a time and a coloured edge */}
        <main className="rounded-2xl border-l-[6px] border-marker bg-card p-6 shadow-[0_24px_60px_-28px_rgba(20,26,46,0.45)] ring-1 ring-line sm:p-8">
          <p className="font-mono text-sm font-bold text-marker">Mon 17 · 08:00 – 08:01</p>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink-soft">Your shift: signing in</p>
          {fromDemoLink && <div className="my-6">{demoBox}</div>}
          {invited && (
            <p className="mt-5 rounded-xl border border-marker/40 bg-marker-soft px-4 py-3 text-sm">
              <strong>You&apos;ve been invited to a team.</strong> Sign in or create an account, and you&apos;ll join it straight after.
            </p>
          )}
          <div className="mt-5">
          <h1 className="text-3xl font-extrabold tracking-tight">{mode === "signIn" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-2 text-ink-soft">{mode === "signIn" ? "Sign in to see the rota." : "It's free, and takes a minute."}</p>

          <button type="button" disabled={busy} onClick={() => run(signInGoogle)} className="btn-quiet mt-8 w-full py-3">
            <Icon name="google" />
            Continue with Google
          </button>

          <p className="my-6 flex items-center gap-3 text-sm text-ink-soft before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">or</p>

          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm font-semibold">
              Email
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field mt-1 font-normal" />
            </label>
            <div>
              <label htmlFor="password" className="text-sm font-semibold">
                Password
              </label>
              <div className="relative mt-1">
                <input
                  id="password"
                  type={show ? "text" : "password"}
                  required
                  minLength={6}
                  autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field pr-20"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-pressed={show}
                  className="absolute inset-y-0 right-2 my-auto h-9 rounded-lg px-3 text-sm font-semibold text-marker hover:bg-marker-soft"
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            {error && (
              <div role="alert" className="text-sm font-semibold text-alert">
                <p>{error.text}</p>
                {error.code && <p className="mt-1 text-xs font-normal opacity-70">Error code: {error.code}</p>}
              </div>
            )}
            {notice && (
              <p role="status" className="text-sm text-marker">
                {notice}
              </p>
            )}
            <button type="submit" disabled={busy} className="btn w-full py-3">
              {mode === "signIn" ? "Sign in" : "Create account"}
            </button>
          </form>

          {mode === "signIn" && (
            <button type="button" onClick={forgot} className="mt-4 text-sm font-semibold text-marker hover:underline">
              Forgot your password?
            </button>
          )}

          <p className="mt-8 text-ink-soft">
            {mode === "signIn" ? "New to ShiftBoard? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signIn" ? "create" : "signIn");
                setError(null);
                setNotice(null);
              }}
              className="font-bold text-marker hover:underline"
            >
              {mode === "signIn" ? "Create an account" : "Sign in"}
            </button>
          </p>
          </div>
          <p className="mt-6 text-sm text-ink-soft">Only the people in your team can see its rota, and only managers see pay. Everything is stored in Google&apos;s Firebase database.</p>
        </main>

        <div className="flex flex-col justify-end gap-8 lg:pb-6 lg:pl-10">
          <div className="rounded-2xl bg-card/90 p-6 ring-1 ring-line backdrop-blur lg:max-w-md">
            <p className="text-4xl font-extrabold leading-[1.05] tracking-tight">Everyone&apos;s shifts, on everyone&apos;s phone.</p>
            <p className="mt-4 text-lg text-ink-soft">
              The rota for your café, salon or shop. Staff see their shifts the moment you publish, swap shifts and ask for time off, and the hours add up for payroll.
            </p>
          </div>
          {!fromDemoLink && <div className="lg:max-w-md">{demoBox}</div>}
        </div>
      </div>
    </div>
  );
}

/* A shift drawn on the board behind the sign-in form. Decorative only. */
function DecoShift({ who, time, top, open = false }: { who: string; time: string; top: string; open?: boolean }) {
  return (
    <div className={`${top} rounded-lg border-l-4 px-2 py-2 text-xs ${open ? "border-dashed border-amber bg-amber-soft text-amber" : "border-marker bg-marker-soft text-marker"}`}>
      <p className="font-bold">{who}</p>
      <p className="font-mono">{time}</p>
    </div>
  );
}
