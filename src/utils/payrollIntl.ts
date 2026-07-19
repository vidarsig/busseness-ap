// International (US / Canada) payroll engine. Iceland keeps its own calc in
// Payroll.tsx (persónuafsláttur / staðgreiðsla) — this covers the countries
// whose statutory deductions are structurally different (FICA, CPP/EI).
//
// Statutory figures are 2026 (from IRS / CRA). Caps and exemptions are ANNUAL;
// a single monthly slip prorates them by /12. Income tax is a per-employee %
// (from the worker's W-4 / TD1) — v1 does not run the full bracket tables.
// Rates are constants here for correctness now; they can move to Settings later.

export interface PayLine { key: string; label: string; rate: number; amount: number; }
export interface IntlPayroll {
  employee: PayLine[];   // deducted from the paycheck
  net: number;
  employer: PayLine[];   // employer cost on top of gross
  employerTotal: number; // gross + employer cost
}

const US2026 = {
  socialSecurity: { rate: 6.2, annualMax: 184500 }, // both sides, capped
  medicare: { rate: 1.45 },                          // both sides, no cap
  addlMedicare: { rate: 0.9, threshold: 200000 },    // employee only, wages > $200k/yr
  futa: { rate: 0.6, annualMax: 7000 },              // employer only (after state credit)
};
const CA2026 = {
  cpp: { rate: 5.95, annualExemption: 3500, annualMax: 74600 }, // both sides (CPP1)
  cpp2: { rate: 4.0, lower: 74600, upper: 85000 },              // both sides, band above YMPE
  ei: { empRate: 1.63, employerRate: 2.282, annualMax: 68900 }, // employer = 1.4×
};

const r = (n: number) => Math.round(n);

/** Earnings in THIS slip that are still below an annual cap, given wages already
 *  paid this year (ytd). Optionally net of the per-period share of an exemption. */
function cappedBase(gross: number, ytd: number, annualMax?: number, annualExemption = 0): number {
  const room = annualMax != null ? Math.max(0, annualMax - ytd) : gross;
  return Math.max(0, Math.min(gross, room) - annualExemption / 12);
}
/** Earnings in THIS slip that fall inside the [lower, upper] annual band. */
function bandBase(gross: number, ytd: number, lower: number, upper: number): number {
  return Math.max(0, Math.min(ytd + gross, upper) - Math.max(ytd, lower));
}

export function isIntlPayroll(country: string): boolean {
  return country === 'US' || country === 'CA';
}

/**
 * @param federalPct  employee's federal income-tax withholding %
 * @param secondaryPct  employee's state (US) / provincial (CA) income-tax %
 * @param ytdWages  gross wages already paid to this employee earlier in the year
 *                  (for the annual caps on SS / CPP / EI); 0 for the first slip.
 */
export function calcIntlPayroll(
  country: string,
  gross: number,
  federalPct = 0,
  secondaryPct = 0,
  ytdWages = 0,
): IntlPayroll {
  const employee: PayLine[] = [];
  const employer: PayLine[] = [];

  if (country === 'US') {
    const ss = r(cappedBase(gross, ytdWages, US2026.socialSecurity.annualMax) * US2026.socialSecurity.rate / 100);
    const medicare = r(gross * US2026.medicare.rate / 100);
    const addlBase = bandBase(gross, ytdWages, US2026.addlMedicare.threshold, Infinity);
    const addlMedicare = r(addlBase * US2026.addlMedicare.rate / 100);
    employee.push({ key: 'ss', label: 'Social Security', rate: US2026.socialSecurity.rate, amount: ss });
    employee.push({ key: 'medicare', label: 'Medicare', rate: US2026.medicare.rate, amount: medicare });
    if (addlMedicare > 0) employee.push({ key: 'addlMedicare', label: 'Additional Medicare', rate: US2026.addlMedicare.rate, amount: addlMedicare });
    employer.push({ key: 'ss', label: 'Social Security (employer)', rate: US2026.socialSecurity.rate, amount: ss });
    employer.push({ key: 'medicare', label: 'Medicare (employer)', rate: US2026.medicare.rate, amount: medicare });
    employer.push({ key: 'futa', label: 'FUTA', rate: US2026.futa.rate, amount: r(cappedBase(gross, ytdWages, US2026.futa.annualMax) * US2026.futa.rate / 100) });
  } else if (country === 'CA') {
    const cpp = r(cappedBase(gross, ytdWages, CA2026.cpp.annualMax, CA2026.cpp.annualExemption) * CA2026.cpp.rate / 100);
    const cpp2 = r(bandBase(gross, ytdWages, CA2026.cpp2.lower, CA2026.cpp2.upper) * CA2026.cpp2.rate / 100);
    const eiBase = cappedBase(gross, ytdWages, CA2026.ei.annualMax);
    const ei = r(eiBase * CA2026.ei.empRate / 100);
    const eiEmployer = r(eiBase * CA2026.ei.employerRate / 100);
    employee.push({ key: 'cpp', label: 'CPP', rate: CA2026.cpp.rate, amount: cpp });
    if (cpp2 > 0) employee.push({ key: 'cpp2', label: 'CPP2', rate: CA2026.cpp2.rate, amount: cpp2 });
    employee.push({ key: 'ei', label: 'EI', rate: CA2026.ei.empRate, amount: ei });
    employer.push({ key: 'cpp', label: 'CPP (employer)', rate: CA2026.cpp.rate, amount: cpp });
    if (cpp2 > 0) employer.push({ key: 'cpp2', label: 'CPP2 (employer)', rate: CA2026.cpp2.rate, amount: cpp2 });
    employer.push({ key: 'ei', label: 'EI (employer)', rate: CA2026.ei.employerRate, amount: eiEmployer });
  }

  // Income tax — per-employee % of gross (federal + state/provincial).
  const federal = r(gross * federalPct / 100);
  const secondary = r(gross * secondaryPct / 100);
  if (federalPct > 0 || country === 'US' || country === 'CA') {
    employee.push({ key: 'federal', label: country === 'CA' ? 'Federal tax' : 'Federal income tax', rate: federalPct, amount: federal });
  }
  employee.push({ key: 'secondary', label: country === 'CA' ? 'Provincial tax' : 'State income tax', rate: secondaryPct, amount: secondary });

  const totalEmployee = employee.reduce((s, l) => s + l.amount, 0);
  const net = gross - totalEmployee;
  const employerTotal = gross + employer.reduce((s, l) => s + l.amount, 0);
  return { employee, net, employer, employerTotal };
}
