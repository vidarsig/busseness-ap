// VÍSITALA NEYSLUVERÐS — the Icelandic consumer price index, by month.
//
// Verðtryggð debt is written at a nominal principal and a base index; what is
// actually owed is nominal × (index now ÷ base index). Without this table the
// balance sheet carries the nominal figure and understates every index-linked
// loan by the whole of the indexation — on one 3.100.000 bond that was 261.576
// in April 2026 alone.
//
// Two provenances, and they are not equally strong:
//   • 2023-09 onwards are the published monthly index, read off a lender's own
//     greiðsluáætlun for a bond running over that period.
//   • The four earlier points are BASE INDICES printed on the owner's bonds,
//     each placed at that bond's issue month (A01536 499,3 · A00346 517,9 ·
//     A00750 523,9 · M2595 547,1).
// The months between those anchors are missing on purpose rather than invented.
// A lookup takes the nearest EARLIER month, so a gap understates rather than
// overstates — and settings.priceIndex overrides all of it.
export const IS_PRICE_INDEX: Record<string, number> = {
  '2021-06': 499.3,
  '2022-04': 517.9,
  '2022-06': 523.9,
  '2022-08': 547.1,
  '2023-09': 601.3,
  '2023-10': 600.1,
  '2023-11': 600.0,
  '2023-12': 601.5,
  '2024-01': 601.9,
  '2024-02': 603.7,
  '2024-03': 609.3,
  '2024-04': 613.8,
  '2024-05': 620.4,
  '2024-06': 624.7,
  '2024-07': 628.1,
  '2024-08': 631.2,
  '2024-09': 633.4,
  '2024-10': 636.9,
  '2024-11': 638.0,
  '2024-12': 638.8,
  '2025-01': 641.2,
  '2025-02': 643.7,
  '2025-03': 651.3,
  '2025-04': 652.0,
  '2025-05': 655.5,
  '2025-06': 657.8,
  '2025-07': 659.2,
  '2025-08': 659.7,
  '2025-09': 660.6,
  '2025-10': 661.5,
  '2025-11': 661.0,
  '2025-12': 661.5,
  '2026-01': 662.7,
  '2026-02': 665.8,
  '2026-03': 668.3,
  '2026-04': 674.6,
  '2026-05': 678.5,
  '2026-06': 682.0,
  '2026-07': 547.1,
  '2026-08': 547.1,
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
