"use client";

import { useEffect, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import { authErrorMessage, errorCode, finishRedirectSignIn, resetPassword, signInEmail, signInGoogle, signUpEmail } from "@/lib/auth";

/*
  The sign-in screen. On a laptop the navy side shows three small example cards
  (the rota, requests, and hours and pay), so people see what ShiftBoard does before they sign up.
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

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-[#1b2a4a] p-12 text-white lg:flex lg:flex-col">
        <p className="flex items-center gap-2 text-2xl font-extrabold">
          <Logo className="h-9 w-9" />
          ShiftBoard
        </p>
        <DemoBoard />
        {/* A big line of text, not the page's heading: on phones this side is hidden, so "Welcome back" is the h1 */}
        <p className="relative mt-auto max-w-md text-5xl font-extrabold leading-[1.05] tracking-tight">Everyone&apos;s shifts, on everyone&apos;s phone.</p>
        <p className="relative mt-5 max-w-md text-lg text-white/85">
          The rota for your café, salon or shop. Staff see their shifts the moment you publish, swap shifts and ask for time off, and the hours add up for payroll.
        </p>
      </aside>

      <main className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-xl font-extrabold lg:invisible">
            <Logo />
            ShiftBoard
          </p>
          <ThemeToggle />
        </div>

        <div className="m-auto w-full max-w-sm py-10">
          {invited && (
            <p className="mb-6 rounded-xl border border-marker/40 bg-marker-soft px-4 py-3 text-sm">
              <strong>You&apos;ve been invited to a team.</strong> Sign in or create an account, and you&apos;ll join it straight after.
            </p>
          )}
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
          <p className="mt-6 text-sm text-ink-soft">Only the people in your team can see its rota, and only managers see pay. Everything is stored in Google&apos;s Firebase database.</p>
        </div>
      </main>
    </div>
  );
}

/*
  Three made-up cards pinned like notes on a staffroom board, as a preview on the sign-in screen.
  They sit in a grid, so none hides another and the heading below always has room
  (on narrower laptops the Requests card is left out). Each shows something ShiftBoard does:
    the week's rota, with an open shift
    requests: time off approved, and someone offering to take a shift
    hours for the week, with a pay estimate
  Decorative only: screen readers skip it.
*/
const card = "rounded-2xl bg-white p-4 text-[#18213a] shadow-[0_24px_50px_-18px_rgba(0,0,0,0.55)]";

function Face({ letter, colour }: { letter: string; colour: string }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: colour }}>
      {letter}
    </span>
  );
}

function DemoBoard() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const rows: [string, string, (string | null)[]][] = [
    ["T", "#2453a6", ["8–4", "8–4", null, "12–8", "8–4"]],
    ["L", "#b45309", [null, "12–8", "8–4", "8–4", null]],
    ["S", "#0f766e", ["12–8", null, "12–8", null, "open"]],
  ];
  return (
    <div aria-hidden="true" className="relative mx-auto mb-10 mt-8 grid w-full max-w-[540px] select-none gap-5 xl:grid-cols-2">
      {/* The week's rota */}
      <div className={`${card} w-full max-w-[300px] rotate-[-3deg] justify-self-center xl:justify-self-start`}>
        <p className="flex items-center justify-between text-sm font-bold">
          <span className="flex items-center gap-1.5">
            <Icon name="calendar" className="h-4 w-4 text-[#2453a6]" />
            Rota · 9 – 15 Nov
          </span>
          <span className="flex items-center gap-1 text-[11px] text-[#2453a6]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#2453a6]" />
            Live
          </span>
        </p>
        {/* The columns are set here, not as a Tailwind class, so the grid can never fall apart */}
        <div className="mt-3 grid gap-1 text-center text-[10px]" style={{ gridTemplateColumns: "24px repeat(5, minmax(0, 1fr))" }}>
          <span />
          {days.map((d) => (
            <span key={d} className="font-bold uppercase tracking-wider text-[#525c74]">
              {d}
            </span>
          ))}
          {rows.map(([who, colour, shifts]) => (
            <div key={who} className="contents">
              <Face letter={who} colour={colour} />
              {shifts.map((s, i) =>
                s === "open" ? (
                  <span key={i} className="rounded-md border border-dashed border-[#b45309] py-1 font-bold text-[#b45309]">
                    Open
                  </span>
                ) : s ? (
                  <span key={i} className="rounded-md py-1 font-bold text-white" style={{ background: colour }}>
                    {s}
                  </span>
                ) : (
                  <span key={i} className="rounded-md bg-[#f3f5f9] py-1" />
                ),
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-full bg-[#18213a] px-3 py-1.5 text-center text-[11px] font-semibold text-white">The rota for 9 – 15 Nov is out</p>
      </div>

      {/* Requests */}
      <div className={`${card} mt-6 hidden w-full max-w-[240px] rotate-[3deg] self-start justify-self-end xl:block`}>
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Icon name="inbox" className="h-4 w-4 text-[#b45309]" />
          Requests
        </p>
        <ul className="mt-2 space-y-2 text-xs">
          <li className="rounded-lg bg-[#f3f5f9] p-2">
            <p className="font-semibold">Lerato: time off</p>
            <p className="text-[#525c74]">Fri 13 Nov – Sat 14 Nov</p>
            <p className="mt-1 inline-block rounded-full bg-[#dcfce7] px-2 font-bold text-[#166534]">Approved</p>
          </li>
          <li className="rounded-lg bg-[#f3f5f9] p-2">
            <p className="font-semibold">Thabo is giving away Thu 12–8</p>
            <p className="text-[#525c74]">Sipho offered to take it</p>
            <p className="mt-1 flex gap-1">
              <span className="rounded-md bg-[#2453a6] px-2 py-0.5 font-bold text-white">Approve</span>
              <span className="rounded-md border border-[#dde2ec] px-2 py-0.5 font-bold">Decline</span>
            </p>
          </li>
        </ul>
      </div>

      {/* Hours and pay */}
      <div className={`${card} w-full max-w-[260px] rotate-[-1.5deg] justify-self-center xl:col-span-2`}>
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Icon name="clock" className="h-4 w-4 text-[#0f766e]" />
          Hours this week
        </p>
        <ul className="mt-2 space-y-1.5 text-xs">
          {(
            [
              ["Thabo", "30h", "R 1 050,00"],
              ["Lerato", "22h", "R 770,00"],
              ["Sipho", "16h", "R 560,00"],
            ] as const
          ).map(([name, hours, pay]) => (
            <li key={name} className="flex items-center justify-between">
              <span className="font-semibold">{name}</span>
              <span className="text-[#525c74]">{hours}</span>
              <span className="font-bold">{pay}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-[#0f766e] py-1.5 text-xs font-bold text-white">
          <Icon name="download" className="h-3.5 w-3.5" />
          Download for payroll
        </p>
      </div>
    </div>
  );
}
