"use client";

import { arrayRemove, arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch, type WriteBatch } from "firebase/firestore";
import { firebase } from "@/lib/firebase";
import { isInviteCode, makeInviteCode } from "@/lib/invite";
import { MAX_NAME } from "@/lib/members";
import { addDays, copyWeek, todayIso, weekStart } from "@/lib/rota";
import { makeExtraId, rotaIds } from "@/lib/team";
import { MAX_NOTE } from "@/lib/requests";
import { MAX_NOTICE } from "@/lib/notices";
import { isValidUnavailable } from "@/lib/availability";
import { getApp, reportProblem } from "@/lib/store";
import type { Invite, Notice, Shift, ShiftRequest, Team, Unavailable } from "@/lib/types";

/*
  Every change ShiftBoard makes to Firestore. firestore.rules checks each one on Google's
  servers: only managers can change the rota, decide requests or see pay; staff can only
  ask for things for themselves.

  Rota changes and requests are not awaited: Firestore shows them straight away and sends
  them when it can, so they work offline. Starting and joining a team need a connection, so
  those are awaited and can fail with a message.
*/

const db = () => firebase().db;
const me = () => {
  const uid = getApp().uid;
  if (!uid) throw new Error("Not signed in");
  return uid;
};
const team = () => {
  const t = getApp().team;
  if (!t) throw new Error("No team");
  return t;
};

/** For writes we don't wait for: tell the person if the server refuses one */
function quietly(promise: Promise<unknown>) {
  promise.catch(() => reportProblem("A change couldn't be saved. You may not be allowed to make it any more, or the connection dropped. Refresh to see the latest rota."));
}

const cleanName = (name: string, max = MAX_NAME) => name.replace(/\s+/g, " ").trim().slice(0, max);

/** Deletes many documents, 450 at a time (Firestore allows 500 changes in one batch), then `last` in the final batch */
async function deleteAll(refs: { ref: Parameters<WriteBatch["delete"]>[0] }[], last: (batch: WriteBatch) => void) {
  const chunks: (typeof refs)[] = [];
  for (let i = 0; i < refs.length; i += 450) chunks.push(refs.slice(i, i + 450));
  if (chunks.length === 0) chunks.push([]);
  for (let c = 0; c < chunks.length; c++) {
    const batch = writeBatch(db());
    chunks[c].forEach((d) => batch.delete(d.ref));
    if (c === chunks.length - 1) last(batch);
    await batch.commit();
  }
}

// ---------- Teams ----------

export async function createTeam(name: string) {
  const uid = me();
  const myName = cleanName(getApp().profile.name) || "Me";
  const ref = doc(collection(db(), "teams"));
  const code = makeInviteCode();
  const now = Date.now();
  const t: Omit<Team, "id"> = {
    name: cleanName(name) || "My team",
    createdBy: uid,
    managerIds: [uid],
    memberIds: [uid],
    members: { [uid]: { name: myName, joinedAt: now, role: "" } },
    inviteCode: code,
    createdAt: now,
  };
  const batch = writeBatch(db());
  batch.set(ref, t);
  batch.set(doc(db(), "invites", code), { teamId: ref.id, teamName: t.name, createdBy: uid } satisfies Invite);
  batch.set(doc(db(), "users", uid), { name: myName, teams: arrayUnion(ref.id), current: ref.id }, { merge: true });
  await batch.commit();
  return ref.id;
}

/** Looks up an invite code: which team it's for, or null if it doesn't work */
export async function readInvite(code: string): Promise<Invite | null> {
  if (!isInviteCode(code)) return null;
  try {
    const snap = await getDoc(doc(db(), "invites", code));
    return snap.exists() ? (snap.data() as Invite) : null;
  } catch {
    return null;
  }
}

export async function joinTeam(code: string) {
  const uid = me();
  const invite = await readInvite(code);
  if (!invite) throw new Error("This invite link doesn't work any more. Ask your manager for a new one.");
  const { profile } = getApp();
  if (!profile.teams.includes(invite.teamId)) {
    // Adds only yourself, as staff. The rules check that "lastInvite" is a real invite for this team.
    await updateDoc(doc(db(), "teams", invite.teamId), {
      memberIds: arrayUnion(uid),
      [`members.${uid}`]: { name: cleanName(profile.name) || "Me", joinedAt: Date.now(), role: "" },
      lastInvite: code,
    });
  }
  await setDoc(doc(db(), "users", uid), { name: cleanName(profile.name) || "Me", teams: arrayUnion(invite.teamId), current: invite.teamId }, { merge: true });
  return invite;
}

