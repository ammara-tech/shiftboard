import { describe, expect, it } from "vitest";
import { canLeave, canStepDown, isManager, linkCandidates, makeExtraId, people, personName, rotaIds, teamChanges } from "@/lib/team";

const team = {
  managerIds: ["me"],
  memberIds: ["me", "thabo", "lerato"],
  members: { me: { name: "Ammara", joinedAt: 1 }, thabo: { name: "Thabo", joinedAt: 2, role: "Barista" }, lerato: { name: "Lerato", joinedAt: 3 } },
};

describe("managers and staff", () => {
  it("knows who manages the team", () => {
    expect(isManager(team, "me")).toBe(true);
    expect(isManager(team, "thabo")).toBe(false);
    expect(isManager(null, "me")).toBe(false);
  });

  it("never leaves a team without a manager", () => {
    expect(canLeave(team, "me")).toBe(false); // the only manager, with staff still there
    expect(canLeave(team, "thabo")).toBe(true);
    expect(canLeave({ ...team, managerIds: ["me", "thabo"] }, "me")).toBe(true);
    expect(canLeave({ managerIds: ["me"], memberIds: ["me"] }, "me")).toBe(true); // the last person
    expect(canStepDown(team, "me")).toBe(false);
    expect(canStepDown({ managerIds: ["me", "thabo"] }, "me")).toBe(true);
  });

  it("lists managers first, then everyone by name", () => {
    expect(people(team).map((p) => [p.name, p.manager])).toEqual([
      ["Ammara", true],
      ["Lerato", false],
      ["Thabo", false],
    ]);
  });
});

describe("people added by name", () => {
  const withExtras = { ...team, extras: { "x-AAA": { name: "Zanele", role: "Waiter", addedAt: 9 } } };

  it("come after everyone who has joined, and can be put on the rota", () => {
    expect(people(withExtras).map((p) => [p.name, p.extra])).toEqual([
      ["Ammara", false],
      ["Lerato", false],
      ["Thabo", false],
      ["Zanele", true],
    ]);
    expect(rotaIds(withExtras)).toEqual(["me", "thabo", "lerato", "x-AAA"]);
    expect(personName(withExtras, "x-AAA")).toBe("Zanele");
    expect(personName(withExtras, "gone")).toBe("Someone");
  });

  it("get an id that can't be mistaken for an account", () => {
    const id = makeExtraId(() => new Uint8Array(10));
    expect(id).toBe("x-AAAAAAAAAA");
    expect(makeExtraId()).toMatch(/^x-[A-Z2-9]{10}$/);
  });

  it("are linked to the newest people first, since they've usually just joined", () => {
    expect(linkCandidates(team).map((c) => c.name)).toEqual(["Lerato", "Thabo", "Ammara"]);
  });
});

describe("live messages about the team", () => {
  it("says who joined, and when you become or stop being a manager", () => {
    const joined = { ...team, memberIds: [...team.memberIds, "sipho"], members: { ...team.members, sipho: { name: "Sipho", joinedAt: 4 } } };
    expect(teamChanges(team, joined, "me")).toEqual(["Sipho joined the team"]);
    expect(teamChanges(team, { ...team, managerIds: ["me", "thabo"] }, "thabo")).toEqual(["You're now a manager"]);
    expect(teamChanges({ ...team, managerIds: ["me", "thabo"] }, team, "thabo")).toEqual(["You're no longer a manager"]);
  });

  it("says nothing the first time, or about yourself joining", () => {
    expect(teamChanges(null, team, "me")).toEqual([]);
    expect(teamChanges({ ...team, memberIds: ["me", "thabo"] }, team, "lerato")).toEqual([]);
  });
});
