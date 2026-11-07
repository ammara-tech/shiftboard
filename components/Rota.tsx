"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";
import ShiftEditor from "@/components/ShiftEditor";
import { addShift, copyLastWeek, deleteShift, editShift, publishWeek, restoreShifts, type ShiftFields } from "@/lib/actions";
import { colourFor } from "@/lib/members";
import {
  addDays,
  calendarFile,
  clashes,
  dayLabel,
  DAY_NAMES,
  formatMinutes,
  onTimeOff,
  paidMinutes,
  shiftTimes,
  shiftsInWeek,
  todayIso,
  upcomingFor,
  weekDays,
  weekLabel,
  weekMessage,
  weekStart,
} from "@/lib/rota";
import { isManager, people } from "@/lib/team";
import { addToast, useApp } from "@/lib/store";
import type { Shift } from "@/lib/types";

/*
  The home screen: the week's rota.

  Managers: add a shift (or press + in an empty day), tap a shift to change or delete it, copy
  last week, and publish the week when it's ready. Drafts have a dashed amber edge and only
  managers can see them. Clashes (someone booked twice at once, or on a day they have time
  off) get a red warning.

  Staff: see their next shift at the top, the whole team's published rota below, and can add
  their shifts to their phone's calendar.

  On a laptop the week is a table (people down the side, days across the top). On a phone it's
  a list, one day at a time, which is easier to read on a small screen.
*/

