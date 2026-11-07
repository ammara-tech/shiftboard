"use client";

import { useEffect } from "react";

/*
  Registers public/sw.js, which keeps a copy of the app itself on the phone,
  so ShiftBoard opens with no signal (Firestore keeps the rota itself).
  Only on the live site: while developing, a cached copy would hide your changes.
*/
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* the app still works online without it */
    });
  }, []);
  return null;
}
