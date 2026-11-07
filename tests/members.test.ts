import { describe, expect, it } from "vitest";
import { colourFor, defaultName, initials, memberList, nameFor } from "@/lib/members";

const team = {
  memberIds: ["thabo", "me", "lerato"],
  members: { thabo: { name: "Thabo", joinedAt: 1 }, me: { name: "Ammara", joinedAt: 3 }, lerato: { name: "Lerato Dlamini", joinedAt: 2 } },
};

describe("people in a team", () => {
  it("starts with the first name from Google, or the start of the email", () => {
    expect(defaultName({ displayName: "Ammara Badat", email: "x@y.com" })).toBe("Ammara");
    expect(defaultName({ displayName: null, email: "lerato.dlamini@example.com" })).toBe("Lerato");
    expect(defaultName({})).toBe("Me");
  });

  it("calls you You, and someone who left Someone", () => {
    expect(nameFor("me", team, "me")).toBe("You");
    expect(nameFor("lerato", team, "me")).toBe("Lerato Dlamini");
    expect(nameFor("gone", team, "me")).toBe("Someone");
    expect(nameFor(null, team, "me")).toBe("Someone");
  });

  it("makes initials", () => {
    expect(initials("Lerato Dlamini")).toBe("LD");
    expect(initials("Thabo")).toBe("T");
    expect(initials("  ")).toBe("?");
  });

  it("gives each person the same colour every time", () => {
    expect(colourFor("lerato")).toBe(colourFor("lerato"));
    expect(colourFor("lerato")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("lists you first, then everyone in the order they joined", () => {
    expect(memberList(team, "me").map((m) => m.id)).toEqual(["me", "thabo", "lerato"]);
  });
});