/** The name of another team you're in (for the list on the Team page) */
export async function readTeamName(id: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db(), "teams", id));
    return snap.exists() ? String(snap.data()?.name ?? "") || null : null;
  } catch {
    return null;
  }
}

export function switchTeam(id: string) {
  quietly(setDoc(doc(db(), "users", me()), { current: id }, { merge: true }));
}

export function renameTeam(name: string) {
  const t = team();
  const clean = cleanName(name);
  if (!clean) return;
  const batch = writeBatch(db());
  batch.update(doc(db(), "teams", t.id), { name: clean });
  batch.update(doc(db(), "invites", t.inviteCode), { teamName: clean });
  quietly(batch.commit());
}

/** A new invite link. The old one stops working straight away. */
export async function newInviteLink() {
  const t = team();
  const code = makeInviteCode();
  const batch = writeBatch(db());
  batch.set(doc(db(), "invites", code), { teamId: t.id, teamName: t.name, createdBy: me() } satisfies Invite);
  batch.update(doc(db(), "teams", t.id), { inviteCode: code });
  batch.delete(doc(db(), "invites", t.inviteCode));
  await batch.commit();
}

/** Deletes the team and everything in it: shifts, requests, pay rates and the invite link */
async function deleteTeamData(t: Team) {
  const ref = doc(db(), "teams", t.id);
  const shifts = await getDocs(collection(ref, "shifts"));
  const requests = await getDocs(collection(ref, "requests"));
  const notices = await getDocs(collection(ref, "notices"));
  await deleteAll([...shifts.docs, ...requests.docs, ...notices.docs], (batch) => {
    batch.delete(doc(ref, "private", "pay"));
    batch.delete(doc(db(), "invites", t.inviteCode));
    batch.delete(ref);
  });
}

/**
 * Leave the team. The last manager can't leave while others are still in it (make someone
 * else a manager first). The last person to leave deletes the team.
 */
export async function leaveTeam() {
  const uid = me();
  const t = team();
  await setDoc(doc(db(), "users", uid), { teams: arrayRemove(t.id), current: null }, { merge: true });
  if (t.memberIds.length === 1) {
    await deleteTeamData(t);
  } else {
    await updateDoc(doc(db(), "teams", t.id), {
      memberIds: arrayRemove(uid),
      managerIds: arrayRemove(uid),
      [`members.${uid}`]: deleteField(),
    });
  }
}

/** A manager removes someone. Their future shifts become open shifts, so nothing is left unstaffed by accident. */
export async function removeMember(memberId: string) {
  const t = team();
  const batch = writeBatch(db());
  batch.update(doc(db(), "teams", t.id), {
    memberIds: arrayRemove(memberId),
    managerIds: arrayRemove(memberId),
    [`members.${memberId}`]: deleteField(),
  });
  const today = new Date().toISOString().slice(0, 10);
  for (const s of getApp().shifts.filter((s) => s.staffId === memberId && s.date >= today).slice(0, 400)) {
    batch.update(doc(db(), "teams", t.id, "shifts", s.id), { staffId: "" });
  }
  if (getApp().rates[memberId]) batch.set(doc(db(), "teams", t.id, "private", "pay"), { rates: { [memberId]: deleteField() } }, { merge: true });
  await batch.commit();
}

/** Makes someone a manager, or takes it away (never from the last manager) */
export function setManager(memberId: string, manager: boolean) {
  const t = team();
  if (!manager && t.managerIds.length <= 1) return;
  quietly(updateDoc(doc(db(), "teams", t.id), { managerIds: manager ? arrayUnion(memberId) : arrayRemove(memberId) }));
}

/** What someone usually does, e.g. "Barista" (managers set it for anyone, including people added by name) */
export function setRole(memberId: string, role: string) {
  const field = team().extras?.[memberId] ? `extras.${memberId}.role` : `members.${memberId}.role`;
  quietly(updateDoc(doc(db(), "teams", team().id), { [field]: cleanName(role, 30) }));
}

// ---------- People added by name (managers) ----------

/** Adds someone who doesn't have an account yet, so they can go on the rota straight away */
export function addExtra(name: string, role: string) {
  const clean = cleanName(name);
  if (!clean) return;
  quietly(updateDoc(doc(db(), "teams", team().id), { [`extras.${makeExtraId()}`]: { name: clean, role: cleanName(role, 30), addedAt: Date.now() } }));
}

