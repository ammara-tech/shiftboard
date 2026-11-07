import { isIsoDate, isTime, dayLabel, weekLabel, weekStart } from "@/lib/rota";
import { datesLabel } from "@/lib/requests";
import type { Notice, RequestKind, RequestStatus, Shift, ShiftRequest, Team } from "@/lib/types";

/*
  Reading shifts and requests from Firestore, checked, so a broken document can't break a screen.
  And the live messages that pop up when someone else changes something, like
  "Your time off was approved" or "The rota for 9 – 15 Nov is out".
  Tested in tests/read.test.ts.
*/

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

export function readShift(id: string, d: Record<string, unknown>): Shift {
  return {
    id,
    staffId: text(d.staffId, 128),
    date: isIsoDate(text(d.date, 10)) ? text(d.date, 10) : "1970-01-01",
    start: isTime(text(d.start, 5)) ? text(d.start, 5) : "09:00",
    end: isTime(text(d.end, 5)) ? text(d.end, 5) : "17:00",
    breakMins: Math.min(240, Math.max(0, Math.round(num(d.breakMins)))),
    note: text(d.note, 40),
    published: d.published === true,
    createdAt: num(d.createdAt),
    clockIn: typeof d.clockIn === "number" ? d.clockIn : null,
    clockOut: typeof d.clockOut === "number" ? d.clockOut : null,
  };
}

export function readNotice(id: string, d: Record<string, unknown>): Notice {
  return {
    id,
    text: text(d.text, 300),
    by: text(d.by, 128),
    createdAt: num(d.createdAt),
    readBy: Array.isArray(d.readBy) ? d.readBy.filter((x): x is string => typeof x === "string") : [],
  };
}

/** "New notice from Ammara: Stock take on Friday" for notices someone else posted */
export function noticeChanges(before: Notice[], after: Notice[], me: string, team: Pick<Team, "members">) {
  const had = new Set(before.map((n) => n.id));
  return after
    .filter((n) => !had.has(n.id) && n.by !== me)
    .slice(0, 2)
    .map((n) => `New notice from ${team.members[n.by]?.name || "a manager"}: ${n.text.length > 60 ? `${n.text.slice(0, 57)}…` : n.text}`);
}

const KINDS: RequestKind[] = ["off", "giveaway"];
const STATUSES: RequestStatus[] = ["pending", "approved", "declined", "cancelled"];

export function readRequest(id: string, d: Record<string, unknown>): ShiftRequest {
  return {
    id,
    kind: KINDS.includes(d.kind as RequestKind) ? (d.kind as RequestKind) : "off",
    by: text(d.by, 128),
    from: text(d.from, 10),
    to: text(d.to, 10),
    shiftId: text(d.shiftId, 128),
    takerId: text(d.takerId, 128),
    note: text(d.note, 200),
    status: STATUSES.includes(d.status as RequestStatus) ? (d.status as RequestStatus) : "pending",
    decidedBy: text(d.decidedBy, 128),
    createdAt: num(d.createdAt),
    decidedAt: typeof d.decidedAt === "number" ? d.decidedAt : null,
  };
}

/** Messages about shifts someone else changed: new rotas going out, and your own shifts moving */
export function shiftChanges(before: Shift[], after: Shift[], me: string) {
  const out: string[] = [];
  const old = new Map(before.map((s) => [s.id, s]));
  const newlyOut = new Set<string>();
  for (const s of after) {
    const was = old.get(s.id);
    if (s.published && (!was || !was.published)) newlyOut.add(weekStart(s.date));
    else if (was && s.staffId === me && was.staffId === me && (was.date !== s.date || was.start !== s.start || was.end !== s.end)) out.push(`Your shift on ${dayLabel(s.date)} changed to ${s.start} – ${s.end}`);
    else if (was && s.staffId === me && was.staffId !== me) out.push(`You've got a shift on ${dayLabel(s.date)}, ${s.start} – ${s.end}`);
  }
  for (const monday of [...newlyOut].sort()) out.unshift(`The rota for ${weekLabel(monday)} is out`);
  return out.slice(0, 3);
}

/** Messages about requests someone else changed */
export function requestChanges(before: ShiftRequest[], after: ShiftRequest[], me: string, team: Pick<Team, "members" | "managerIds">) {
  const out: string[] = [];
  const name = (id: string) => team.members[id]?.name || "Someone";
  const manager = team.managerIds.includes(me);
  const old = new Map(before.map((r) => [r.id, r]));
  for (const r of after) {
    const was = old.get(r.id);
    if (!was) {
      if (r.by === me) continue;
      if (r.kind === "off" && manager) out.push(`${name(r.by)} asked for time off: ${datesLabel(r.from, r.to)}`);
      if (r.kind === "giveaway") out.push(`${name(r.by)} is giving away a shift. See Requests.`);
      continue;
    }
    if (was.status === "pending" && r.status !== "pending" && r.by === me && r.decidedBy !== me) {
      if (r.status === "approved") out.push(r.kind === "off" ? "Your time off was approved" : "Your shift was handed over");
      if (r.status === "declined") out.push(r.kind === "off" ? "Your time off was declined" : "Your shift giveaway was declined");
    }
    if (was.status === "pending" && r.status === "approved" && r.takerId === me && r.kind === "giveaway") out.push(`The shift is yours now. Thanks for taking it!`);
    if (!was.takerId && r.takerId && r.takerId !== me && (r.by === me || manager)) out.push(`${name(r.takerId)} offered to take ${r.by === me ? "your" : `${name(r.by)}'s`} shift`);
  }
  return out.slice(0, 3);
}
