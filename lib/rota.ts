import type { Shift, ShiftRequest } from "@/lib/types";

/*
  The rota's arithmetic: weeks, shift lengths, clashes and copying a week.
  Everything here is plain functions with no Firebase, so the tests can check it all
  (tests/rota.test.ts).

  A week runs Monday to Sunday, the way most South African rotas are written.
  Dates are "YYYY-MM-DD" strings and are worked out in UTC, so they never shift by a day
  because of a phone's time zone or daylight saving.
*/

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && toIso(toDate(s)) === s;
export const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Today's date where the phone is, as "YYYY-MM-DD" */
export function todayIso(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number) {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** The Monday of the week a date is in */
export function weekStart(iso: string) {
  const day = (toDate(iso).getUTCDay() + 6) % 7; // Monday = 0 … Sunday = 6
  return addDays(iso, -day);
}

/** The seven dates of the week that starts on `monday` */
export function weekDays(monday: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** "Mon 9 Nov" */
export function dayLabel(iso: string) {
  const d = toDate(iso);
  return `${DAY_NAMES[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "9 – 15 Nov 2026", or "30 Nov – 6 Dec 2026" across a month */
export function weekLabel(monday: string) {
  const a = toDate(monday);
  const b = toDate(addDays(monday, 6));
  const end = `${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()} – ${end}` : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${end}`;
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** How long a shift lasts, in minutes, before the break. A shift ending earlier than it starts ends after midnight. */
export function spanMinutes(start: string, end: string) {
  const span = minutesOf(end) - minutesOf(start);
  return span > 0 ? span : span + 24 * 60;
}

/** Paid minutes: the shift's length minus the unpaid break (never below 0) */
export function paidMinutes(shift: Pick<Shift, "start" | "end" | "breakMins">) {
  return Math.max(0, spanMinutes(shift.start, shift.end) - shift.breakMins);
}

/** "7h 30m", "8h", "45m" */
export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m}m`;
}

/** "08:00 – 16:30" */
export const shiftTimes = (s: Pick<Shift, "start" | "end">) => `${s.start} – ${s.end}`;

/** When a shift starts and ends, as minutes from the start of its own day (the end can pass midnight) */
function window(s: Pick<Shift, "date" | "start" | "end">) {
  const day = toDate(s.date).getTime() / 60000;
  const start = day + minutesOf(s.start);
  return { start, end: start + spanMinutes(s.start, s.end) };
}

/** Do two shifts overlap in time? (Back to back, like 08:00–12:00 and 12:00–16:00, is fine.) */
export function overlaps(a: Pick<Shift, "date" | "start" | "end">, b: Pick<Shift, "date" | "start" | "end">) {
  const x = window(a);
  const y = window(b);
  return x.start < y.end && y.start < x.end;
}

/** Is this person on approved time off on this date? */
export function onTimeOff(staffId: string, date: string, requests: ShiftRequest[]) {
  return requests.some((r) => r.kind === "off" && r.status === "approved" && r.by === staffId && r.from <= date && date <= r.to);
}

export type Clash = { kind: "double" | "timeOff"; shiftId: string; text: string };

/**
 * Problems with the rota, for warnings on the shifts: the same person booked on two shifts that
 * overlap, or booked on a day they have approved time off. Open shifts can't clash.
 */
export function clashes(shifts: Shift[], requests: ShiftRequest[], nameOf: (id: string) => string): Clash[] {
  const out: Clash[] = [];
  const booked = shifts.filter((s) => s.staffId);
  for (const s of booked) {
    const other = booked.find((o) => o.id !== s.id && o.staffId === s.staffId && overlaps(s, o));
    if (other) out.push({ kind: "double", shiftId: s.id, text: `${nameOf(s.staffId)} is also on ${shiftTimes(other)} that day` });
    if (onTimeOff(s.staffId, s.date, requests)) out.push({ kind: "timeOff", shiftId: s.id, text: `${nameOf(s.staffId)} has time off that day` });
  }
  return out;
}

/** Shifts in a week, in order: by day, then start time */
export function shiftsInWeek(shifts: Shift[], monday: string) {
  const end = addDays(monday, 6);
  return shifts.filter((s) => s.date >= monday && s.date <= end).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

/**
 * "Copy last week": the shifts of the week before, moved forward 7 days, as drafts.
 * Shifts for people who've left become open shifts, and a shift is skipped if the same person
 * already has one that overlaps it in the new week (so pressing it twice doesn't double up).
 */
export function copyWeek(shifts: Shift[], fromMonday: string, staffIds: string[]): Omit<Shift, "id" | "createdAt">[] {
  const toMonday = addDays(fromMonday, 7);
  const already = shiftsInWeek(shifts, toMonday);
  return shiftsInWeek(shifts, fromMonday)
    .map((s) => ({
      staffId: staffIds.includes(s.staffId) ? s.staffId : "",
      date: addDays(s.date, 7),
      start: s.start,
      end: s.end,
      breakMins: s.breakMins,
      note: s.note,
      published: false,
    }))
    .filter((s) => !already.some((a) => a.staffId === s.staffId && a.date === s.date && a.start === s.start && a.end === s.end));
}

/** A person's shifts from today on, soonest first (for "My shifts") */
export function upcomingFor(staffId: string, shifts: Shift[], today: string) {
  return shifts.filter((s) => s.staffId === staffId && s.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

/** The week's rota as a WhatsApp message, by day */
export function weekMessage(teamName: string, monday: string, shifts: Shift[], nameOf: (id: string) => string) {
  const lines = [`📅 ${teamName} rota, ${weekLabel(monday)}`];
  for (const day of weekDays(monday)) {
    const today = shifts.filter((s) => s.date === day).sort((a, b) => a.start.localeCompare(b.start));
    if (today.length === 0) continue;
    lines.push("", `*${dayLabel(day)}*`);
    for (const s of today) lines.push(`• ${shiftTimes(s)} ${s.staffId ? nameOf(s.staffId) : "Open shift"}${s.note ? ` (${s.note})` : ""}`);
  }
  if (lines.length === 1) lines.push("", "No shifts this week.");
  return lines.join("\n");
}

/* ---------- Adding a shift to your phone's calendar (.ics) ---------- */

const icsText = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
const icsTime = (date: string, time: string) => `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;

/**
 * A calendar file for your shifts, which phones open in their calendar app.
 * Times are "floating" (no time zone), so 08:00 stays 08:00 on any phone.
 */
export function calendarFile(teamName: string, shifts: Shift[], now: Date) {
  const stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const events = shifts.map((s) => {
    const endDate = s.end <= s.start ? addDays(s.date, 1) : s.date;
    return [
      "BEGIN:VEVENT",
      `UID:${s.id}@shiftboard`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsTime(s.date, s.start)}`,
      `DTEND:${icsTime(endDate, s.end)}`,
      `SUMMARY:${icsText(`Shift at ${teamName}${s.note ? `: ${s.note}` : ""}`)}`,
      "END:VEVENT",
    ].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ShiftBoard//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n");
}
