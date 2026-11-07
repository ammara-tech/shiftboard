"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";
import {
  addExtra,
  createTeam,
  linkExtra,
  removeExtra,
  setMyUnavailable,
  deleteTeamForEveryone,
  leaveTeam,
  newInviteLink,
  readTeamName,
  removeMember,
  renameTeam,
  setManager,
  setMyName,
  setRate,
  setRole,
  switchTeam,
} from "@/lib/actions";
import { signOutUser } from "@/lib/auth";
import { codeFromInput, inviteLink, inviteMessage } from "@/lib/invite";
import { formatRand, parseRand } from "@/lib/money";
import { canLeave, canStepDown, isManager, linkCandidates, people } from "@/lib/team";
import { describeUnavailable, EVERY_DAY, isValidUnavailable, withUnavailable, withoutUnavailable } from "@/lib/availability";
import type { Unavailable } from "@/lib/types";
import { useApp } from "@/lib/store";

/*
  /team: everything about the team and you.
  - Everyone: the people in the team, when you can't work (lib/availability.ts), your name,
    switching between teams (someone who works at two places), leaving and signing out.
  - Managers also: the team's name, the invite link, what each person usually does ("Barista"),
    pay rates (only managers can see them), making someone a manager or not, removing people,
    adding people by name before they've joined (and linking them up when they do), and deleting
    the team for everyone.
  lib/team.ts has the rules; firestore.rules checks them on Google's servers.
*/
export default function TeamPage() {
  const { team, profile, uid, rates } = useApp();
  const router = useRouter();
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [asking, setAsking] = useState<string | null>(null); // the person we're asking "Remove them?" about
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);
  if (!team || !uid) return null;

  const manager = isManager(team, uid);
  const link = origin ? inviteLink(origin, team.inviteCode) : "";
  const crew = people(team);
  const alone = team.memberIds.length === 1;
  const leaveOk = canLeave(team, uid);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Press and hold the link to copy it instead.");
    }
  }

  async function act(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await action();
      after?.();
    } catch {
      setError("That didn't work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">{team.name}</h1>
      {error && (
        <p role="alert" className="rounded-xl border border-alert/40 bg-card px-4 py-3 text-sm font-semibold text-alert">
          {error}
        </p>
      )}

      {manager && (
        <Panel title="Invite your staff" hint="Anyone with this link can join as staff after signing in. Send it only to people who work for you.">
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="invite-link">
              Invite link
            </label>
            <input id="invite-link" readOnly value={link} onFocus={(e) => e.target.select()} className="field min-w-0 flex-1 basis-64 font-mono text-sm" />
            <button type="button" onClick={copy} className="btn">
              <Icon name={copied ? "check" : "copy"} />
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(inviteMessage(team.name, link))}`} target="_blank" rel="noopener noreferrer" className="btn-quiet">
              <Icon name="whatsapp" />
              Send on WhatsApp
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            {confirmNew ? (
              <span className="flex flex-wrap items-center gap-2 text-sm">
                The old link will stop working.
                <button type="button" disabled={busy} onClick={() => act(newInviteLink, () => setConfirmNew(false))} className="btn px-3 py-2">
                  Make a new link
                </button>
                <button type="button" onClick={() => setConfirmNew(false)} className="btn-quiet px-3 py-2">
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmNew(true)} className="btn-quiet">
                <Icon name="refresh" />
                New link
              </button>
            )}
          </div>
        </Panel>
      )}

      <Panel
        title={`People (${crew.length})`}
        hint={manager ? "Set what each person usually does and their pay per hour. Only managers can see pay." : "Managers build the rota and approve requests."}
      >
        <ul className="divide-y divide-line">
          {crew.map((p) => (
            <li key={p.id} className="py-3">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar uid={p.id} name={p.name} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {p.name} {p.id === uid && <span className="font-normal text-ink-soft">(you)</span>}
                    {p.manager && <span className="ml-2 rounded-full bg-marker-soft px-2 py-0.5 text-xs font-bold text-marker">Manager</span>}
                    {p.extra && <span className="ml-2 rounded-full bg-amber-soft px-2 py-0.5 text-xs font-bold text-amber">Not joined yet</span>}
                  </span>
                  {!manager && p.role && <span className="block text-sm text-ink-soft">{p.role}</span>}
                  {(p.unavailable ?? []).length > 0 && (
                    <span className="block text-xs text-ink-soft">Can&apos;t work: {(p.unavailable ?? []).map(describeUnavailable).join("; ")}</span>
                  )}
                </span>
                {manager && p.extra && <ExtraActions id={p.id} name={p.name} candidates={linkCandidates(team)} busy={busy} act={act} />}
                {manager && !p.extra &&
                  (asking === p.id ? (
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      Remove {p.name}? Their coming shifts become open shifts.
                      <button type="button" disabled={busy} onClick={() => act(() => removeMember(p.id), () => setAsking(null))} className="btn px-3 py-1.5 text-sm !bg-alert !text-white">
                        Remove
                      </button>
                      <button type="button" onClick={() => setAsking(null)} className="btn-quiet px-3 py-1.5 text-sm">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {p.id !== uid && (
                        <button type="button" onClick={() => setManager(p.id, !p.manager)} className="btn-quiet px-3 py-1.5 text-sm">
                          {p.manager ? "Not a manager" : "Make manager"}
                          <span className="sr-only">: {p.name}</span>
                        </button>
                      )}
                      {p.id === uid && canStepDown(team, uid) && (
                        <button type="button" onClick={() => setManager(uid, false)} className="btn-quiet px-3 py-1.5 text-sm">
                          Stop being a manager
                        </button>
                      )}
                      {p.id !== uid && (
                        <button type="button" onClick={() => setAsking(p.id)} className="btn-quiet px-3 py-1.5 text-sm !text-alert hover:!border-alert">
                          Remove<span className="sr-only"> {p.name}</span>
                        </button>
                      )}
                    </span>
                  ))}
              </div>
              {manager && (
                <div className="mt-2 grid gap-2 pl-11 sm:grid-cols-2">
                  <SmallForm label={`What ${p.id === uid ? "you usually do" : `${p.name} usually does`}`} value={p.role ?? ""} placeholder="e.g. Barista" onSave={(v) => setRole(p.id, v)} />
                  <RateForm name={p.id === uid ? "you" : p.name} cents={rates[p.id] ?? 0} onSave={(c) => setRate(p.id, c)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      {manager && (
        <Panel title="Add someone by name" hint="For staff who haven't joined yet, so you can put them on the rota now. When they join with the invite link, link them up on this page and their shifts move to their account.">
          <AddExtra />
        </Panel>
      )}

      <Panel title="When you can't work" hint="Every week, like Mondays or Friday evenings. Your managers see this, and the rota warns them if they book you then.">
        <Availability list={team.members[uid]?.unavailable ?? []} />
      </Panel>

      {manager && (
        <Panel title="Team name">
          <InlineForm label="Team name" value={team.name} onSave={renameTeam} />
        </Panel>
      )}

      <Panel title="Your name" hint="This is how you appear on the rota and in messages.">
        <InlineForm label="Your name" value={profile.name} onSave={setMyName} />
      </Panel>

      <Panel title="Your teams" hint="If you work at more than one place, each has its own rota.">
        <ul className="divide-y divide-line">
          {profile.teams.map((id) => (
            <li key={id} className="flex items-center gap-3 py-2.5">
              <span className="flex-1 font-semibold">{id === team.id ? team.name : <OtherTeam id={id} />}</span>
              {id === team.id ? (
                <span className="text-sm font-semibold text-marker">Open now</span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    switchTeam(id);
                    router.push("/");
                  }}
                  className="btn-quiet px-3 py-1.5 text-sm"
                >
                  Switch
                </button>
              )}
            </li>
          ))}
        </ul>
        <AddTeam onError={setError} />
      </Panel>

      <Panel title="Leave or sign out">
        {!leaveOk && <p className="mb-3 text-sm text-ink-soft">You&apos;re the only manager. Make someone else a manager before you leave, so the team isn&apos;t left without one.</p>}
        <div className="flex flex-wrap gap-2">
          {confirmLeave ? (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              {alone ? "You're the only person, so the team and its rota will be deleted." : "You'll lose the rota until a manager invites you again."}
              <button type="button" disabled={busy} onClick={() => act(leaveTeam, () => router.push("/"))} className="btn px-3 py-2 !bg-alert !text-white">
                {alone ? "Delete and leave" : "Yes, leave"}
              </button>
              <button type="button" onClick={() => setConfirmLeave(false)} className="btn-quiet px-3 py-2">
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" disabled={!leaveOk} onClick={() => setConfirmLeave(true)} className="btn-quiet !text-alert hover:!border-alert disabled:opacity-50">
              Leave {team.name}
            </button>
          )}
          {manager &&
            !alone &&
            !confirmLeave &&
            (confirmDelete ? (
              <span className="flex w-full flex-wrap items-center gap-2 text-sm">
                Everyone loses {team.name}, its rota, requests and pay rates. This can&apos;t be undone.
                <button type="button" disabled={busy} onClick={() => act(deleteTeamForEveryone, () => router.push("/"))} className="btn px-3 py-2 !bg-alert !text-white">
                  Delete for everyone
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="btn-quiet px-3 py-2">
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="btn-quiet !text-alert hover:!border-alert">
                <Icon name="trash" />
                Delete for everyone
              </button>
            ))}
          <button type="button" onClick={() => signOutUser()} className="btn-quiet">
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      </Panel>
    </div>
  );
}

/* Managers: link someone added by name to their account once they've joined, or remove them */
function ExtraActions({
  id,
  name,
  candidates,
  busy,
  act,
}: {
  id: string;
  name: string;
  candidates: { id: string; name: string }[];
  busy: boolean;
  act: (action: () => Promise<unknown>, after?: () => void) => Promise<void>;
}) {
  const [mode, setMode] = useState<"none" | "link" | "remove">("none");
  const [target, setTarget] = useState(candidates[0]?.id ?? "");
  if (mode === "link") {
    return (
      <span className="flex w-full flex-wrap items-center gap-2 text-sm">
        <label htmlFor={`link-${id}`}>{name} joined as:</label>
        <select id={`link-${id}`} value={target} onChange={(e) => setTarget(e.target.value)} className="field w-auto py-1.5 text-sm">
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="button" disabled={busy || !target} onClick={() => act(() => linkExtra(id, target), () => setMode("none"))} className="btn px-3 py-1.5 text-sm">
          Link and move their shifts
        </button>
        <button type="button" onClick={() => setMode("none")} className="btn-quiet px-3 py-1.5 text-sm">
          Cancel
        </button>
      </span>
    );
  }
  if (mode === "remove") {
    return (
      <span className="flex flex-wrap items-center gap-2 text-sm">
        Remove {name}? Their coming shifts become open shifts.
        <button type="button" disabled={busy} onClick={() => act(() => removeExtra(id), () => setMode("none"))} className="btn px-3 py-1.5 text-sm !bg-alert !text-white">
          Remove
        </button>
        <button type="button" onClick={() => setMode("none")} className="btn-quiet px-3 py-1.5 text-sm">
          Cancel
        </button>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1">
      <button type="button" onClick={() => setMode("link")} className="btn-quiet px-3 py-1.5 text-sm">
        They&apos;ve joined: link<span className="sr-only"> {name}</span>
      </button>
      <button type="button" onClick={() => setMode("remove")} className="btn-quiet px-3 py-1.5 text-sm !text-alert hover:!border-alert">
        Remove<span className="sr-only"> {name}</span>
      </button>
    </span>
  );
}

/* Managers: add someone who doesn't have an account yet */
function AddExtra() {
  const [name, setName] = useState("");
  const [role, setRoleText] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        addExtra(name, role);
        setAdded(name.trim());
        setName("");
        setRoleText("");
      }}
      className="grid gap-3 sm:grid-cols-3 sm:items-end"
    >
      <label className="block text-sm font-semibold">
        Name
        <input value={name} onChange={(e) => {
            setName(e.target.value);
            setAdded(null);
          }} maxLength={30} required placeholder="e.g. Zanele" className="field mt-1 font-normal" />
      </label>
      <label className="block text-sm font-semibold">
        What they do (optional)
        <input value={role} onChange={(e) => setRoleText(e.target.value)} maxLength={30} placeholder="e.g. Waiter" className="field mt-1 font-normal" />
      </label>
      <button type="submit" className="btn">
        <Icon name="userPlus" className="h-4 w-4" />
        Add
      </button>
      {added && (
        <p role="status" className="text-sm font-semibold text-teal sm:col-span-3">
          Added {added}. You can put them on the rota now.
        </p>
      )}
    </form>
  );
}

/* Your own times you can't work, every week */
function Availability({ list }: { list: Unavailable[] }) {
  const [day, setDay] = useState(0);
  const [allDay, setAllDay] = useState(true);
  const [from, setFrom] = useState("17:00");
  const [to, setTo] = useState("23:59");
  const [error, setError] = useState(false);

  function add(e: FormEvent) {
    e.preventDefault();
    const u = { day, from: allDay ? "" : from, to: allDay ? "" : to };
    if (!isValidUnavailable(u)) return setError(true);
    setError(false);
    setMyUnavailable(withUnavailable(list, u));
  }

  return (
    <div>
      {list.length === 0 ? (
        <p className="text-sm text-ink-soft">You haven&apos;t added any. You can work any time.</p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((u, i) => (
            <li key={`${u.day}${u.from}${u.to}`} className="flex items-center justify-between gap-3 py-2">
              <span className="font-semibold">{describeUnavailable(u)}</span>
              <button type="button" onClick={() => setMyUnavailable(withoutUnavailable(list, i))} className="text-sm font-bold text-alert hover:underline">
                Remove<span className="sr-only"> {describeUnavailable(u)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block text-sm font-semibold">
          Day
          <select value={day} onChange={(e) => setDay(Number(e.target.value))} className="field mt-1 w-auto font-normal">
            {EVERY_DAY.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-3 text-sm font-semibold">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4 accent-[var(--color-marker)]" />
          All day
        </label>
        {!allDay && (
          <>
            <label className="block text-sm font-semibold">
              From
              <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className="field mt-1 w-auto font-normal" />
            </label>
            <label className="block text-sm font-semibold">
              To
              <input type="time" value={to} onChange={(e) => setTo(e.target.value)} className="field mt-1 w-auto font-normal" />
            </label>
          </>
        )}
        <button type="submit" className="btn-quiet">
          <Icon name="plus" className="h-4 w-4" />
          Add
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-alert">
          The &quot;to&quot; time has to be after the &quot;from&quot; time.
        </p>
      )}
    </div>
  );
}

/* A small text box that saves when you press Enter or leave it */
function SmallForm({ label, value, placeholder, onSave }: { label: string; value: string; placeholder: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const save = () => draft.trim() !== value && onSave(draft.trim());
  return (
    <label className="block text-xs font-semibold text-ink-soft">
      {label}
      <input
        value={draft}
        maxLength={30}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        className="field mt-1 py-2 text-sm font-normal text-ink"
      />
    </label>
  );
}

/* Pay per hour, in rand. Saves when you press Enter or leave the box. */
function RateForm({ name, cents, onSave }: { name: string; cents: number; onSave: (cents: number) => void }) {
  const shown = cents ? formatRand(cents).replace(/^R /, "") : "";
  const [draft, setDraft] = useState(shown);
  const [bad, setBad] = useState(false);
  useEffect(() => setDraft(shown), [shown]);
  function save() {
    if (draft.trim() === shown) return;
    if (!draft.trim()) return onSave(0);
    const value = parseRand(draft);
    setBad(value === null);
    if (value !== null) onSave(value);
  }
  return (
    <label className="block text-xs font-semibold text-ink-soft">
      Pay per hour for {name} (R)
      <input
        inputMode="decimal"
        value={draft}
        placeholder="e.g. 35,00"
        onChange={(e) => {
          setDraft(e.target.value);
          setBad(false);
        }}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        aria-invalid={bad || undefined}
        className="field mt-1 py-2 text-sm font-normal text-ink"
      />
      {bad && <span className="mt-1 block text-alert">Type an amount like 35,00.</span>}
    </label>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <h2 className="text-lg font-extrabold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* A text box with a Save button that appears once you've changed it */
function InlineForm({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(value), [value]);
  const changed = draft.trim() !== value && draft.trim().length > 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!changed) return;
        onSave(draft);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }}
      className="flex flex-wrap gap-2"
    >
      <label className="sr-only" htmlFor={label}>
        {label}
      </label>
      <input id={label} value={draft} maxLength={30} onChange={(e) => setDraft(e.target.value)} className="field min-w-0 flex-1 basis-56" />
      <button type="submit" disabled={!changed} className="btn">
        {saved ? "Saved" : "Save"}
      </button>
    </form>
  );
}

/* The name of a team you're in but not looking at right now */
function OtherTeam({ id }: { id: string }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    readTeamName(id).then((n) => live && setName(n));
    return () => {
      live = false;
    };
  }, [id]);
  return <>{name ?? <span className="text-ink-soft">Another team</span>}</>;
}

/* Start another team, or join one with a link */
function AddTeam({ onError }: { onError: (e: string | null) => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "start" | "join">("none");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    onError(null);
    if (mode === "join") {
      const code = codeFromInput(value);
      if (!code) return onError("That doesn't look like a ShiftBoard invite link. Paste the whole link, or the 12-letter code.");
      return router.push(`/join?code=${code}`);
    }
    setBusy(true);
    try {
      await createTeam(value);
      router.push("/");
    } catch {
      onError("Couldn't create the team. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "none") {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setMode("start")} className="btn-quiet">
          <Icon name="plus" />
          Start another
        </button>
        <button type="button" onClick={() => setMode("join")} className="btn-quiet">
          <Icon name="link" />
          Join with a link
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
      <label className="sr-only" htmlFor="add-team">
        {mode === "start" ? "New team's name" : "Invite link or code"}
      </label>
      <input
        id="add-team"
        autoFocus
        required
        maxLength={mode === "start" ? 30 : 200}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={mode === "start" ? "e.g. Corner Café, Rosebank" : "Paste the invite link"}
        className="field min-w-0 flex-1 basis-56"
      />
      <button type="submit" disabled={busy} className="btn">
        {mode === "start" ? "Create" : "Join"}
      </button>
      <button type="button" onClick={() => setMode("none")} className="btn-quiet">
        Cancel
      </button>
    </form>
  );
}
