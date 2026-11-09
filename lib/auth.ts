"use client";

import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  getRedirectResult,
  signInWithRedirect,
  signInAnonymously,
  signOut,
  type User,
} from "firebase/auth";
import { firebase, firebaseConfigured } from "@/lib/firebase";

/*
  Signing in with Firebase Authentication: email and password, or Google.
  Firebase stores passwords safely (ShiftBoard never sees or saves them), sends the
  "reset password" emails, and limits repeated wrong guesses.
*/

export type AuthState = { status: "loading" } | { status: "signedOut" } | { status: "signedIn"; user: User };

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: firebaseConfigured ? "loading" : "signedOut" });
  useEffect(() => {
    if (!firebaseConfigured) return;
    return onAuthStateChanged(firebase().auth, (user) => {
      rememberSignedIn(Boolean(user));
      setState(user ? { status: "signedIn", user } : { status: "signedOut" });
    });
  }, []);
  return state;
}

/*
  A note on this device saying "someone was signed in here". The page reads it before it's drawn
  (app/layout.tsx), so a returning user sees the loading screen while Firebase checks, and a new
  visitor sees the sign-in screen straight away instead of waiting for Firebase to load. It's only
  a hint for what to show first: Firebase still decides who is signed in.
*/
const SIGNED_IN_KEY = "shiftboard:signedIn";
function rememberSignedIn(yes: boolean) {
  try {
    if (yes) localStorage.setItem(SIGNED_IN_KEY, "1");
    else localStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    /* storage blocked: the hint just isn't saved */
  }
  if (yes) document.documentElement.dataset.signedIn = "1";
  else delete document.documentElement.dataset.signedIn;
}

export const signInEmail = (email: string, password: string) => signInWithEmailAndPassword(firebase().auth, email.trim(), password);
export const signUpEmail = (email: string, password: string) => createUserWithEmailAndPassword(firebase().auth, email.trim(), password);
/**
 * Google sign-in opens a small Google window (a popup). If the browser won't open one
 * (some phones and in-app browsers block them), the whole page goes to Google instead and
 * comes back signed in.
 */
export async function signInGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" }); // always let people choose which Google account
  try {
    return await signInWithPopup(firebase().auth, provider, browserPopupRedirectResolver);
  } catch (error) {
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(errorCode(error))) {
      try {
        sessionStorage.setItem(REDIRECT_KEY, "1"); // so the page knows to finish it when it comes back
      } catch {
        /* storage blocked */
      }
      return signInWithRedirect(firebase().auth, provider, browserPopupRedirectResolver);
    }
    throw error;
  }
}
/**
 * "Try the demo": signs in as a guest, with no email or password. Firebase gives the guest their
 * own private account, so the security rules work exactly as for anyone else, and the app fills it
 * with examples (lib/demo.ts). Ending the demo deletes the data and the guest account.
 */
export const signInDemo = () => signInAnonymously(firebase().auth);
export const resetPassword = (email: string) => sendPasswordResetEmail(firebase().auth, email.trim());
export const signOutUser = () => signOut(firebase().auth);

/**
 * After coming back from a full-page Google sign-in, this finishes it (any error shows up here).
 * It only runs when a full-page sign-in was started, so normal visits don't load Google's helper.
 */
export async function finishRedirectSignIn() {
  let started = false;
  try {
    started = sessionStorage.getItem(REDIRECT_KEY) === "1";
    sessionStorage.removeItem(REDIRECT_KEY);
  } catch {
    /* storage blocked */
  }
  return started ? getRedirectResult(firebase().auth, browserPopupRedirectResolver) : null;
}
const REDIRECT_KEY = "shiftboard:googleRedirect";

export function errorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
}

/** Firebase error codes → a plain-language message */
export function authErrorMessage(error: unknown): string {
  const code = errorCode(error);
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "That email and password don't match. Check them, or reset your password.";
    case "auth/email-already-in-use":
      return "There's already an account with that email. Sign in instead.";
    case "auth/weak-password":
      return "Choose a password of at least 6 characters.";
    case "auth/invalid-email":
      return "That doesn't look like an email address.";
    case "auth/too-many-requests":
      return "Too many tries. Wait a few minutes and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "The Google window was closed before signing in.";
    case "auth/popup-blocked":
      return "Your browser blocked the Google window. Allow pop-ups for this site and try again.";
    case "auth/network-request-failed":
      return "You're offline. Connect to the internet to sign in.";
    case "auth/account-exists-with-different-credential":
      return "You already have an account with that email, made another way. Sign in with your email and password instead.";
    case "auth/user-disabled":
      return "This account has been switched off.";
    // The next ones mean the app's Firebase project isn't set up fully. Visitors can't fix them,
    // so the message says what's wrong, and the code shown underneath helps the owner.
    case "auth/unauthorized-domain":
      return "Sign-in isn't allowed on this web address yet. (Firebase → Authentication → Settings → Authorized domains needs this site's address.)";
    case "auth/operation-not-allowed":
    case "auth/configuration-not-found":
      return "This way of signing in isn't switched on yet. (Firebase → Authentication → Sign-in method.)";
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid":
    case "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
      return "The app's Firebase settings don't look right. (Check the NEXT_PUBLIC_FIREBASE_ settings in Vercel, then redeploy.)";
    default:
      return "Something went wrong. Please try again.";
  }
}
