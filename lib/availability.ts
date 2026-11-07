import { isTime } from "@/lib/rota";
import type { Member, Shift, Unavailable } from "@/lib/types";

/*
  Availability: the times each person can't work, every week, like "Mondays" or
  "weekdays after 17:00". Each person sets their own on the Team page; managers see everyone's,
  and the rota warns when a shift is booked in one of those times.
  Tested in tests/availability.test.ts.
*/

export const MAX_UNAVAILABLE = 14;
export const EVERY_DAY = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];

const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const dayOf = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0

export const isAllDay = (u: Unavailable) => !u.from && !u.to;

/** Is this a time that makes sense? (all day, or a from time before a to time) */
export function isValidUnavailable(u: Unavailable) {
  if (!Number.isInteger(u.day) || u.day < 0 || u.day > 6) return false;
  if (isAllDay(u)) return true;
  return isTime(u.from) && isTime(u.to) && u.from < u.to;
}

/** "Mondays, all day" or "Fridays, 17:00 – 23:59" */
export function describeUnavailable(u: Unavailable) {
  const day = EVERY_DAY[u.day];
  return isAllDay(u) ? `${day}, all day` : `${day}, ${u.from} – ${u.to}`;
}

/** Adds a time, keeping the list in order (Monday first, then by time) with no repeats */
export function withUnavailable(list: Unavailable[], u: Unavailable): Unavailable[] {
  const key = (x: Unavailable) => `${x.day}|${x.from}|${x.to}`;
  if (list.some((x) => key(x) === key(u))) return list;
  return [...list, u].sort((a, b) => a.day - b.day || a.from.localeCompare(b.from)).slice(0, MAX_UNAVAILABLE);
}

export function withoutUnavailable(list: Unavailable[], index: number) {
  return list.filter((_, i) => i !== index);
}

/**
 * The time this person can't work that a shift falls in, or null if it's fine.
 * A shift that runs past midnight is checked against the day it starts.
 */
export function unavailableDuring(member: Pick<Member, "unavailable"> | undefined, shift: Pick<Shift, "date" | "start" | "end">) {
  const day = dayOf(shift.date);
  const start = minutesOf(shift.start);
  const end = shift.end > shift.start ? minutesOf(shift.end) : 24 * 60;
  return (
    (member?.unavailable ?? []).find((u) => {
      if (u.day !== day) return false;
      if (isAllDay(u)) return true;
      return start < minutesOf(u.to) && minutesOf(u.from) < end;
    }) ?? null
  );
}
