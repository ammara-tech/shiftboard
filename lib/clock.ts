import type { Shift } from "@/lib/types";

/*
  Clocking in and out. On the day of a shift, the person working it presses "Clock in" when
  they arrive and "Clock out" when they leave. The times come from their phone's clock, and
  firestore.rules only accepts a time within a few minutes of Google's own clock, so nobody can
  clock in for yesterday. Managers can correct the times afterwards.

  Hours (lib/hours.ts) use the clocked times when a shift has both, and the rota's times
  otherwise. Arriving more than 5 minutes after the start counts as late.
  Tested in tests/clock.test.ts.
*/

export const EARLY_MINUTES = 30; // you can clock in up to 30 minutes before the shift starts
export const LATE_GRACE_MINUTES = 5;

/** A date and time on the rota, in the phone's own time zone, as milliseconds */
export function localTime(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
}

/** When a shift starts and ends (a shift ending earlier than it starts ends the next day) */
export function shiftWindow(s: Pick<Shift, "date" | "start" | "end">) {
  const start = localTime(s.date, s.start);
  let end = localTime(s.date, s.end);
  if (end <= start) end += 24 * 60 * 60 * 1000;
  return { start, end };
}

export const isClockedIn = (s: Pick<Shift, "clockIn" | "clockOut">) => typeof s.clockIn === "number" && typeof s.clockOut !== "number";

/** Can you clock in now? From 30 minutes before the start until the end, and only once. */
export function canClockIn(s: Shift, now: number) {
  if (typeof s.clockIn === "number") return false;
  const w = shiftWindow(s);
  return now >= w.start - EARLY_MINUTES * 60000 && now <= w.end;
}

/** The shift you can clock in or out of right now: one you're clocked into, or one about to start */
export function clockableShift(shifts: Shift[], uid: string, now: number) {
  const mine = shifts.filter((s) => s.staffId === uid && s.published);
  return mine.find(isClockedIn) ?? mine.find((s) => canClockIn(s, now)) ?? null;
}

/** Paid minutes actually worked (clocked time minus the break), or null if it wasn't clocked */
export function workedMinutes(s: Pick<Shift, "clockIn" | "clockOut" | "breakMins">) {
  if (typeof s.clockIn !== "number" || typeof s.clockOut !== "number") return null;
  return Math.max(0, Math.round((s.clockOut - s.clockIn) / 60000) - s.breakMins);
}

/** How many minutes late someone clocked in (0 if on time or within 5 minutes' grace) */
export function minutesLate(s: Shift) {
  if (typeof s.clockIn !== "number") return 0;
  const late = Math.round((s.clockIn - shiftWindow(s).start) / 60000);
  return late > LATE_GRACE_MINUTES ? late : 0;
}

/** "08:03", in the phone's time zone */
export function clockTime(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** For a manager correcting a time: "08:03" on the shift's day (or the next day, for the end of a night shift) */
export function correctedTime(s: Pick<Shift, "date" | "start" | "end">, time: string, isEnd: boolean) {
  let ms = localTime(s.date, time);
  if (isEnd && ms <= localTime(s.date, s.start) && s.end <= s.start) ms += 24 * 60 * 60 * 1000;
  return ms;
}
