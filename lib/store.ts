"use client";

import { useSyncExternalStore } from "react";
import { collection, doc, onSnapshot, query, where, type Unsubscribe } from "firebase/firestore";
import { firebase } from "@/lib/firebase";
import { readShift, readRequest, shiftChanges, requestChanges } from "@/lib/read";
import { teamChanges } from "@/lib/team";
import type { PayRates, Profile, Shift, ShiftRequest, Team } from "@/lib/types";

/*
  The app's live copy of your team, kept up to date by Firestore.

  connect(uid) listens to your profile (users/{uid}): your name and which teams you're in.
  For the team you're looking at, it then listens to:
    1. the team (teams/{id}): its name, people and managers
    2. its shifts: managers get every shift; staff only get published ones (the rules refuse
       staff a draft, so the app asks only for published shifts)
    3. its requests: time off and shifts being given away
    4. pay rates (teams/{id}/private/pay): managers only
  Whenever anyone changes something, Firestore sends the new version within a moment, every
  screen re-draws, and a message pops up ("Your shifts for 9 – 15 Nov are out").

  Changes you make show straight away, even offline: Firestore saves them on the phone first
  ("pending") and sends them when the connection is back.
*/

export type Toast = { id: number; text: string };

export type AppState = {
  uid: string | null;
  status: "loading" | "noTeam" | "ready";
  profile: Profile;
  team: Team | null;
  shifts: Shift[];
  requests: ShiftRequest[];
  rates: PayRates;
  pending: boolean; // changes saved on this phone but not yet sent
  online: boolean;
  toasts: Toast[];
  problem: string | null;
};

const emptyProfile: Profile = { name: "", teams: [], current: null };

let state: AppState = {
  uid: null,
  status: "loading",
  profile: emptyProfile,
  team: null,
  shifts: [],
  requests: [],
  rates: {},
  pending: false,
  online: true,
  toasts: [],
  problem: null,
};

const listeners = new Set<() => void>();
function set(change: Partial<AppState>) {
  state = { ...state, ...change };
  listeners.forEach((l) => l());
}

let stopProfile: Unsubscribe | null = null;
let stopTeam: Unsubscribe | null = null;
let stopShifts: Unsubscribe | null = null;
let stopRequests: Unsubscribe | null = null;
let stopRates: Unsubscribe | null = null;
let watching: string | null = null; // the team being listened to
let watchingAsManager: boolean | null = null; // which shifts are being listened to
let firstShifts = true;
let firstRequests = true;
let pendingParts = { profile: false, team: false, shifts: false, requests: false, rates: false };
let toastId = 0;
let startingName = "";

function setPending(part: keyof typeof pendingParts, value: boolean) {
  pendingParts = { ...pendingParts, [part]: value };
  set({ pending: Object.values(pendingParts).some(Boolean) });
}

export function addToast(text: string) {
  const toast = { id: ++toastId, text };
  set({ toasts: [...state.toasts, toast].slice(-3) });
  setTimeout(() => dismissToast(toast.id), 4500);
}

export function dismissToast(id: number) {
  set({ toasts: state.toasts.filter((t) => t.id !== id) });
}

export function reportProblem(problem: string | null) {
  set({ problem });
}

function stopTeamParts() {
  stopShifts?.();
  stopRequests?.();
  stopRates?.();
  stopShifts = stopRequests = stopRates = null;
  watchingAsManager = null;
  firstShifts = firstRequests = true;
}

function stopWatchingTeam() {
  clearTimeout(retryTimer);
  stopTeam?.();
  stopTeam = null;
  stopTeamParts();
  watching = null;
}

/*
  Right after you start or join a team, Google's servers can take a moment to know you're in it,
  and refuse to show it. Instead of sending you back to the start, the app quietly tries again a
  few times. Only if it still can't, or the team is gone, does it move you on (lostTeam).
*/
const RETRY_DELAYS = [400, 800, 1600, 3200];
let retries = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

function retryLater(id: string) {
  if (retries >= RETRY_DELAYS.length) return false;
  const delay = RETRY_DELAYS[retries++];
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    if (watching !== id) return;
    watching = null;
    watchTeam(id, true);
  }, delay);
  return true;
}

/** You were removed, or the team was deleted: say so, and move to your next team */
function lostTeam(id: string) {
  const name = state.team?.id === id ? state.team.name : "that team";
  stopWatchingTeam();
  set({ team: null, shifts: [], requests: [], rates: {}, status: "noTeam" });
  addToast(`You're no longer in ${name}.`);
  // Imported here, not at the top, because actions.ts imports this file
  import("@/lib/actions").then(({ forgetTeam }) => forgetTeam(id));
}

