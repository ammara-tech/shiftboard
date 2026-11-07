import { describe, expect, it } from "vitest";
import { noticeChanges, readNotice, readRequest, readShift, requestChanges, shiftChanges } from "@/lib/read";
import type { Shift, ShiftRequest } from "@/lib/types";

const shift = (s: Partial<Shift>): Shift => ({ id: "s1", staffId: "me", date: "2026-11-09", start: "08:00", end: "16:00", breakMins: 30, note: "", published: true, createdAt: 0, ...s });
const req = (r: Partial<ShiftRequest>): ShiftRequest => ({ id: "r1", kind: "off", by: "thabo", from: "2026-11-10", to: "2026-11-10", shiftId: "", takerId: "", note: "", status: "pending", decidedBy: "", createdAt: 0, decidedAt: null, ...r });
const team = { managerIds: ["me"], members: { me: { name: "Ammara", joinedAt: 0 }, thabo: { name: "Thabo", joinedAt: 0 }, lerato: { name: "Lerato", joinedAt: 0 } } };

describe("reading from the database", () => {
  it("keeps good shifts as they are", () => {
    expect(readShift("s1", { staffId: "me", date: "2026-11-09", start: "08:00", end: "16:00", breakMins: 30, note: "Opening", published: true, createdAt: 5 })).toEqual({ id: "s1", staffId: "me", date: "2026-11-09", start: "08:00", end: "16:00", breakMins: 30, note: "Opening", published: true, createdAt: 5, clockIn: null, clockOut: null });
  });

  it("fixes broken values instead of breaking the page", () => {
    const s = readShift("x", { date: "Monday", start: "25:00", breakMins: 9999, published: "yes" });
    expect([s.date, s.start, s.end, s.breakMins, s.published, s.staffId]).toEqual(["1970-01-01", "09:00", "17:00", 240, false, ""]);
    const r = readRequest("y", { kind: "holiday", status: "maybe" });
    expect([r.kind, r.status, r.decidedAt]).toEqual(["off", "pending", null]);
  });
});

describe("messages about shifts", () => {
  it("says when a new week's rota goes out", () => {
    expect(shiftChanges([], [shift({}), shift({ id: "s2", staffId: "thabo" })], "me")).toEqual(["The rota for 9 – 15 Nov 2026 is out"]);
    expect(shiftChanges([shift({ published: false })], [shift({})], "me")).toEqual(["The rota for 9 – 15 Nov 2026 is out"]);
  });

  it("says when your shift moves, or a shift becomes yours", () => {
    expect(shiftChanges([shift({})], [shift({ start: "09:00" })], "me")).toEqual(["Your shift on Mon 9 Nov changed to 09:00 – 16:00"]);
    expect(shiftChanges([shift({ staffId: "thabo" })], [shift({})], "me")).toEqual(["You've got a shift on Mon 9 Nov, 08:00 – 16:00"]);
    expect(shiftChanges([shift({ staffId: "thabo" })], [shift({ staffId: "thabo", start: "10:00" })], "me")).toEqual([]);
  });
});

describe("messages about requests", () => {
  it("tells managers about new time-off requests, and everyone about shifts up for grabs", () => {
    expect(requestChanges([], [req({})], "me", team)).toEqual(["Thabo asked for time off: Tue 10 Nov"]);
    expect(requestChanges([], [req({})], "lerato", team)).toEqual([]);
    expect(requestChanges([], [req({ kind: "giveaway", shiftId: "s1" })], "lerato", team)).toEqual(["Thabo is giving away a shift. See Requests."]);
  });

  it("tells you when your request is decided", () => {
    expect(requestChanges([req({})], [req({ status: "approved", decidedBy: "me" })], "thabo", team)).toEqual(["Your time off was approved"]);
    expect(requestChanges([req({ kind: "giveaway" })], [req({ kind: "giveaway", status: "declined", decidedBy: "me" })], "thabo", team)).toEqual(["Your shift giveaway was declined"]);
  });

  it("tells you when someone offers to take your shift, and the taker when it's theirs", () => {
    const give = req({ kind: "giveaway", shiftId: "s1" });
    expect(requestChanges([give], [{ ...give, takerId: "lerato" }], "thabo", team)).toEqual(["Lerato offered to take your shift"]);
    expect(requestChanges([give], [{ ...give, takerId: "lerato" }], "me", team)).toEqual(["Lerato offered to take Thabo's shift"]);
    expect(requestChanges([{ ...give, takerId: "lerato" }], [{ ...give, takerId: "lerato", status: "approved", decidedBy: "me" }], "lerato", team)).toEqual(["The shift is yours now. Thanks for taking it!"]);
  });
});

describe("notices", () => {
  it("reads a notice, and announces new ones from other people", () => {
    const n = readNotice("n1", { text: "Stock take on Friday at 7", by: "me", createdAt: 5, readBy: ["thabo", 3] });
    expect(n).toEqual({ id: "n1", text: "Stock take on Friday at 7", by: "me", createdAt: 5, readBy: ["thabo"] });
    expect(noticeChanges([], [n], "thabo", team)).toEqual(["New notice from Ammara: Stock take on Friday at 7"]);
    expect(noticeChanges([], [n], "me", team)).toEqual([]);
    expect(noticeChanges([n], [n], "thabo", team)).toEqual([]);
  });
});
