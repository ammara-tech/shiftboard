import { describe, expect, it } from "vitest";
import { canLeave, canStepDown, isManager, people, teamChanges } from "@/lib/team";

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
