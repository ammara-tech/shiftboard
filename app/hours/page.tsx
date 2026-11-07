"use client";

import { useState } from "react";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";
import { formatMinutes, hoursCsv, totals, weekHours } from "@/lib/hours";
import { formatRand } from "@/lib/money";
import { addDays, DAY_NAMES, todayIso, weekLabel, weekStart } from "@/lib/rota";
import { isManager, personName, rotaIds } from "@/lib/team";
import { useApp } from "@/lib/store";

/*
  /hours: hours worked per week, from the published rota.
  - Managers: everyone's hours, a pay estimate from the rates on the Team page, and
    "Download for payroll" (a CSV file for Excel, Google Sheets or an accountant).
  - Staff: their own hours, day by day (pay rates are private to managers).
  When people clock in and out, their real times are used, the rota's hours are shown as
  "planned", and late arrivals are counted.
  More than 45 hours in a week is flagged. lib/hours.ts does the sums.
*/

export default function HoursPage() {
  const { team, uid, shifts, rates } = useApp();
  const [monday, setMonday] = useState(() => weekStart(todayIso()));
  if (!team || !uid) return null;
  const manager = isManager(team, uid);
  const nameOf = (id: string) => (team.members[id] || team.extras?.[id] ? personName(team, id) : "Someone who left");
  const all = weekHours(shifts, monday, manager ? rates : {}, manager ? rotaIds(team) : [uid]).sort((a, b) => nameOf(a.staffId).localeCompare(nameOf(b.staffId)));
  const rows = manager ? all : all.filter((r) => r.staffId === uid);
  const sum = totals(rows);

  function download() {
    const csv = hoursCsv(rows, monday, nameOf, manager);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `hours-${monday}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight">{manager ? "Hours and pay" : "Your hours"}</h1>
      <p className="mt-2 text-ink-soft">
        {manager
          ? "From the published rota: each shift's length minus its unpaid break, or the clocked times when people clocked in and out."
          : "From your published shifts: each shift's length minus its unpaid break, or your clocked times."}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setMonday(addDays(monday, -7))} className="tool" aria-label="Previous week">
          <Icon name="left" />
        </button>
        <h2 className="min-w-[11rem] text-center text-lg font-extrabold" aria-live="polite">
          {weekLabel(monday)}
        </h2>
        <button type="button" onClick={() => setMonday(addDays(monday, 7))} className="tool" aria-label="Next week">
          <Icon name="chevron" />
        </button>
        <button type="button" onClick={download} disabled={sum.minutes === 0} className="btn-quiet ml-auto py-2 text-sm">
          <Icon name="download" className="h-4 w-4" />
          {manager ? "Download for payroll" : "Download my hours"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <p className="rounded-2xl border border-line bg-card p-4">
          <span className="block text-sm font-semibold text-ink-soft">{manager ? "Team hours" : "Hours this week"}</span>
          <span className="text-3xl font-extrabold">{formatMinutes(sum.minutes)}</span>
        </p>
        {manager && (
          <p className="rounded-2xl border border-line bg-card p-4">
            <span className="block text-sm font-semibold text-ink-soft">Estimated pay</span>
            <span className="text-3xl font-extrabold text-teal">{formatRand(sum.pay)}</span>
            {sum.missingRates > 0 && (
              <span className="mt-1 block text-xs text-ink-soft">
                {sum.missingRates} {sum.missingRates === 1 ? "person has" : "people have"} no rate yet. Add rates on the Team page.
              </span>
            )}
          </p>
        )}
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">Paid hours per person for {weekLabel(monday)}</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wider text-ink-soft">
              <th scope="col" className="p-3">
                Who
              </th>
              {DAY_NAMES.map((d) => (
                <th key={d} scope="col" className="p-3 text-right">
                  {d}
                </th>
              ))}
              <th scope="col" className="p-3 text-right">
                Total
              </th>
              {manager && (
                <th scope="col" className="p-3 text-right">
                  Pay
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.staffId} className="border-b border-line last:border-0">
                <th scope="row" className="p-3 text-left font-semibold">
                  <span className="flex items-center gap-2">
                    <Avatar uid={r.staffId} name={nameOf(r.staffId)} />
                    {r.staffId === uid ? `${nameOf(r.staffId)} (you)` : nameOf(r.staffId)}
                  </span>
                </th>
                {r.perDay.map((m, i) => (
                  <td key={i} className={`p-3 text-right tabular-nums ${m ? "" : "text-ink-soft"}`}>
                    {m ? formatMinutes(m) : "–"}
                  </td>
                ))}
                <td className="p-3 text-right font-bold tabular-nums">
                  {formatMinutes(r.minutes)}
                  {r.clocked > 0 && r.planned !== r.minutes && (
                    <span className="block text-xs font-normal text-ink-soft">planned {formatMinutes(r.planned)}</span>
                  )}
                  {r.late > 0 && <span className="block text-xs font-semibold text-alert">late {r.late}×</span>}
                  {r.overLimit && (
                    <span className="mt-0.5 flex items-center justify-end gap-1 text-xs font-semibold text-alert">
                      <Icon name="warn" className="h-3.5 w-3.5" />
                      Over 45h
                    </span>
                  )}
                </td>
                {manager && <td className="p-3 text-right tabular-nums">{r.pay === null ? <span className="text-ink-soft">No rate</span> : formatRand(r.pay)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-sm text-ink-soft">
        {manager
          ? "Pay is a guide for payroll, not a payslip: it's hours × each person's rate, and doesn't add overtime, Sunday or public holiday rates. More than 45 ordinary hours a week is the usual limit in South Africa, so those weeks are flagged."
          : "Only published shifts count. Your pay rate is only visible to managers."}
      </p>
    </div>
  );
}
