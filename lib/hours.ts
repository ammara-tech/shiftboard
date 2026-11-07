import { addDays, formatMinutes, paidMinutes, weekDays } from "@/lib/rota";
import type { PayRates, Shift } from "@/lib/types";

/*
  Hours and pay for a week, from the rota.
  - Hours are paid time: each shift's length minus its unpaid break.
  - Pay is an estimate: hours × the person's rate per hour. It doesn't include overtime or Sunday
    and public holiday rates, which the Basic Conditions of Employment Act sets, so the Hours page
    says it's a guide for payroll, not a payslip.
  - More than 45 hours in a week is flagged, because 45 ordinary hours a week is the usual limit in
    South Africa.
  - Only published shifts count, so a draft rota doesn't change anyone's hours.
  Tested in tests/hours.test.ts.
*/

export const WEEKLY_LIMIT_MINUTES = 45 * 60;

export type HoursRow = {
  staffId: string;
  shifts: number;
  minutes: number;
  perDay: number[]; // paid minutes Mon … Sun
  pay: number | null; // cents, or null if no rate is set
  overLimit: boolean;
};

/** Everyone's hours for the week that starts on `monday` (only people with shifts, plus anyone in `include`) */
export function weekHours(shifts: Shift[], monday: string, rates: PayRates, include: string[] = []): HoursRow[] {
  const days = weekDays(monday);
  const end = addDays(monday, 6);
  const rows = new Map<string, HoursRow>();
  const row = (staffId: string) => {
    if (!rows.has(staffId)) rows.set(staffId, { staffId, shifts: 0, minutes: 0, perDay: [0, 0, 0, 0, 0, 0, 0], pay: null, overLimit: false });
    return rows.get(staffId)!;
  };
  include.forEach(row);
  for (const s of shifts) {
    if (!s.published || !s.staffId || s.date < monday || s.date > end) continue;
    const r = row(s.staffId);
    const mins = paidMinutes(s);
    r.shifts += 1;
    r.minutes += mins;
    r.perDay[days.indexOf(s.date)] += mins;
  }
  for (const r of rows.values()) {
    const rate = rates[r.staffId];
    r.pay = typeof rate === "number" && rate > 0 ? Math.round((r.minutes / 60) * rate) : null;
    r.overLimit = r.minutes > WEEKLY_LIMIT_MINUTES;
  }
  return [...rows.values()];
}

export function totals(rows: HoursRow[]) {
  return {
    minutes: rows.reduce((n, r) => n + r.minutes, 0),
    pay: rows.reduce((n, r) => n + (r.pay ?? 0), 0),
    missingRates: rows.filter((r) => r.minutes > 0 && r.pay === null).length,
  };
}

/** Hours as a decimal for spreadsheets: 450 minutes → "7.50" */
export const decimalHours = (minutes: number) => (minutes / 60).toFixed(2);

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** The week's hours as a CSV file for payroll or an accountant (opens in Excel or Google Sheets) */
export function hoursCsv(rows: HoursRow[], monday: string, nameOf: (id: string) => string, withPay: boolean) {
  const days = weekDays(monday);
  const head = ["Name", ...days, "Shifts", "Hours", ...(withPay ? ["Rate per hour (R)", "Estimated pay (R)"] : [])];
  const lines = [head.join(",")];
  for (const r of rows) {
    const cells = [nameOf(r.staffId), ...r.perDay.map(decimalHours), String(r.shifts), decimalHours(r.minutes)];
    if (withPay) cells.push(r.pay === null ? "" : (Math.round((r.pay / Math.max(r.minutes, 1)) * 60) / 100).toFixed(2), r.pay === null ? "" : (r.pay / 100).toFixed(2));
    lines.push(cells.map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

export { formatMinutes };
