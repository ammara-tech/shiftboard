import { dayLabel } from "@/lib/rota";
import type { Shift, ShiftRequest } from "@/lib/types";

/*
  Requests: time off, and giving a shift away.

  Time off: you choose the first and last day and add a note. A manager approves or declines.
  Approved time off shows on the rota, and the rota warns if you're booked that day.

  Giving a shift away: you offer one of your upcoming shifts. Anyone else in the team can say
  "I'll take it". A manager then approves, and the shift moves to them; or declines, and it stays
  yours. You can cancel while it's waiting.
  Tested in tests/requests.test.ts.
*/

export const MAX_NOTE = 200;

/** Pending first (oldest first, so nothing waits forever), then decided ones (newest first) */
export function sortRequests(requests: ShiftRequest[]) {
  const pending = requests.filter((r) => r.status === "pending").sort((a, b) => a.createdAt - b.createdAt);
  const done = requests.filter((r) => r.status !== "pending").sort((a, b) => (b.decidedAt ?? b.createdAt) - (a.decidedAt ?? a.createdAt));
  return [...pending, ...done];
}

/** What a manager needs to act on: time off waiting, and giveaways someone has offered to take */
export function needsManager(requests: ShiftRequest[]) {
  return requests.filter((r) => r.status === "pending" && (r.kind === "off" || r.takerId !== ""));
}

/** Shifts other people want to give away that you could take (not yours, nobody has offered yet, not in the past) */
export function shiftsUpForGrabs(requests: ShiftRequest[], shifts: Shift[], me: string, today: string) {
  return requests.filter((r) => {
    if (r.kind !== "giveaway" || r.status !== "pending" || r.by === me || r.takerId) return false;
    const shift = shifts.find((s) => s.id === r.shiftId);
    return Boolean(shift && shift.date >= today);
  });
}

/** Is there already a request waiting for this shift? (So it can't be offered twice.) */
export const alreadyOffered = (shiftId: string, requests: ShiftRequest[]) =>
  requests.some((r) => r.kind === "giveaway" && r.shiftId === shiftId && r.status === "pending");

/** "Mon 9 Nov" or "Mon 9 Nov – Wed 11 Nov" */
export function datesLabel(from: string, to: string) {
  return from === to ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}`;
}

/** How many days a time-off request covers (both ends included) */
export function daysCovered(from: string, to: string) {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.round(ms / 86400000) + 1;
}

/** Checks a time-off request before it's sent; returns what's wrong, or null if it's fine */
export function timeOffProblem(from: string, to: string, today: string) {
  if (!from || !to) return "Choose the first and last day.";
  if (to < from) return "The last day can't be before the first day.";
  if (from < today) return "Time off has to start today or later.";
  if (daysCovered(from, to) > 60) return "Ask for at most 60 days at a time.";
  return null;
}

export const statusWords: Record<ShiftRequest["status"], string> = {
  pending: "Waiting",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
};