export default function Rota() {
  const { team, uid, shifts, requests } = useApp();
  const today = todayIso();
  const [monday, setMonday] = useState(() => weekStart(today));
  const [editing, setEditing] = useState<{ shift: Shift | null; start: ShiftFields } | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [undo, setUndo] = useState<Shift | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const week = useMemo(() => shiftsInWeek(shifts, monday), [shifts, monday]);
  if (!team || !uid) return null;

  const manager = isManager(team, uid);
  const nameOf = (id: string) => team.members[id]?.name || "Someone";
  const days = weekDays(monday);
  const crew = people(team);
  const problems = clashes(week, requests, nameOf);
  const problemFor = (id: string) => problems.filter((p) => p.shiftId === id);
  const drafts = week.filter((s) => !s.published);
  const shown = onlyMine ? week.filter((s) => s.staffId === uid) : week;
  const mine = upcomingFor(uid, shifts, today);
  const lastWeekCount = shiftsInWeek(shifts, addDays(monday, -7)).length;

  function openNew(staffId = "", date = days[0] >= today ? days[0] : today <= days[6] ? today : days[0]) {
    setEditing({ shift: null, start: { staffId, date, start: "08:00", end: "16:00", breakMins: 30, note: "" } });
  }

  function save(fields: ShiftFields) {
    if (!editing) return;
    if (editing.shift) editShift(editing.shift, fields);
    else addShift(fields, false);
    setEditing(null);
  }

  function remove(shift: Shift) {
    deleteShift(shift);
    setEditing(null);
    setUndo(shift);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  }

  function publish() {
    const n = publishWeek(week);
    if (n) addToast(`Published ${n} ${n === 1 ? "shift" : "shifts"}. Your team can see the week now.`);
  }

  function copy() {
    const n = copyLastWeek(addDays(monday, -7));
    addToast(n ? `Copied ${n} ${n === 1 ? "shift" : "shifts"} from last week, as drafts` : "Nothing new to copy from last week");
  }

  function sendWeek() {
    const message = weekMessage(team!.name, monday, week.filter((s) => s.published), nameOf);
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  function downloadCalendar() {
    const url = URL.createObjectURL(new Blob([calendarFile(team!.name, mine, new Date())], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-shifts.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1 className="sr-only">{team.name}: the rota</h1>

      {/* Staff: your next shift */}
      {!manager && (
        <section aria-labelledby="next-title" className="mb-6 rounded-2xl border border-line bg-card p-5">
          <h2 id="next-title" className="text-sm font-bold uppercase tracking-widest text-ink-soft">
            Your next shift
          </h2>
          {mine[0] ? (
            <>
              <p className="mt-2 text-2xl font-extrabold">
                {mine[0].date === today ? "Today" : dayLabel(mine[0].date)}, {shiftTimes(mine[0])}
              </p>
              <p className="text-ink-soft">
                {formatMinutes(paidMinutes(mine[0]))} paid{mine[0].note ? ` · ${mine[0].note}` : ""}
                {mine.length > 1 ? ` · then ${mine.length - 1} more coming up` : ""}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={downloadCalendar} className="btn-quiet py-2 text-sm">
                  <Icon name="calendar" className="h-4 w-4" />
                  Add my shifts to my calendar
                </button>
                <Link href="/requests" className="btn-quiet py-2 text-sm">
                  <Icon name="send" className="h-4 w-4" />
                  Give a shift away
                </Link>
              </div>
            </>
          ) : (
            <p className="mt-2 text-ink-soft">No shifts coming up. When your manager publishes the rota, your shifts appear here.</p>
          )}
        </section>
      )}

      {/* The week, and what you can do with it */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMonday(addDays(monday, -7))} className="tool" aria-label="Previous week">
            <Icon name="left" />
          </button>
          <h2 className="min-w-[11rem] text-center text-lg font-extrabold" aria-live="polite">
            {weekLabel(monday)}
          </h2>
          <button type="button" onClick={() => setMonday(addDays(monday, 7))} className="tool" aria-label="Next week">
            <Icon name="chevron" />
          </button>
        </div>
        {monday !== weekStart(today) && (
          <button type="button" onClick={() => setMonday(weekStart(today))} className="btn-quiet px-3 py-1.5 text-sm">
            This week
          </button>
        )}
        {!manager && (
          <label className="ml-auto flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="h-4 w-4 accent-[var(--color-marker)]" />
            Only my shifts
          </label>
        )}
      </div>

      {manager && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => openNew()} className="btn py-2.5">
            <Icon name="plus" className="h-4 w-4" />
            Add shift
          </button>
          {lastWeekCount > 0 && (
            <button type="button" onClick={copy} className="btn-quiet py-2.5">
              <Icon name="copyWeek" className="h-4 w-4" />
              Copy last week
            </button>
          )}
          {drafts.length > 0 && (
            <button type="button" onClick={publish} className="btn-quiet py-2.5 !border-amber !text-amber">
              <Icon name="send" className="h-4 w-4" />
              Publish week ({drafts.length} {drafts.length === 1 ? "draft" : "drafts"})
            </button>
          )}
          {week.some((s) => s.published) && (
            <button type="button" onClick={sendWeek} className="btn-quiet py-2.5">
              <Icon name="whatsapp" className="h-4 w-4" />
              Send on WhatsApp
            </button>
          )}
        </div>
      )}

      {manager && problems.length > 0 && (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-alert/40 bg-alert-soft px-4 py-3 text-sm font-semibold text-alert">
          <Icon name="warn" className="mt-0.5 h-4 w-4 shrink-0" />
          {problems.length === 1 ? problems[0].text : `${new Set(problems.map((p) => p.shiftId)).size} shifts clash this week. Look for the red ones.`}
        </p>
      )}

      {week.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-line p-6 text-center text-ink-soft">
          {manager ? (
            <>
              <p className="font-semibold text-ink">No shifts this week yet.</p>
              <p className="mt-1">
                {lastWeekCount > 0 ? "Copy last week to start from it, or add shifts one by one." : "Add the first shift. Your team only sees it once you publish the week."}
              </p>
            </>
          ) : (
            <p>The rota for this week isn&apos;t out yet.</p>
          )}
        </div>
      )}

      {/* Laptop: the week as a table */}
      {week.length > 0 || manager ? (
        <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-line bg-card md:block">
          <table className="w-full table-fixed border-collapse text-sm">
            <caption className="sr-only">Shifts for {weekLabel(monday)}, one row per person</caption>
            <thead>
              <tr>
                <th scope="col" className="w-36 border-b border-line p-2 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Who
                </th>
                {days.map((d, i) => (
                  <th key={d} scope="col" className={`border-b border-line p-2 text-left text-xs font-bold uppercase tracking-wider ${d === today ? "text-marker" : "text-ink-soft"}`}>
                    {DAY_NAMES[i]} {Number(d.slice(8))}
                    {d === today && <span className="sr-only"> (today)</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...crew.filter((p) => !onlyMine || p.id === uid), ...(onlyMine ? [] : [{ id: "", name: "Open shifts", role: "", manager: false, joinedAt: 0 }])].map((p) => {
                const theirs = shown.filter((s) => s.staffId === p.id);
                if (p.id === "" && theirs.length === 0 && !manager) return null;
                return (
                  <tr key={p.id || "open"} className="border-b border-line last:border-0">
                    <th scope="row" className="p-2 text-left align-top font-semibold">
                      <span className="flex items-center gap-2">
                        {p.id ? <Avatar uid={p.id} name={p.name} /> : <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-amber text-amber">?</span>}
                        <span className="min-w-0">
                          <span className="block truncate">{p.id === uid ? `${p.name} (you)` : p.name}</span>
                          {p.role && <span className="block truncate text-xs font-normal text-ink-soft">{p.role}</span>}
                        </span>
                      </span>
                    </th>
                    {days.map((d) => {
                      const here = theirs.filter((s) => s.date === d);
                      const off = p.id && onTimeOff(p.id, d, requests);
                      return (
                        <td key={d} className={`group p-1.5 align-top ${d === today ? "bg-marker-soft/40" : ""}`}>
                          <div className="flex min-h-12 flex-col gap-1">
                            {off && <span className="rounded-lg bg-page px-2 py-1 text-xs font-semibold text-ink-soft">Time off</span>}
                            {here.map((s) => (
                              <ShiftChip key={s.id} shift={s} manager={manager} warn={problemFor(s.id).map((w) => w.text)} onOpen={() => setEditing({ shift: s, start: s })} />
                            ))}
                            {manager && (
                              <button
                                type="button"
                                onClick={() => openNew(p.id, d)}
                                className="rounded-lg border border-dashed border-line py-1 text-ink-soft opacity-0 hover:border-marker hover:text-marker focus:opacity-100 group-hover:opacity-100"
                                aria-label={`Add a shift for ${p.id ? p.name : "nobody yet (open shift)"} on ${dayLabel(d)}`}
                              >
                                <Icon name="plus" className="mx-auto h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Phone: one day at a time */}
      <ol className="mt-6 space-y-4 md:hidden">
        {days.map((d) => {
          const here = shown.filter((s) => s.date === d);
          if (here.length === 0 && !manager) return null;
          return (
            <li key={d}>
              <h3 className={`flex items-center justify-between text-sm font-bold uppercase tracking-widest ${d === today ? "text-marker" : "text-ink-soft"}`}>
                <span>
                  {d === today ? "Today · " : ""}
                  {dayLabel(d)}
                </span>
                {manager && (
                  <button type="button" onClick={() => openNew("", d)} className="tool h-8 min-w-8" aria-label={`Add a shift on ${dayLabel(d)}`}>
                    <Icon name="plus" className="h-4 w-4" />
                  </button>
                )}
              </h3>
              {here.length === 0 ? (
                <p className="mt-1 text-sm text-ink-soft">No shifts.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {here.map((s) => (
                    <li key={s.id}>
                      <ShiftChip shift={s} manager={manager} wide name={s.staffId ? (s.staffId === uid ? "You" : nameOf(s.staffId)) : "Open shift"} warn={problemFor(s.id).map((w) => w.text)} onOpen={() => setEditing({ shift: s, start: s })} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {undo && (
        <div role="status" className="rise fixed inset-x-4 bottom-6 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-page shadow-xl">
          <span className="flex-1 text-sm font-semibold">Shift deleted</span>
          <button
            type="button"
            onClick={() => {
              restoreShifts([undo]);
              setUndo(null);
            }}
            className="rounded-lg px-3 py-1 font-bold text-marker-soft hover:bg-white/10"
          >
            Undo
          </button>
        </div>
      )}

      {editing && (
        <ShiftEditor
          team={team}
          start={editing.start}
          shift={editing.shift}
          shifts={shifts}
          requests={requests}
          onSave={save}
          onDelete={() => editing.shift && remove(editing.shift)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/* One shift on the rota. Managers tap it to edit; for staff it's just information. */
function ShiftChip({ shift, manager, warn, onOpen, wide, name }: { shift: Shift; manager: boolean; warn: string[]; onOpen: () => void; wide?: boolean; name?: string }) {
  const colour = shift.staffId ? colourFor(shift.staffId) : undefined;
  const body = (
    <>
      <span className="flex items-center gap-1.5 font-bold">
        {warn.length > 0 && <Icon name="warn" className="h-3.5 w-3.5 shrink-0 text-alert" label="Clash" />}
        {wide && name && <span className="mr-1">{name}</span>}
        <span className={wide ? "font-semibold text-ink-soft" : ""}>{shiftTimes(shift)}</span>
      </span>
      {(shift.note || !shift.published || !shift.staffId) && (
        <span className="mt-0.5 block truncate text-xs text-ink-soft">
          {!shift.published && <span className="font-bold text-amber">Draft</span>}
          {!shift.published && (shift.note || !shift.staffId) && " · "}
          {!shift.staffId && <span className="font-bold text-amber">Open</span>}
          {!shift.staffId && shift.note && " · "}
          {shift.note}
        </span>
      )}
      {warn.map((w) => (
        <span key={w} className="mt-0.5 block text-xs font-semibold text-alert">
          {w}
        </span>
      ))}
    </>
  );
  const style = {
    borderLeftColor: colour ?? "var(--color-amber)",
  };
  const cls = `block w-full rounded-lg border border-l-4 bg-card px-2 py-1.5 text-left ${shift.published ? "border-line" : "border-dashed border-amber"} ${
    warn.length ? "ring-2 ring-alert/60" : ""
  } ${wide ? "px-3 py-2.5" : ""}`;
  if (!manager) {
    return (
      <div className={cls} style={style}>
        {body}
      </div>
    );
  }
  return (
    <button type="button" onClick={onOpen} className={`${cls} hover:border-marker`} style={style} aria-label={`${name ? `${name}, ` : ""}${shiftTimes(shift)}${shift.published ? "" : ", draft"}${warn.length ? `, ${warn.join(", ")}` : ""}. Edit`}>
      {body}
    </button>
  );
}
