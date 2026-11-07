import { describe, expect, it } from "vitest";
import {
  addDays,
  calendarFile,
  clashes,
  copyWeek,
  dayLabel,
  formatMinutes,
  isIsoDate,
  isTime,
  onTimeOff,
  overlaps,
  paidMinutes,
  shiftsInWeek,
  spanMinutes,
  upcomingFor,
  weekDays,
  weekLabel,
  weekMessage,
  weekStart,
} from "@/lib/rota";
import type { Shift, ShiftRequest } from "@/lib/types";

let n = 0;
const shift = (s: Partial<Shift>): Shift => ({ id: `s${++n}`, staffId: "thabo", date: "2026-11-09", start: "08:00", end: "16:00", breakMins: 30, note: "", published: true, createdAt: n, ...s });
const off = (r: Partial<ShiftRequest>): ShiftRequest => ({ id: `r${++n}`, kind: "off", by: "thabo", from: "2026-11-10", to: "2026-11-11", shiftId: "", takerId: "", note: "", status: "approved", decidedBy: "me", createdAt: 0, decidedAt: 1, ...r });
const names: Record<string, string> = { thabo: "Thabo", lerato: "Lerato" };
const nameOf = (id: string) => names[id] ?? "Someone";

describe("weeks", () => {
  it("start on Monday, whatever day you give", () => {
    expect(weekStart("2026-11-09")).toBe("2026-11-09"); // a Monday
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // the Sunday after
    expect(weekStart("2026-11-12")).toBe("2026-11-09");
  });

  it("cross months and years correctly", () => {
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(weekDays("2026-11-30")).toEqual(["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]);
  });

  it("are labelled the way people write them", () => {
    expect(dayLabel("2026-11-09")).toBe("Mon 9 Nov");
    expect(weekLabel("2026-11-09")).toBe("9 – 15 Nov 2026");
    expect(weekLabel("2026-11-30")).toBe("30 Nov – 6 Dec 2026");
  });

  it("only accept real dates and times", () => {
    expect(isIsoDate("2026-02-29")).toBe(false); // 2026 isn't a leap year
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isTime("23:59")).toBe(true);
    expect(isTime("24:00")).toBe(false);
    expect(isTime("8:00")).toBe(false);
  });
});

describe("shift length", () => {
  it("takes off the unpaid break", () => {
    expect(paidMinutes({ start: "08:00", end: "16:30", breakMins: 30 })).toBe(480);
    expect(formatMinutes(480)).toBe("8h");
    expect(formatMinutes(450)).toBe("7h 30m");
    expect(formatMinutes(45)).toBe("45m");
  });

  it("handles a night shift that ends after midnight", () => {
    expect(spanMinutes("22:00", "06:00")).toBe(480);
    expect(paidMinutes({ start: "22:00", end: "06:00", breakMins: 60 })).toBe(420);
  });

  it("never goes below zero", () => {
    expect(paidMinutes({ start: "08:00", end: "08:30", breakMins: 60 })).toBe(0);
  });
});

describe("clashes", () => {
  it("spots the same person booked on two overlapping shifts", () => {
    const a = shift({ start: "08:00", end: "14:00" });
    const b = shift({ start: "12:00", end: "18:00" });
    const found = clashes([a, b], [], nameOf);
    expect(found.map((c) => c.shiftId)).toEqual([a.id, b.id]);
    expect(found[0].text).toBe("Thabo is also on 12:00 – 18:00 that day");
  });

  it("allows back-to-back shifts, and different people at the same time", () => {
    expect(overlaps(shift({ start: "08:00", end: "12:00" }), shift({ start: "12:00", end: "16:00" }))).toBe(false);
    expect(clashes([shift({}), shift({ staffId: "lerato" })], [], nameOf)).toEqual([]);
  });

  it("knows a night shift runs into the next morning", () => {
    expect(overlaps(shift({ date: "2026-11-09", start: "22:00", end: "06:00" }), shift({ date: "2026-11-10", start: "05:00", end: "09:00" }))).toBe(true);
  });

  it("warns when someone is booked on a day they have time off", () => {
    const s = shift({ date: "2026-11-10" });
    expect(clashes([s], [off({})], nameOf)).toEqual([{ kind: "timeOff", shiftId: s.id, text: "Thabo has time off that day" }]);
  });

  it("ignores time off that wasn't approved, and open shifts", () => {
    expect(onTimeOff("thabo", "2026-11-10", [off({ status: "pending" })])).toBe(false);
    expect(clashes([shift({ staffId: "", date: "2026-11-10" }), shift({ staffId: "", date: "2026-11-10" })], [off({})], nameOf)).toEqual([]);
  });
});

describe("copying last week", () => {
  const last = [shift({ date: "2026-11-02", note: "Opening" }), shift({ date: "2026-11-04", staffId: "gone" })];

  it("moves last week's shifts forward 7 days, as drafts", () => {
    const copied = copyWeek(last, "2026-11-02", ["thabo", "lerato"]);
    expect(copied.map((s) => [s.date, s.staffId, s.note, s.published])).toEqual([
      ["2026-11-09", "thabo", "Opening", false],
      ["2026-11-11", "", "", false], // someone who left: an open shift
    ]);
  });

  it("doesn't double up when the shift is already there", () => {
    // The new week already has the Monday shift (copied once before), so only the open one is added
    const withCopy = [...last, shift({ date: "2026-11-09", note: "Opening" })];
    expect(copyWeek(withCopy, "2026-11-02", ["thabo"]).map((s) => s.date)).toEqual(["2026-11-11"]);
  });
});

describe("your shifts and the week", () => {
  it("lists your shifts from today on, soonest first", () => {
    const shifts = [shift({ date: "2026-11-12" }), shift({ date: "2026-11-01" }), shift({ date: "2026-11-10", start: "06:00" }), shift({ date: "2026-11-10", staffId: "lerato" })];
    expect(upcomingFor("thabo", shifts, "2026-11-09").map((s) => s.date)).toEqual(["2026-11-10", "2026-11-12"]);
  });

  it("keeps only the week's shifts, in order", () => {
    const shifts = [shift({ date: "2026-11-16" }), shift({ date: "2026-11-10", start: "12:00" }), shift({ date: "2026-11-10", start: "07:00" })];
    expect(shiftsInWeek(shifts, "2026-11-09").map((s) => s.start)).toEqual(["07:00", "12:00"]);
  });

  it("writes the week for WhatsApp, by day", () => {
    const msg = weekMessage("Corner Café", "2026-11-09", [shift({ note: "Opening" }), shift({ staffId: "", start: "12:00", end: "18:00" })], nameOf);
    expect(msg.split("\n")[0]).toBe("📅 Corner Café rota, 9 – 15 Nov 2026");
    expect(msg).toContain("*Mon 9 Nov*\n• 08:00 – 16:00 Thabo (Opening)\n• 12:00 – 18:00 Open shift");
    expect(weekMessage("Corner Café", "2026-11-09", [], nameOf)).toContain("No shifts this week.");
  });

  it("makes a calendar file phones can open, with night shifts ending the next day", () => {
    const ics = calendarFile("Corner Café", [shift({ id: "a", date: "2026-11-09", start: "22:00", end: "06:00", note: "Night, stock take" })], new Date("2026-11-07T10:00:00Z"));
    expect(ics).toContain("DTSTART:20261109T220000");
    expect(ics).toContain("DTEND:20261110T060000");
    expect(ics).toContain("SUMMARY:Shift at Corner Café: Night\\, stock take");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });
});
