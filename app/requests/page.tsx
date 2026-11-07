"use client";

import { useState, type FormEvent } from "react";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";
import { askTimeOff, cancelRequest, decideRequest, giveAwayShift, offerToTake } from "@/lib/actions";
import { alreadyOffered, datesLabel, daysCovered, MAX_NOTE, needsManager, shiftsUpForGrabs, sortRequests, statusWords, timeOffProblem } from "@/lib/requests";
import { dayLabel, onTimeOff, overlaps, shiftTimes, todayIso, upcomingFor } from "@/lib/rota";
import { isManager } from "@/lib/team";
import { useApp } from "@/lib/store";
import type { Shift, ShiftRequest } from "@/lib/types";

/*
  /requests: time off, and giving shifts away.
  - Everyone: ask for time off, give one of your upcoming shifts away, see your own requests.
  - Staff: "Up for grabs" lists shifts other people are giving away; press "I'll take it".
  - Managers: "Waiting for you" lists time off to approve, and giveaways someone has offered to
    take. Approving a giveaway moves the shift to the person taking it.
  lib/requests.ts has the rules; firestore.rules checks them on Google's servers.
*/

const STATUS_STYLE: Record<ShiftRequest["status"], string> = {
  pending: "bg-amber-soft text-amber",
  approved: "bg-teal-soft text-teal",
  declined: "bg-alert-soft text-alert",
  cancelled: "bg-page text-ink-soft",
};

