import type { Team } from "@/lib/types";

/* Names, initials and colours for the people in a team */

export const MAX_NAME = 30;

/** A starting name from the sign-in: the Google name, or the start of the email address */
export function defaultName(user: { displayName?: string | null; email?: string | null }) {
  const fromGoogle = user.displayName?.trim().split(/\s+/)[0];
  if (fromGoogle) return fromGoogle.slice(0, MAX_NAME);
  const local = user.email?.split("@")[0]?.split(/[._+-]/)[0] ?? "";
  return local ? (local[0].toUpperCase() + local.slice(1)).slice(0, MAX_NAME) : "Me";
}

/** "You" for yourself, the member's name for others, "Someone" for a person who has left */
export function nameFor(uid: string | null | undefined, team: Pick<Team, "members"> | null, me: string) {
  if (!uid) return "Someone";
  if (uid === me) return "You";
  return team?.members[uid]?.name || "Someone";
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

// Each person keeps the same colour on every phone, worked out from their account ID
const COLOURS = ["#2f7d4f", "#b8473f", "#4a7fb8", "#475569", "#7a5aa6", "#c25a87", "#3c8ea0", "#c0812b"];

export function colourFor(uid: string) {
  let h = 0;
  for (const c of uid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLOURS[h % COLOURS.length];
}

/** Members in the order they joined, you first */
export function memberList(team: Pick<Team, "memberIds" | "members">, me: string) {
  return team.memberIds
    .map((id) => ({ id, ...(team.members[id] ?? { name: "Someone", joinedAt: 0 }) }))
    .sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : a.joinedAt - b.joinedAt));
}
