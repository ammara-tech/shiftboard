"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { clockIn, clockOut } from "@/lib/actions";
import { clockTime, clockableShift, isClockedIn, minutesLate } from "@/lib/clock";
import { dayLabel, shiftTimes, todayIso } from "@/lib/rota";
import { useApp } from "@/lib/store";

/*
  "Clock in" and "Clock out" on the rota (lib/clock.ts). It appears from 30 minutes before one of
  your published shifts until it ends, and stays while you're clocked in. It checks the time every
  half minute, so the button shows up by itself when it's time.
*/
export default function ClockCard() {
  const { uid, shifts } = useApp();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!uid) return null;
  const shift = clockableShift(shifts, uid, now);
  if (!shift) return null;
  const inNow = isClockedIn(shift);
  const late = minutesLate(shift);

  return (
    <section aria-labelledby="clock-title" className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-teal/40 bg-teal-soft p-5">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-card text-teal">
        <Icon name="clock" className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="clock-title" className="font-extrabold">
          {inNow ? "You're clocked in" : "Your shift is about to start"}
        </h2>
        <p className="text-sm">
          {shift.date === todayIso() ? "Today" : dayLabel(shift.date)}, {shiftTimes(shift)}
          {inNow && typeof shift.clockIn === "number" && ` · in at ${clockTime(shift.clockIn)}`}
          {inNow && late > 0 && ` (${late} min late)`}
        </p>
      </div>
      <button type="button" onClick={() => (inNow ? clockOut(shift) : clockIn(shift))} className="btn px-6 py-3 text-base">
        {inNow ? "Clock out" : "Clock in"}
      </button>
    </section>
  );
}
