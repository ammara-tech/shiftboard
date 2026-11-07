import { describe, expect, it } from "vitest";
import { canClockIn, clockableShift, clockTime, correctedTime, isClockedIn, localTime, minutesLate, shiftWindow, workedMinutes } from "@/lib/clock";
import type { Shift } from "@/lib/types";

const shift = (s: Partial<Shift>): Shift => ({ id: "s1", staffId: "me", date: "2026-11-09", start: "08:00", end: "16:00", breakMins: 30, note: "", published: true, createdAt: 0, clockIn: null, clockOut: null, ...s });
const at = (time: string, date = "2026-11-09") => localTime(date, time);

describe("clocking in", () => {
  it("opens 30 minutes before the shift and closes when it ends", () => {
    expect(canClockIn(shift({}), at("07:29"))).toBe(false);
    expect(canClockIn(shift({}), at("07:30"))).toBe(true);
    expect(canClockIn(shift({}), at("15:59"))).toBe(true);
    expect(canClockIn(shift({}), at("16:01"))).toBe(false);
    expect(canClockIn(shift({ clockIn: at("07:55") }), at("08:00"))).toBe(false); // only once
  });

  it("knows a night shift ends the next morning", () => {
    const night = shift({ start: "22:00", end: "06:00" });
    expect(shiftWindow(night).end - shiftWindow(night).start).toBe(8 * 3600000);
    expect(canClockIn(night, at("02:00", "2026-11-10"))).toBe(true);
  });

  it("finds the shift you're clocked into first, or the one about to start", () => {
    const now = at("07:45");
    const shifts = [shift({ id: "today" }), shift({ id: "other", staffId: "thabo" }), shift({ id: "draft", published: false })];
    expect(clockableShift(shifts, "me", now)?.id).toBe("today");
    const clockedIn = shift({ id: "yesterday", date: "2026-11-08", start: "22:00", end: "06:00", clockIn: at("22:00", "2026-11-08") });
    expect(clockableShift([...shifts, clockedIn], "me", now)?.id).toBe("yesterday");
    expect(isClockedIn(clockedIn)).toBe(true);
    expect(clockableShift(shifts, "me", at("20:00"))).toBeNull();
  });
});

describe("worked time", () => {
  it("is the clocked time minus the break", () => {
    expect(workedMinutes(shift({ clockIn: at("08:05"), clockOut: at("16:35") }))).toBe(480);
    expect(workedMinutes(shift({ clockIn: at("08:05") }))).toBeNull(); // not clocked out yet
  });

  it("counts late after 5 minutes' grace", () => {
    expect(minutesLate(shift({ clockIn: at("08:05") }))).toBe(0);
    expect(minutesLate(shift({ clockIn: at("08:17") }))).toBe(17);
    expect(minutesLate(shift({ clockIn: at("07:50") }))).toBe(0);
  });

  it("shows clock times, and lets a manager correct them", () => {
    expect(clockTime(at("08:03"))).toBe("08:03");
    const night = shift({ start: "22:00", end: "06:00" });
    expect(correctedTime(night, "05:50", true)).toBe(at("05:50", "2026-11-10")); // the end of a night shift is the next day
    expect(correctedTime(night, "22:05", false)).toBe(at("22:05"));
  });
});
