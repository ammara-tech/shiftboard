import type { Member, Team } from "@/lib/types";
import { ALPHABET } from "@/lib/invite";

/*
  Who can do what in a team.
  - Managers build the rota, publish it, approve or decline requests, see pay rates and hours
    for everyone, invite people and remove staff. A team always has at least one manager.
  - Staff see the published rota, their own hours, and ask for time off or to give a shift away.
  - People added by name ("extras") can be put on the rota before they have an account. When
    they join with the invite link, a manager links them up and their shifts carry over.
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

export type Person = Member & { id: string; manager: boolean; extra: boolean };

/** Everyone in the team: managers first, then by name, then people added by name who haven't joined yet */
export function people(team: Pick<Team, "memberIds" | "members" | "managerIds" | "extras">): Person[] {
  const joined = team.memberIds
    .map((id) => ({ id, ...(team.members[id] ?? { name: "Someone", joinedAt: 0 }), manager: team.managerIds.includes(id), extra: false }))
    .sort((a, b) => Number(b.manager) - Number(a.manager) || a.name.localeCompare(b.name));
  const added = Object.entries(team.extras ?? {})
    .map(([id, x]) => ({ id, name: x.name, role: x.role ?? "", joinedAt: x.addedAt, manager: false, extra: true }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...joined, ...added];
}

/** Everyone who can be put on the rota: people in the team and people added by name */
export const rotaIds = (team: Pick<Team, "memberIds" | "extras">) => [...team.memberIds, ...Object.keys(team.extras ?? {})];

/** Someone's name, whether they've joined or were added by name */
export function personName(team: Pick<Team, "members" | "extras">, id: string) {
  return team.members[id]?.name || team.extras?.[id]?.name || "Someone";
}

/** An id for someone added by name. It starts with "x-", so it can never be mistaken for an account. */
export function makeExtraId(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  return "x-" + [...random(10)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Who a person added by name could be linked to: everyone who has joined, newest first (they've usually just joined) */
export function linkCandidates(team: Pick<Team, "memberIds" | "members">) {
  return team.memberIds
    .map((id) => ({ id, name: team.members[id]?.name || "Someone", joinedAt: team.members[id]?.joinedAt ?? 0 }))
    .sort((a, b) => b.joinedAt - a.joinedAt);
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