/** Listens to the shifts, requests and (for managers) pay. Starts again if you become, or stop being, a manager. */
function watchParts(id: string, manager: boolean) {
  if (watchingAsManager === manager) return;
  stopTeamParts();
  watchingAsManager = manager;
  const { db } = firebase();
  const shiftsRef = collection(db, "teams", id, "shifts");

  stopShifts = onSnapshot(
    manager ? shiftsRef : query(shiftsRef, where("published", "==", true)),
    { includeMetadataChanges: true },
    (snap) => {
      setPending("shifts", snap.metadata.hasPendingWrites);
      const shifts = snap.docs.map((d) => readShift(d.id, d.data()));
      if (!firstShifts && state.uid && !snap.metadata.hasPendingWrites) {
        for (const text of shiftChanges(state.shifts, shifts, state.uid)) addToast(text);
      }
      firstShifts = false;
      set({ shifts });
    },
    () => set({ shifts: [] }),
  );

  stopRequests = onSnapshot(
    collection(db, "teams", id, "requests"),
    { includeMetadataChanges: true },
    (snap) => {
      setPending("requests", snap.metadata.hasPendingWrites);
      const requests = snap.docs.map((d) => readRequest(d.id, d.data()));
      if (!firstRequests && state.uid && state.team && !snap.metadata.hasPendingWrites) {
        for (const text of requestChanges(state.requests, requests, state.uid, state.team)) addToast(text);
      }
      firstRequests = false;
      set({ requests });
    },
    () => set({ requests: [] }),
  );

  if (manager) {
    stopRates = onSnapshot(
      doc(db, "teams", id, "private", "pay"),
      { includeMetadataChanges: true },
      (snap) => {
        setPending("rates", snap.metadata.hasPendingWrites);
        const rates = (snap.data()?.rates ?? {}) as PayRates;
        set({ rates: Object.fromEntries(Object.entries(rates).filter(([, v]) => typeof v === "number" && v > 0)) });
      },
      () => set({ rates: {} }),
    );
  } else {
    set({ rates: {} });
  }
}

function watchTeam(id: string, retrying = false) {
  if (watching === id) return;
  stopWatchingTeam();
  watching = id;
  if (!retrying) retries = 0;
  set({ team: null, shifts: [], requests: [], rates: {}, status: "loading" });

  stopTeam = onSnapshot(
    doc(firebase().db, "teams", id),
    { includeMetadataChanges: true },
    (snap) => {
      setPending("team", snap.metadata.hasPendingWrites);
      const data = snap.data() as Omit<Team, "id"> | undefined;
      if (!data || !state.uid || !data.memberIds.includes(state.uid)) {
        // Only the server's answer counts: a copy saved on this phone may simply be out of date
        if (!snap.metadata.fromCache) lostTeam(id);
        return;
      }
      retries = 0;
      const next: Team = { id, ...data, managerIds: data.managerIds ?? [data.createdBy] };
      if (state.uid && state.team?.id === id) {
        for (const text of teamChanges(state.team, next, state.uid)) addToast(text);
      }
      set({ team: next, status: "ready" });
      watchParts(id, next.managerIds.includes(state.uid));
    },
    () => {
      if (!retryLater(id)) lostTeam(id);
    },
  );
}

const onOnline = () => set({ online: navigator.onLine });

export function connect(uid: string, name: string) {
  if (state.uid === uid) return;
  disconnect();
  startingName = name;
  set({ uid, status: "loading", online: navigator.onLine });
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOnline);

  stopProfile = onSnapshot(
    doc(firebase().db, "users", uid),
    { includeMetadataChanges: true },
    (snap) => {
      setPending("profile", snap.metadata.hasPendingWrites);
      const saved = snap.data() as Partial<Profile> | undefined;
      const profile: Profile = { name: saved?.name || startingName, teams: saved?.teams ?? [], current: saved?.current ?? null };
      const current = profile.current && profile.teams.includes(profile.current) ? profile.current : profile.teams[0] ?? null;
      set({ profile: { ...profile, current } });
      if (current) watchTeam(current);
      else {
        stopWatchingTeam();
        set({ team: null, shifts: [], requests: [], rates: {}, status: "noTeam" });
      }
    },
    () => set({ status: "noTeam", problem: "Couldn't load your profile. Check your connection and refresh." }),
  );
}

export function disconnect() {
  stopProfile?.();
  stopProfile = null;
  stopWatchingTeam();
  if (typeof window !== "undefined") {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOnline);
  }
  pendingParts = { profile: false, team: false, shifts: false, requests: false, rates: false };
  set({ uid: null, status: "loading", profile: emptyProfile, team: null, shifts: [], requests: [], rates: {}, pending: false, toasts: [], problem: null });
}

export function getApp() {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useApp(): AppState {
  return useSyncExternalStore(subscribe, getApp, getApp);
}
