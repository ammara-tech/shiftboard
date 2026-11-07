/*
  Pay rates and pay, in rand. Money is kept in cents (whole numbers), so adding up never
  gives answers like R 0,30000000004. Tested in tests/money.test.ts.
*/

export const MAX_RATE = 10_000_00; // R10 000 an hour: anything more is a typing mistake

/** 3299 → "R 32,99", 125050 → "R 1 250,50" (South African style, the same on every phone) */
export function formatRand(cents: number) {
  const abs = Math.abs(Math.round(cents));
  const rands = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${cents < 0 ? "-" : ""}R ${rands},${String(abs % 100).padStart(2, "0")}`;
}

/** "32,99", "32.99", "R32", "R 1 250,50" → cents, or null if it isn't an amount */
export function parseRand(text: string): number | null {
  const t = text.trim().replace(/^R\s*/i, "").replace(/[\s ]/g, "");
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t.replace(",", ".")) * 100);
  return cents > 0 && cents <= MAX_RATE ? cents : null;
}
