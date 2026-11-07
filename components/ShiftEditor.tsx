"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Icon from "@/components/Icon";
import { fixClock, type ShiftFields } from "@/lib/actions";
import { unavailableDuring } from "@/lib/availability";
import { clockTime, correctedTime } from "@/lib/clock";
import { clashes, dayLabel, formatMinutes, isIsoDate, isTime, onTimeOff, paidMinutes } from "@/lib/rota";
import { people, personName } from "@/lib/team";
import type { Shift, ShiftRequest, Team } from "@/lib/types";

/*
  Adding or editing a shift (managers only), in a pop-up window.
  It shows how long the shift is once the break is taken off, and warns before saving if the
  person is already working then, or has time off that day. It's a native <dialog>, so Escape
  closes it and the keyboard stays inside it while it's open.
*/

const BREAKS = [0, 15, 30, 45, 60, 90];

export default function ShiftEditor({
  team,
  start,
  shift,
  shifts,
  requests,
  onSave,
  onDelete,
  onClose,
}: {
  team: Team;
  start: ShiftFields; // what the boxes start with
  shift: Shift | null; // the shift being edited, or null for a new one
  shifts: Shift[];
  requests: ShiftRequest[];
  onSave: (fields: ShiftFields) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState<ShiftFields>(start);
  const [error, setError] = useState<string | null>(null);
  const [inAt, setInAt] = useState(typeof shift?.clockIn === "number" ? clockTime(shift.clockIn) : "");
  const [outAt, setOutAt] = useState(typeof shift?.clockOut === "number" ? clockTime(shift.clockOut) : "");

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  const valid = isIsoDate(f.date) && isTime(f.start) && isTime(f.end) && f.start !== f.end;
  const nameOf = (id: string) => personName(team, id);
  const draft: Shift = { id: shift?.id ?? "new", published: false, createdAt: 0, ...f };
  const others = shifts.filter((s) => s.id !== draft.id);
  const warnings = valid ? clashes([...others, draft], requests, nameOf, team.members).filter((c) => c.shiftId === draft.id) : [];
  const clocked = Boolean(shift && shift.published && (typeof shift.clockIn === "number" || typeof shift.clockOut === "number"));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return setError(f.start === f.end ? "The shift has to end at a different time from when it starts." : "Fill in the day and both times.");
    if (shift && clocked) {
      const newIn = isTime(inAt) ? correctedTime(f, inAt, false) : null;
      const newOut = isTime(outAt) ? correctedTime(f, outAt, true) : null;
      if (newOut !== null && (newIn === null || newOut <= newIn)) return setError("The clock-out time has to be after the clock-in time.");
      if (newIn !== (shift.clockIn ?? null) || newOut !== (shift.clockOut ?? null)) fixClock(shift, newIn, newOut);
    }
    onSave(f);
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="shift-title"
      style={{ width: "min(32rem, calc(100vw - 2rem))" }}
      className="m-auto rounded-2xl border border-line bg-card p-0 text-ink shadow-2xl backdrop:bg-black/50"
    >
      <form onSubmit={submit} className="p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="shift-title" className="text-2xl font-extrabold">
            {shift ? "Edit shift" : "Add a shift"}
          </h2>
          <button type="button" onClick={() => dialog.current?.close()} className="tool" aria-label="Close without saving">
            <Icon name="close" />
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold sm:col-span-2">
            Who
            <select value={f.staffId} onChange={(e) => setF({ ...f, staffId: e.target.value })} className="field mt-1 font-normal">
              <option value="">Open shift (nobody yet)</option>
              {people(team).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.role ? ` (${p.role})` : ""}
                  {p.extra ? " · not joined yet" : ""}
                  {isIsoDate(f.date) && onTimeOff(p.id, f.date, requests) ? " · time off that day" : ""}
                  {valid && unavailableDuring(team.members[p.id], f) ? " · can't work then" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold sm:col-span-2">
            Day
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required className="field mt-1 font-normal" />
          </label>
          <label className="block text-sm font-semibold">
            Starts
            <input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} required className="field mt-1 font-normal" />
          </label>
          <label className="block text-sm font-semibold">
            Ends
            <input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} required className="field mt-1 font-normal" />
          </label>
          <label className="block text-sm font-semibold">
            Unpaid break
            <select value={f.breakMins} onChange={(e) => setF({ ...f, breakMins: Number(e.target.value) })} className="field mt-1 font-normal">
              {BREAKS.map((b) => (
                <option key={b} value={b}>
                  {b === 0 ? "No break" : `${b} minutes`}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Note (optional)
            <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={40} placeholder="e.g. Opening" className="field mt-1 font-normal" />
          </label>
        </div>

        {clocked && (
          <fieldset className="mt-4 rounded-xl border border-line p-3">
            <legend className="px-1 text-sm font-semibold">Clocked times (correct them if needed)</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                Clocked in
                <input type="time" value={inAt} onChange={(e) => setInAt(e.target.value)} className="field mt-1" />
              </label>
              <label className="block text-sm">
                Clocked out
                <input type="time" value={outAt} onChange={(e) => setOutAt(e.target.value)} className="field mt-1" />
              </label>
            </div>
            <p className="mt-1 text-xs text-ink-soft">Empty a box to clear that time. Hours use these times instead of the rota&apos;s.</p>
          </fieldset>
        )}

        <p className="mt-4 text-sm text-ink-soft" aria-live="polite">
          {valid
            ? `${dayLabel(f.date)}: ${formatMinutes(paidMinutes(f))} paid${f.end < f.start ? ", ending the next morning" : ""}.`
            : "Choose a day and times to see how long the shift is."}
        </p>

        {warnings.map((w) => (
          <p key={w.kind} role="status" className="mt-2 flex items-start gap-2 rounded-xl bg-alert-soft px-3 py-2 text-sm font-semibold text-alert">
            <Icon name="warn" className="mt-0.5 h-4 w-4 shrink-0" />
            {w.text}. You can still save it.
          </p>
        ))}
        {error && (
          <p role="alert" className="mt-2 text-sm font-semibold text-alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="submit" className="btn">
            <Icon name="check" className="h-4 w-4" />
            {shift ? "Save" : "Add shift"}
          </button>
          <button type="button" onClick={() => dialog.current?.close()} className="btn-quiet">
            Cancel
          </button>
          {shift && (
            <button type="button" onClick={onDelete} className="btn-quiet ml-auto !text-alert hover:!border-alert">
              <Icon name="trash" className="h-4 w-4" />
              Delete
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