export function renameExtra(extraId: string, name: string) {
  const clean = cleanName(name);
  if (!clean) return;
  quietly(updateDoc(doc(db(), "teams", team().id), { [`extras.${extraId}.name`]: clean }));
}

/** Removes someone added by name. Their coming shifts become open shifts. */
export async function removeExtra(extraId: string) {
  const t = team();
  const batch = writeBatch(db());
  batch.update(doc(db(), "teams", t.id), { [`extras.${extraId}`]: deleteField() });
  const today = new Date().toISOString().slice(0, 10);
  for (const s of getApp().shifts.filter((s) => s.staffId === extraId && s.date >= today).slice(0, 400)) {
    batch.update(doc(db(), "teams", t.id, "shifts", s.id), { staffId: "" });
  }
  if (getApp().rates[extraId]) batch.set(doc(db(), "teams", t.id, "private", "pay"), { rates: { [extraId]: deleteField() } }, { merge: true });
  await batch.commit();
}

/**
 * Someone added by name has joined with the invite link: every shift of theirs (past ones too, so
 * their hours stay together) moves to their account, and their role and pay rate come with them.
 */
export async function linkExtra(extraId: string, memberId: string) {
  const t = team();
  const extra = t.extras?.[extraId];
  if (!extra || !t.memberIds.includes(memberId)) return;
  const shifts = getApp().shifts.filter((s) => s.staffId === extraId);
  for (let i = 0; i < Math.max(shifts.length, 1); i += 400) {
    const batch = writeBatch(db());
    shifts.slice(i, i + 400).forEach((s) => batch.update(doc(db(), "teams", t.id, "shifts", s.id), { staffId: memberId }));
    if (i + 400 >= shifts.length) {
      const change: Record<string, unknown> = { [`extras.${extraId}`]: deleteField() };
      if (extra.role && !t.members[memberId]?.role) change[`members.${memberId}.role`] = extra.role;
      batch.update(doc(db(), "teams", t.id), change);
      const rate = getApp().rates[extraId];
      if (rate) batch.set(doc(db(), "teams", t.id, "private", "pay"), { rates: { [memberId]: getApp().rates[memberId] || rate, [extraId]: deleteField() } }, { merge: true });
    }
    await batch.commit();
  }
}

// ---------- Availability (each person sets their own) ----------

export function setMyUnavailable(list: Unavailable[]) {
  const clean = list.filter(isValidUnavailable).slice(0, 14).map((u) => ({ day: u.day, from: u.from, to: u.to }));
  quietly(updateDoc(doc(db(), "teams", team().id), { [`members.${me()}.unavailable`]: clean }));
}

/** Deletes the team for everyone (managers only) */
export async function deleteTeamForEveryone() {
  const uid = me();
  const t = team();
  await setDoc(doc(db(), "users", uid), { teams: arrayRemove(t.id), current: null }, { merge: true });
  await deleteTeamData(t);
}

/** Takes a team you're no longer in off your profile (after being removed, or the team was deleted) */
export function forgetTeam(id: string) {
  const uid = getApp().uid;
  if (!uid) return;
  const rest = getApp().profile.teams.filter((t) => t !== id);
  quietly(setDoc(doc(db(), "users", uid), { teams: arrayRemove(id), current: rest[0] ?? null }, { merge: true }));
}

export function setMyName(name: string) {
  const uid = me();
  const clean = cleanName(name);
  const { profile } = getApp();
  if (!clean) return;
  const batch = writeBatch(db());
  batch.set(doc(db(), "users", uid), { name: clean }, { merge: true });
  for (const id of profile.teams) batch.update(doc(db(), "teams", id), { [`members.${uid}.name`]: clean });
  quietly(batch.commit());
}

// ---------- The rota (managers) ----------

const shiftsOf = (id: string) => collection(db(), "teams", id, "shifts");

export type ShiftFields = Pick<Shift, "staffId" | "date" | "start" | "end" | "breakMins" | "note">;

/** Only the fields a shift is made of (the form may hold more, like its id), tidied up */
function cleanShift(f: ShiftFields): ShiftFields {
  return {
    staffId: f.staffId,
    date: f.date,
    start: f.start,
    end: f.end,
    breakMins: Math.min(240, Math.max(0, Math.round(f.breakMins))),
    note: cleanName(f.note, 40),
  };
}

