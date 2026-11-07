import { describe, expect, it } from "vitest";
import { alreadyOffered, datesLabel, daysCovered, needsManager, shiftsUpForGrabs, sortRequests, timeOffProblem } from "@/lib/requests";
import type { Shift, ShiftRequest } from "@/lib/types";

const req = (r: Partial<ShiftRequest>): ShiftRequest => ({ id: "r", kind: "off", by: "thabo", from: "2026-11-10", to: "2026-11-10", shiftId: "", takerId: "", note: "", status: "pending", decidedBy: "", createdAt: 0, decidedAt: null, ...r });
const shift = (s: Partial<Shift>): Shift => ({ id: "s1", staffId: "thabo", date: "2026-11-12", start: "08:00", end: "16:00", breakMins: 0, note: "", published: true, createdAt: 0, ...s });

describe("requests", () => {
  it("lists waiting ones first (oldest first), then decided ones (newest first)", () => {
    const list = [req({ id: "a", status: "approved", decidedAt: 5 }), req({ id: "b", createdAt: 9 }), req({ id: "c", createdAt: 2 }), req({ id: "d", status: "declined", decidedAt: 8 })];
    expect(sortRequests(list).map((r) => r.id)).toEqual(["c", "b", "d", "a"]);
  });

  it("shows managers only what they can act on", () => {
    const list = [req({ id: "off" }), req({ id: "nobody", kind: "giveaway", shiftId: "s1" }), req({ id: "taken", kind: "giveaway", shiftId: "s1", takerId: "lerato" }), req({ id: "old", status: "approved" })];
    expect(needsManager(list).map((r) => r.id)).toEqual(["off", "taken"]);
  });

  it("offers other people's shifts to take, but not your own, taken ones or past ones", () => {
    const shifts = [shift({ id: "s1" }), shift({ id: "past", date: "2026-11-01" })];
    const list = [
      req({ id: "mine", kind: "giveaway", shiftId: "s1", by: "lerato" }),
      req({ id: "open", kind: "giveaway", shiftId: "s1" }),
      req({ id: "taken", kind: "giveaway", shiftId: "s1", takerId: "sipho" }),
      req({ id: "past", kind: "giveaway", shiftId: "past" }),
    ];
    expect(shiftsUpForGrabs(list, shifts, "lerato", "2026-11-09").map((r) => r.id)).toEqual(["open"]);
  });

  it("stops a shift being offered twice", () => {
    expect(alreadyOffered("s1", [req({ kind: "giveaway", shiftId: "s1" })])).toBe(true);
    expect(alreadyOffered("s1", [req({ kind: "giveaway", shiftId: "s1", status: "cancelled" })])).toBe(false);
  });
});

describe("time off", () => {
  it("is labelled and counted with both days included", () => {
    expect(datesLabel("2026-11-10", "2026-11-10")).toBe("Tue 10 Nov");
    expect(datesLabel("2026-11-10", "2026-11-12")).toBe("Tue 10 Nov – Thu 12 Nov");
    expect(daysCovered("2026-11-10", "2026-11-12")).toBe(3);
  });

  it("is checked before it's sent", () => {
    expect(timeOffProblem("", "", "2026-11-07")).toBe("Choose the first and last day.");
    expect(timeOffProblem("2026-11-12", "2026-11-10", "2026-11-07")).toBe("The last day can't be before the first day.");
    expect(timeOffProblem("2026-11-01", "2026-11-02", "2026-11-07")).toBe("Time off has to start today or later.");
    expect(timeOffProblem("2026-11-10", "2027-03-01", "2026-11-07")).toBe("Ask for at most 60 days at a time.");
    expect(timeOffProblem("2026-11-10", "2026-11-12", "2026-11-07")).toBeNull();
  });
});
