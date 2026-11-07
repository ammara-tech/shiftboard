import type { Member, Team } from "@/lib/types";

/*
  Who can do what in a team.
  - Managers build the rota, publish it, approve or decline requests, see pay rates and hours
    for everyone, invite people and remove staff. A team always has at least one manager.
  - Staff see the published rota, their own hours, and ask for time off or to give a shift away.
  firestore.rules checks the same things on Google's servers.
  Tested in tests/team.test.ts.
*/

export const MAX_MEMBERS = 50;

export const isManager = (team: Pick<Team, "managerIds"> | null, uid: string | null) => Boolean(team && uid && team.managerIds.includes(uid));

/** Can this manager leave? Only if someone else is still a manager, or they're the last person in the team. */
export function canLeave(team: Pick<Team, "managerIds" | "memberIds">, uid: string) {
  if (!team.managerIds.includes(uid)) return true;
  return team.memberIds.length === 1 || team.managerIds.some((id) => id !== uid);
}

/** Can a manager stop being one? Not if they're the last manager. */
export const canStepDown = (team: Pick<Team, "managerIds">, uid: string) => team.managerIds.includes(uid) && team.managerIds.length > 1;

export type Person = Member & { id: string; manager: boolean };

/** Everyone in the team: managers first, then by name */
export function people(team: Pick<Team, "memberIds" | "members" | "managerIds">): Person[] {
  return team.memberIds
    .map((id) => ({ id, ...(team.members[id] ?? { name: "Someone", joinedAt: 0 }), manager: team.managerIds.includes(id) }))
    .sort((a, b) => Number(b.manager) - Number(a.manager) || a.name.localeCompare(b.name));
}

/**
 * Messages for changes to the team that someone else made, shown as they happen:
 * "Thabo joined the team", "You're now a manager".
 */
export function teamChanges(before: Pick<Team, "memberIds" | "members" | "managerIds"> | null, after: Pick<Team, "memberIds" | "members" | "managerIds">, me: string) {
  if (!before) return [];
  const out: string[] = [];
  for (const id of after.memberIds) {
    if (id !== me && !before.memberIds.includes(id)) out.push(`${after.members[id]?.name || "Someone"} joined the team`);
  }
  if (after.managerIds.includes(me) && !before.managerIds.includes(me)) out.push("You're now a manager");
  if (!after.managerIds.includes(me) && before.managerIds.includes(me)) out.push("You're no longer a manager");
  return out;
}