/** Adds a shift. It's a draft until the week is published, unless the week is already out. */
export function addShift(fields: ShiftFields, published: boolean) {
  const t = team();
  const shift: Omit<Shift, "id"> = { ...cleanShift(fields), published, createdAt: Date.now() };
  quietly(setDoc(doc(shiftsOf(t.id)), shift));
}

export function editShift(shift: Shift, fields: ShiftFields) {
  quietly(updateDoc(doc(shiftsOf(team().id), shift.id), { ...cleanShift(fields) }));
}

export function deleteShift(shift: Shift) {
  const batch = writeBatch(db());
  batch.delete(doc(shiftsOf(team().id), shift.id));
  quietly(batch.commit());
}

/** Puts back shifts that were deleted (Undo) */
export function restoreShifts(shifts: Shift[]) {
  const id = team().id;
  const batch = writeBatch(db());
  for (const { id: shiftId, ...data } of shifts) batch.set(doc(shiftsOf(id), shiftId), data);
  quietly(batch.commit());
}

/** Publishes every draft shift in the week, so staff can see them */
export function publishWeek(shifts: Shift[]) {
  const drafts = shifts.filter((s) => !s.published);
  if (drafts.length === 0) return 0;
  const batch = writeBatch(db());
  for (const s of drafts.slice(0, 450)) batch.update(doc(shiftsOf(team().id), s.id), { published: true });
  quietly(batch.commit());
  return Math.min(drafts.length, 450);
}

/** "Copy last week": adds last week's shifts to this week, as drafts. Returns how many were added. */
export function copyLastWeek(fromMonday: string) {
  const t = team();
  const copies = copyWeek(getApp().shifts, fromMonday, rotaIds(t)).slice(0, 450);
  if (copies.length === 0) return 0;
  const batch = writeBatch(db());
  const now = Date.now();
  copies.forEach((s, i) => batch.set(doc(shiftsOf(t.id)), { ...s, createdAt: now + i }));
  quietly(batch.commit());
  return copies.length;
}

// ---------- Clocking in and out ----------

export function clockIn(shift: Shift) {
  quietly(updateDoc(doc(shiftsOf(team().id), shift.id), { clockIn: Date.now() }));
}

export function clockOut(shift: Shift) {
  quietly(updateDoc(doc(shiftsOf(team().id), shift.id), { clockOut: Date.now() }));
}

/** A manager corrects the clocked times (null clears one) */
export function fixClock(shift: Shift, clockInAt: number | null, clockOutAt: number | null) {
  quietly(updateDoc(doc(shiftsOf(team().id), shift.id), { clockIn: clockInAt, clockOut: clockOutAt }));
}

// ---------- The notice board ----------

const noticesOf = (id: string) => collection(db(), "teams", id, "notices");

export function postNotice(text: string) {
  const clean = text.replace(/[ \t]+/g, " ").trim().slice(0, MAX_NOTICE);
  if (!clean) return;
  const notice: Omit<Notice, "id"> = { text: clean, by: me(), createdAt: Date.now(), readBy: [] };
  quietly(setDoc(doc(noticesOf(team().id)), notice));
}

/** "Got it" */
export function markNoticeRead(notice: Notice) {
  quietly(updateDoc(doc(noticesOf(team().id), notice.id), { readBy: arrayUnion(me()) }));
}

export function deleteNotice(notice: Notice) {
  quietly(deleteDoc(doc(noticesOf(team().id), notice.id)));
}

// ---------- Requests ----------

const requestsOf = (id: string) => collection(db(), "teams", id, "requests");

function newRequest(fields: Pick<ShiftRequest, "kind" | "from" | "to" | "shiftId" | "note">): Omit<ShiftRequest, "id"> {
  return { ...fields, note: cleanName(fields.note, MAX_NOTE), by: me(), takerId: "", status: "pending", decidedBy: "", createdAt: Date.now(), decidedAt: null };
}

export function askTimeOff(from: string, to: string, note: string) {
  quietly(setDoc(doc(requestsOf(team().id)), newRequest({ kind: "off", from, to, shiftId: "", note })));
}

export function giveAwayShift(shift: Shift, note: string) {
  quietly(setDoc(doc(requestsOf(team().id)), newRequest({ kind: "giveaway", from: "", to: "", shiftId: shift.id, note })));
}

/** "I'll take it" on someone else's shift, or take that back */
export function offerToTake(request: ShiftRequest, taking: boolean) {
  quietly(updateDoc(doc(requestsOf(team().id), request.id), { takerId: taking ? me() : "" }));
}