export default function RequestsPage() {
  const { team, uid, requests, shifts } = useApp();
  if (!team || !uid) return null;
  const today = todayIso();
  const manager = isManager(team, uid);
  const nameOf = (id: string) => (id === uid ? "You" : team.members[id]?.name || "Someone");
  const shiftOf = (id: string) => shifts.find((s) => s.id === id);
  const waiting = sortRequests(needsManager(requests));
  const grabs = shiftsUpForGrabs(requests, shifts, uid, today);
  const mine = sortRequests(requests.filter((r) => r.by === uid)).slice(0, 20);
  const everyone = manager ? sortRequests(requests.filter((r) => r.by !== uid && r.status !== "pending")).slice(0, 30) : [];

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight">Requests</h1>
      <p className="mt-2 text-ink-soft">Ask for time off, or give a shift away for someone else to take.</p>

      {manager && (
        <Section title="Waiting for you" hint={waiting.length ? undefined : "Nothing to approve right now."}>
          {waiting.map((r) => (
            <RequestCard key={r.id} r={r} nameOf={nameOf} shift={shiftOf(r.shiftId)} shifts={shifts}>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => decideRequest(r, true)} className="btn px-4 py-2 text-sm">
                  <Icon name="check" className="h-4 w-4" />
                  Approve
                </button>
                <button type="button" onClick={() => decideRequest(r, false)} className="btn-quiet px-4 py-2 text-sm">
                  Decline
                </button>
              </div>
            </RequestCard>
          ))}
        </Section>
      )}

      <Section title="Up for grabs" hint={grabs.length ? "Shifts other people are giving away. A manager approves before the shift is yours." : "No shifts up for grabs right now."}>
        {grabs.map((r) => {
          const shift = shiftOf(r.shiftId);
          const busy = shift && shifts.some((s) => s.staffId === uid && s.id !== shift.id && overlaps(s, shift));
          const away = shift && onTimeOff(uid, shift.date, requests);
          return (
            <RequestCard key={r.id} r={r} nameOf={nameOf} shift={shift} shifts={shifts}>
              {busy || away ? (
                <p className="mt-3 text-sm text-ink-soft">{busy ? "You're already working then." : "You have time off that day."}</p>
              ) : (
                <button type="button" onClick={() => offerToTake(r, true)} className="btn mt-3 px-4 py-2 text-sm">
                  I&apos;ll take it
                </button>
              )}
            </RequestCard>
          );
        })}
        {requests
          .filter((r) => r.kind === "giveaway" && r.status === "pending" && r.takerId === uid)
          .map((r) => (
            <RequestCard key={r.id} r={r} nameOf={nameOf} shift={shiftOf(r.shiftId)} shifts={shifts}>
              <p className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                You offered to take this. Waiting for a manager.
                <button type="button" onClick={() => offerToTake(r, false)} className="font-bold text-marker hover:underline">
                  Take it back
                </button>
              </p>
            </RequestCard>
          ))}
      </Section>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <TimeOffForm today={today} />
        <GiveAwayForm shifts={upcomingFor(uid, shifts, today).filter((s) => s.published && !alreadyOffered(s.id, requests))} />
      </div>

      <Section title="Your requests" hint={mine.length ? undefined : "You haven't asked for anything yet."}>
        {mine.map((r) => (
          <RequestCard key={r.id} r={r} nameOf={nameOf} shift={shiftOf(r.shiftId)} shifts={shifts}>
            {r.status === "pending" && (
              <button type="button" onClick={() => cancelRequest(r)} className="mt-3 text-sm font-bold text-alert hover:underline">
                Cancel this request
              </button>
            )}
          </RequestCard>
        ))}
      </Section>

      {manager && everyone.length > 0 && (
        <Section title="Decided lately">
          {everyone.map((r) => (
            <RequestCard key={r.id} r={r} nameOf={nameOf} shift={shiftOf(r.shiftId)} shifts={shifts} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-extrabold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
      <ul className="mt-3 space-y-3">{children}</ul>
    </section>
  );
}

function RequestCard({ r, nameOf, shift, shifts, children }: { r: ShiftRequest; nameOf: (id: string) => string; shift?: Shift; shifts: Shift[]; children?: React.ReactNode }) {
  const who = nameOf(r.by);
  return (
    <li className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-start gap-3">
        <Avatar uid={r.by} name={who === "You" ? "Me" : who} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {r.kind === "off" ? (
              <>
                {who === "You" ? "Your" : `${who}:`} time off · {datesLabel(r.from, r.to)}{" "}
                <span className="font-normal text-ink-soft">
                  ({daysCovered(r.from, r.to)} {daysCovered(r.from, r.to) === 1 ? "day" : "days"})
                </span>
              </>
            ) : (
              <>
                {who === "You" ? "You're" : `${who} is`} giving away {shift ? `${dayLabel(shift.date)}, ${shiftTimes(shift)}` : "a shift that's since been removed"}
              </>
            )}
          </p>
          {r.kind === "giveaway" && r.takerId && <p className="text-sm text-ink-soft">{nameOf(r.takerId) === "You" ? "You" : nameOf(r.takerId)} offered to take it</p>}
          {r.note && <p className="mt-1 text-sm">&ldquo;{r.note}&rdquo;</p>}
          {r.kind === "off" && r.status === "pending" && shifts.some((s) => s.staffId === r.by && s.date >= r.from && s.date <= r.to) && (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-alert">
              <Icon name="warn" className="h-4 w-4" />
              {who === "You" ? "You're" : `${who} is`} on the rota during these days
            </p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[r.status]}`}>{statusWords[r.status]}</span>
      </div>
      {children}
    </li>
  );
}

function TimeOffForm({ today }: { today: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    const last = to || from;
    const problem = timeOffProblem(from, last, today);
    if (problem) return setError(problem);
    askTimeOff(from, last, note);
    setFrom("");
    setTo("");
    setNote("");
    setError(null);
    setSent(true);
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-card p-5">
      <h2 className="flex items-center gap-2 text-xl font-extrabold">
        <Icon name="calendar" className="h-5 w-5 text-teal" />
        Ask for time off
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block text-sm font-semibold">
          First day
          <input type="date" min={today} value={from} onChange={(e) => {
              setFrom(e.target.value);
              setSent(false);
            }} className="field mt-1 font-normal" />
        </label>
        <label className="block text-sm font-semibold">
          Last day
          <input type="date" min={from || today} value={to} onChange={(e) => {
              setTo(e.target.value);
              setSent(false);
            }} className="field mt-1 font-normal" />
        </label>
      </div>
      <p className="mt-1 text-xs text-ink-soft">For one day, leave the last day empty.</p>
      <label className="mt-3 block text-sm font-semibold">
        Note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE} placeholder="e.g. Family wedding" className="field mt-1 font-normal" />
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-alert">
          {error}
        </p>
      )}
      {sent && (
        <p role="status" className="mt-3 text-sm font-semibold text-teal">
          Sent. Your manager will approve or decline it.
        </p>
      )}
      <button type="submit" className="btn mt-4">
        Send request
      </button>
    </form>
  );
}

function GiveAwayForm({ shifts }: { shifts: Shift[] }) {
  const [shiftId, setShiftId] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift) return;
    giveAwayShift(shift, note);
    setShiftId("");
    setNote("");
    setSent(true);
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-card p-5">
      <h2 className="flex items-center gap-2 text-xl font-extrabold">
        <Icon name="send" className="h-5 w-5 text-amber" />
        Give a shift away
      </h2>
      {shifts.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">You have no published shifts coming up to give away.</p>
      ) : (
        <>
          <label className="mt-4 block text-sm font-semibold">
            Which shift
            <select value={shiftId} onChange={(e) => {
                setShiftId(e.target.value);
                setSent(false);
              }} required className="field mt-1 font-normal">
              <option value="">Choose a shift</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {dayLabel(s.date)}, {shiftTimes(s)}
                  {s.note ? ` (${s.note})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-sm font-semibold">
            Note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE} placeholder="e.g. Exam that morning" className="field mt-1 font-normal" />
          </label>
          <p className="mt-2 text-xs text-ink-soft">Anyone in the team can offer to take it. It stays yours until a manager approves.</p>
          <button type="submit" disabled={!shiftId} className="btn mt-4">
            Offer it to the team
          </button>
        </>
      )}
      {sent && (
        <p role="status" className="mt-3 text-sm font-semibold text-teal">
          Offered. You&apos;ll get a message when someone takes it.
        </p>
      )}
    </form>
  );
}
