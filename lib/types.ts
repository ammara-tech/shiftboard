/*
  The shapes of ShiftBoard's data, as stored in Firestore (see firestore.rules and the README).

  users/{uid}                     your name, the teams you're in, and the one you're looking at
  teams/{id}                      the team (a café, salon or shop): its name, its people, who manages it,
                                  and its current invite code
  teams/{id}/shifts/{shiftId}     one shift: who, which day, from when to when, and the break
  teams/{id}/requests/{reqId}     a request for time off, or a shift someone wants to give away
  teams/{id}/notices/{noticeId}   a notice from a manager to the team, and who has read it
  teams/{id}/private/pay          pay rates per person: only managers can read or change it
  invites/{code}                  an invite link: which team it's for (only works if you know the code)

  Dates are "2026-11-09" strings and times are "08:30" strings, the way a rota is written,
  so a shift means the same thing on every phone, whatever its time zone.
*/

/** A time someone can't work, every week. from/to "" means the whole day. */
export type Unavailable = {
  day: number; // 0 = Monday … 6 = Sunday
  from: string; // "17:00", or "" for all day
  to: string; // "23:59", or "" for all day
};

export type Member = {
  name: string;
  joinedAt: number;
  role?: string; // what they usually do, e.g. "Barista" or "Stylist" ("" = not set)
  unavailable?: Unavailable[]; // when they can't work (lib/availability.ts); each person sets their own
};

/** Someone a manager added by name, who doesn't have an account yet (lib/team.ts) */
export type Extra = {
  name: string;
  role?: string;
  addedAt: number;
};

export type Team = {
  id: string;
  name: string;
  createdBy: string; // whoever started the team
  managerIds: string[]; // who can build the rota, approve requests and see pay (always at least one)
  memberIds: string[]; // everyone, managers included
  members: Record<string, Member>;
  extras?: Record<string, Extra>; // people added by name, who can be put on the rota before they join
  inviteCode: string;
  createdAt: number;
  lastInvite?: string; // the invite code used by the last person to join (the rules check it)
};

export type Shift = {
  id: string;
  staffId: string; // who works it ("" = an open shift anyone can be given)
  date: string; // "2026-11-09"
  start: string; // "08:00"
  end: string; // "16:30" (earlier than start means it ends after midnight)
  breakMins: number; // unpaid break, in minutes
  note: string; // e.g. "Opening" or "Stock take"
  published: boolean; // staff only see shifts once the manager publishes the week
  createdAt: number;
  clockIn?: number | null; // when they clocked in (ms), from their phone (lib/clock.ts)
  clockOut?: number | null; // when they clocked out (ms)
};

export type Notice = {
  id: string;
  text: string;
  by: string; // the manager who posted it
  createdAt: number;
  readBy: string[]; // who pressed "Got it"
};

export type RequestKind = "off" | "giveaway";
export type RequestStatus = "pending" | "approved" | "declined" | "cancelled";

export type ShiftRequest = {
  id: string;
  kind: RequestKind; // "off": time off between two dates; "giveaway": someone else takes my shift
  by: string; // who asked
  from: string; // time off: first day ("" for a giveaway)
  to: string; // time off: last day ("" for a giveaway)
  shiftId: string; // giveaway: the shift ("" for time off)
  takerId: string; // giveaway: who offered to take it ("" until someone does)
  note: string;
  status: RequestStatus;
  decidedBy: string; // the manager who approved or declined it ("" while pending)
  createdAt: number;
  decidedAt: number | null;
};

export type Profile = {
  name: string;
  teams: string[];
  current: string | null;
};

export type Invite = {
  teamId: string;
  teamName: string;
  createdBy: string;
};

/** Pay per hour in cents, per person. Only managers can read it. */
export type PayRates = Record<string, number>;