export function cancelRequest(request: ShiftRequest) {
  quietly(updateDoc(doc(requestsOf(team().id), request.id), { status: "cancelled", decidedAt: Date.now() }));
}

/** A manager approves or declines. Approving a giveaway moves the shift to whoever offered to take it. */
export function decideRequest(request: ShiftRequest, approve: boolean) {
  const t = team();
  const batch = writeBatch(db());
  batch.update(doc(requestsOf(t.id), request.id), { status: approve ? "approved" : "declined", decidedBy: me(), decidedAt: Date.now() });
  if (approve && request.kind === "giveaway" && request.takerId) {
    batch.update(doc(shiftsOf(t.id), request.shiftId), { staffId: request.takerId });
  }
  quietly(batch.commit());
}

// ---------- Pay (managers) ----------

/** Sets someone's pay per hour, in cents (0 removes it) */
export function setRate(memberId: string, cents: number) {
  if (!team().memberIds.includes(memberId)) return;
  quietly(setDoc(doc(db(), "teams", team().id, "private", "pay"), { rates: { [memberId]: cents > 0 ? cents : deleteField() } }, { merge: true }));
}

// ---------- Try the demo ----------

/**
 * For a new demo (lib/demo.ts): a made-up café with three staff added by name, this week's rota
 * published (with today's shifts), next week's as drafts, a notice and a time-off request.
 * The staff go on first, because the rules check a shift's person is in the team.
 */
export async function seedDemo() {
  const uid = me();
  const id = await createTeam("Demo Café");
  const staff = [
    { id: makeExtraId(), name: "Thabo", role: "Barista" },
    { id: makeExtraId(), name: "Lerato", role: "Cook" },
    { id: makeExtraId(), name: "Naledi", role: "Waiter" },
  ];
  const now = Date.now();
  const extras: Record<string, unknown> = { [`members.${uid}.role`]: "Manager" };
  staff.forEach((p, i) => (extras[`extras.${p.id}`] = { name: p.name, role: p.role, addedAt: now + i }));
  await updateDoc(doc(db(), "teams", id), extras);

  const monday = weekStart(todayIso());
  const batch = writeBatch(db());
  const people = [uid, ...staff.map((p) => p.id)];
  const times: [string, string, number][] = [
    ["07:00", "15:00", 30],
    ["08:00", "16:30", 30],
    ["11:00", "19:00", 30],
    ["15:00", "21:00", 0],
  ];
  for (let week = 0; week < 2; week++) {
    for (let day = 0; day < 6; day++) {
      const date = addDays(monday, week * 7 + day);
      people.forEach((staffId, n) => {
        if ((day + n) % 4 === 3) return; // everyone gets days off
        const [start, end, breakMins] = times[(n + day) % times.length];
        batch.set(doc(shiftsOf(id)), { staffId, date, start, end, breakMins, note: n === 0 && day === 0 ? "Opening" : "", published: week === 0, createdAt: now });
      });
    }
  }
  batch.set(doc(noticesOf(id)), {
    text: "Welcome to the demo! The new coffee machine arrives on Friday, so please read the guide by the till.",
    by: uid,
    createdAt: now,
    readBy: [],
  });
  batch.set(doc(requestsOf(id)), { kind: "off", from: addDays(monday, 12), to: addDays(monday, 13), shiftId: "", note: "Family wedding", by: uid, takerId: "", status: "pending", decidedBy: "", createdAt: now, decidedAt: null });
  quietly(batch.commit());
}

/** Deletes the teams the guest manages, leaves any others, and empties the profile. Used when a demo ends. */
export async function deleteEverything() {
  const uid = me();
  for (const id of getApp().profile.teams) {
    const snap = await getDoc(doc(db(), "teams", id)).catch(() => null);
    if (!snap?.exists()) continue;
    const t = { id, ...(snap.data() as Omit<Team, "id">) };
    // A team the guest manages (their demo café) is deleted for everyone; any other team is left
    if (t.memberIds.length <= 1 || t.managerIds.includes(uid)) await deleteTeamData(t);
    else
      await updateDoc(doc(db(), "teams", id), {
        memberIds: arrayRemove(uid),
        managerIds: arrayRemove(uid),
        [`members.${uid}`]: deleteField(),
      });
  }
  // The profile is emptied rather than deleted (the rules only allow writing it, with these fields)
  await setDoc(doc(db(), "users", uid), { name: "Guest", teams: [], current: null });
}
