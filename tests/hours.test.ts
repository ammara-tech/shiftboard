import { describe, expect, it } from "vitest";
import { WEEKLY_LIMIT_MINUTES, decimalHours, hoursCsv, totals, weekHours } from "@/lib/hours";
import type { Shift } from "@/lib/types";
import { localTime } from "@/lib/clock";

let n = 0;
const shift = (s: Partial<Shift>): Shift => ({ id: `s${++n}`, staffId: "thabo", date: "2026-11-09", start: "08:00", end: "16:30", breakMins: 30, note: "", published: true, createdAt: n, ...s });
const nameOf = (id: string) => ({ thabo: "Thabo", lerato: "Lerato, Jnr" })[id] ?? "Someone";

describe("hours for a week", () => {
  const shifts = [
    shift({ date: "2026-11-09" }), // 8h
    shift({ date: "2026-11-10", start: "12:00", end: "16:00", breakMins: 0 }), // 4h
    shift({ date: "2026-11-11", staffId: "lerato" }), // 8h
    shift({ date: "2026-11-12", published: false }), // a draft: doesn't count yet
    shift({ date: "2026-11-16" }), // next week
    shift({ date: "2026-11-13", staffId: "" }), // an open shift: nobody's hours
  ];

  it("adds up each person's paid hours, per day", () => {
    const rows = weekHours(shifts, "2026-11-09", {});
    const thabo = rows.find((r) => r.staffId === "thabo")!;
    expect(thabo.minutes).toBe(720);
    expect(thabo.shifts).toBe(2);
    expect(thabo.perDay).toEqual([480, 240, 0, 0, 0, 0, 0]);
    expect(rows.map((r) => r.staffId).sort()).toEqual(["lerato", "thabo"]);
  });

  it("estimates pay from the rate per hour, and says when a rate is missing", () => {
    const rows = weekHours(shifts, "2026-11-09", { thabo: 3500 });
    expect(rows.find((r) => r.staffId === "thabo")!.pay).toBe(42000); // 12h × R35
    expect(rows.find((r) => r.staffId === "lerato")!.pay).toBeNull();
    expect(totals(rows)).toEqual({ minutes: 1200, pay: 42000, missingRates: 1 });
  });

  it("includes people with no shifts when asked, so everyone is listed", () => {
    expect(weekHours([], "2026-11-09", {}, ["sipho"])).toEqual([{ staffId: "sipho", shifts: 0, minutes: 0, perDay: [0, 0, 0, 0, 0, 0, 0], planned: 0, clocked: 0, late: 0, pay: null, overLimit: false }]);
  });

  it("flags more than 45 hours in a week", () => {
    const long = Array.from({ length: 6 }, (_, i) => shift({ date: `2026-11-${String(9 + i).padStart(2, "0")}` })); // 6 × 8h = 48h
    const [row] = weekHours(long, "2026-11-09", {});
    expect(row.minutes).toBeGreaterThan(WEEKLY_LIMIT_MINUTES);
    expect(row.overLimit).toBe(true);
  });
});

describe("the spreadsheet for payroll", () => {
  it("has a row per person, hours as decimals, and pay only when asked", () => {
    const rows = weekHours([shift({}), shift({ staffId: "lerato", date: "2026-11-10", end: "12:15", breakMins: 0 })], "2026-11-09", { thabo: 3500 });
    const csv = hoursCsv(rows, "2026-11-09", nameOf, true).split("\r\n");
    expect(csv[0]).toBe("Name,2026-11-09,2026-11-10,2026-11-11,2026-11-12,2026-11-13,2026-11-14,2026-11-15,Shifts,Hours,Planned hours,Late,Rate per hour (R),Estimated pay (R)");
    expect(csv[1]).toBe("Thabo,8.00,0.00,0.00,0.00,0.00,0.00,0.00,1,8.00,8.00,0,35.00,280.00");
    expect(csv[2]).toBe('"Lerato, Jnr",0.00,4.25,0.00,0.00,0.00,0.00,0.00,1,4.25,4.25,0,,'); // a comma in a name is quoted
    expect(hoursCsv(rows, "2026-11-09", nameOf, false).split("\r\n")[0]).not.toContain("pay");
  });

  it("writes hours the way spreadsheets add them", () => {
    expect(decimalHours(450)).toBe("7.50");
    expect(decimalHours(20)).toBe("0.33");
  });
});

describe("clocked hours", () => {
  it("uses the clocked times when someone clocked in and out, and keeps the rota's hours as planned", () => {
    const clocked = shift({ start: "08:00", end: "16:30", breakMins: 30, clockIn: localTime("2026-11-09", "08:12"), clockOut: localTime("2026-11-09", "17:12") });
    const [row] = weekHours([clocked], "2026-11-09", { thabo: 6000 });
    expect(row.minutes).toBe(510); // 9h clocked − 30m break
    expect(row.planned).toBe(480);
    expect(row.clocked).toBe(1);
    expect(row.late).toBe(1); // 12 minutes after the start
    expect(row.pay).toBe(51000); // 8.5h × R60
  });

  it("uses the rota's times when a shift wasn't clocked out", () => {
    const [row] = weekHours([shift({ clockIn: localTime("2026-11-09", "08:00") })], "2026-11-09", {});
    expect([row.minutes, row.clocked, row.late]).toEqual([480, 0, 0]);
  });
});
