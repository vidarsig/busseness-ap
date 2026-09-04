// VÍSITALA NEYSLUVERÐS — the Icelandic consumer price index, by month.
//
// Verðtryggð debt is written at a nominal principal and a base index; what is
// actually owed is nominal × (index now ÷ base index). Without this table the
// balance sheet carries the nominal figure and understates every index-linked
// loan by the whole of the indexation.
//
// ⭐ EACH KEY IS THE MONTH THE VALUE IS IN FORCE, NOT THE MONTH IT MEASURES.
// Hagstofa publishes the index for a month and it governs verðtrygging TWO
// MONTHS LATER — the index measured in April 2026 (683,8) is the one that
// applies to a gjalddagi in June 2026. `priceIndexAt` looks the table up by the
// date being valued, so the table has to be keyed by the month in force. Get
// that wrong and every indexed balance is two months stale.
//
// Rebuilt 4 Sept 2026 from the owner's own greiðsluáætlun workbook, whose
// series was checked against Hagstofa's published figures and matched exactly
// on every point that could be verified (nóv 2025 658,2 · des 665,8 ·
// jan 2026 668,3 · apríl 683,8 · maí 684,3 · júní 690,7 · júlí 693,2).
// The table it replaced was wrong in 31 of 38 months, by as much as 15,8
// points, and stopped at a value copied in from a bond's base index.
//
// This run is COMPLETE AND GAP-FREE, 2022-06 to 2026-09. To extend it: Hagstofa
// publishes the new month at the end of each month; add it here keyed TWO
// MONTHS ON. A lookup takes the nearest EARLIER month, so a missing month
// understates rather than overstates.
export const IS_PRICE_INDEX: Record<string, number> = {
  // 2022
  '2022-06': 535.4,
  '2022-07': 539.5,
  '2022-08': 547.1,
  '2022-09': 553.5,
  '2022-10': 555.1,
  '2022-11': 555.6,
  '2022-12': 559.3,
  // 2023
  '2023-01': 560.9,
  '2023-02': 564.6,
  '2023-03': 569.4,
  '2023-04': 577.3,
  '2023-05': 580.7,
  '2023-06': 588.3,
  '2023-07': 590.6,
  '2023-08': 595.6,
  '2023-09': 595.8,
  '2023-10': 597.8,
  '2023-11': 599.9,
  '2023-12': 603.5,
  // 2024
  '2024-01': 605.8,
  '2024-02': 608.3,
  '2024-03': 607.3,
  '2024-04': 615.4,
  '2024-05': 620.3,
  '2024-06': 623.7,
  '2024-07': 627.3,
  '2024-08': 630.3,
  '2024-09': 633.2,
  '2024-10': 633.8,
  '2024-11': 632.3,
  '2024-12': 634.1,
  // 2025
  '2025-01': 634.7,
  '2025-02': 637.2,
  '2025-03': 635.5,
  '2025-04': 641.3,
  '2025-05': 643.7,
  '2025-06': 649.7,
  '2025-07': 651,
  '2025-08': 656.5,
  '2025-09': 658.6,
  '2025-10': 657.6,
  '2025-11': 658.3,
  '2025-12': 661.4,
  // 2026
  '2026-01': 658.2,
  '2026-02': 665.8,
  '2026-03': 668.3,
  '2026-04': 674.6,
  '2026-05': 678.3,
  '2026-06': 683.8,
  '2026-07': 684.3,
  '2026-08': 690.7,
  '2026-09': 693.2,
};

// The index for a date: the nearest month at or before it. Returns undefined
// when the date is earlier than anything we hold — the caller must then not
// pretend to index.
export function priceIndexAt(date: string, series: Record<string, number>): number | undefined {
  const month = String(date).slice(0, 7);
  let best: number | undefined;
  for (const k of Object.keys(series).sort()) {
    if (k <= month) best = series[k]; else break;
  }
  return best;
}

// How much a nominal figure has grown by `date`. 1 when the loan is not indexed
// or the index is unknown, so an unconfigured loan behaves exactly as before.
export function indexFactor(baseIndex: number | undefined, date: string, series: Record<string, number>): number {
  if (!baseIndex || baseIndex <= 0) return 1;
  const now = priceIndexAt(date, series);
  return now ? now / baseIndex : 1;
}
