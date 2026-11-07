"use client";

import { arrayRemove, arrayUnion, collection, deleteField, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch, type WriteBatch } from "firebase/firestore";
import { firebase } from "@/lib/firebase";
import { isInviteCode, makeInviteCode } from "@/lib/invite";
import { MAX_NAME } from "@/lib/members";
import { copyWeek } from "@/lib/rota";
import { MAX_NOTE } from "@/lib/requests";
import { getApp, reportProblem } from "@/lib/store";
import type { Invite, Shift, ShiftRequest, Team } from "@/lib/types";

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
  await deleteAll([...shifts.docs, ...requests.docs], (batch) => {
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

/** What someone usually does, e.g. "Barista" (managers set it for anyone) */
export function setRole(memberId: string, role: string) {
  quietly(updateDoc(doc(db(), "teams", team().id), { [`members.${memberId}.role`]: cleanName(role, 30) }));
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

function cleanShift(f: ShiftFields): ShiftFields {
  return { ...f, breakMins: Math.min(240, Math.max(0, Math.round(f.breakMins))), note: cleanName(f.note, 40) };
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
  const copies = copyWeek(getApp().shifts, fromMonday, t.memberIds).slice(0, 450);
  if (copies.length === 0) return 0;
  const batch = writeBatch(db());
  const now = Date.now();
  copies.forEach((s, i) => batch.set(doc(shiftsOf(t.id)), { ...s, createdAt: now + i }));
  quietly(batch.commit());
  return copies.length;
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
