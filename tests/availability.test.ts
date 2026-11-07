import { describe, expect, it } from "vitest";
import { describeUnavailable, isValidUnavailable, unavailableDuring, withUnavailable, withoutUnavailable } from "@/lib/availability";
import { clashes } from "@/lib/rota";
import type { Shift } from "@/lib/types";

const shift = (s: Partial<Shift>): Shift => ({ id: "s1", staffId: "thabo", date: "2026-11-09", start: "08:00", end: "16:00", breakMins: 0, note: "", published: true, createdAt: 0, ...s }); // 9 Nov 2026 is a Monday
const mondays = { day: 0, from: "", to: "" };
const evenings = { day: 4, from: "17:00", to: "23:59" }; // Fridays after five

describe("when people can't work", () => {
  it("is described the way people say it", () => {
    expect(describeUnavailable(mondays)).toBe("Mondays, all day");
    expect(describeUnavailable(evenings)).toBe("Fridays, 17:00 – 23:59");
  });

  it("only accepts times that make sense", () => {
    expect(isValidUnavailable(mondays)).toBe(true);
    expect(isValidUnavailable(evenings)).toBe(true);
    expect(isValidUnavailable({ day: 4, from: "18:00", to: "17:00" })).toBe(false);
    expect(isValidUnavailable({ day: 7, from: "", to: "" })).toBe(false);
  });

  it("keeps the list in order, with no repeats, and can remove one", () => {
    const list = withUnavailable(withUnavailable([evenings], mondays), mondays);
    expect(list).toEqual([mondays, evenings]);
    expect(withoutUnavailable(list, 0)).toEqual([evenings]);
  });

  it("finds a shift that falls in a time someone can't work", () => {
    const member = { unavailable: [mondays, evenings] };
    expect(unavailableDuring(member, shift({}))).toEqual(mondays);
    expect(unavailableDuring(member, shift({ date: "2026-11-13", start: "12:00", end: "18:00" }))).toEqual(evenings); // runs into Friday evening
    expect(unavailableDuring(member, shift({ date: "2026-11-13", start: "08:00", end: "17:00" }))).toBeNull(); // ends as the evening starts
    expect(unavailableDuring(member, shift({ date: "2026-11-10" }))).toBeNull(); // Tuesday is fine
    expect(unavailableDuring(undefined, shift({}))).toBeNull();
  });

  it("shows up as a clash on the rota", () => {
    const found = clashes([shift({})], [], () => "Thabo", { thabo: { unavailable: [mondays] } });
    expect(found).toEqual([{ kind: "unavailable", shiftId: "s1", text: "Thabo can't work then (Mondays, all day)" }]);
  });
});
