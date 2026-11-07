import type { Notice, Team } from "@/lib/types";

/*
  The notice board: short messages from managers to the team ("Stock take on Friday at 7").
  The newest show at the top of the rota for 30 days. Everyone presses "Got it" once they've
  read one, and managers can see who has and hasn't.
  Tested in tests/notices.test.ts.
*/

export const MAX_NOTICE = 300;
export const NOTICE_DAYS = 30;

/** The notices to show: newest first, from the last 30 days, at most 5 */
export function recentNotices(notices: Notice[], now: number) {
  const since = now - NOTICE_DAYS * 24 * 60 * 60 * 1000;
  return notices
    .filter((n) => n.createdAt >= since)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);
}

export const unreadFor = (notices: Notice[], uid: string) => notices.filter((n) => n.by !== uid && !n.readBy.includes(uid));

/** Who has read a notice, and who hasn't yet (the person who posted it doesn't count) */
export function readSummary(notice: Notice, team: Pick<Team, "memberIds" | "members">) {
  const others = team.memberIds.filter((id) => id !== notice.by);
  const name = (id: string) => team.members[id]?.name || "Someone";
  return {
    read: others.filter((id) => notice.readBy.includes(id)).map(name),
    notRead: others.filter((id) => !notice.readBy.includes(id)).map(name),
  };
}
