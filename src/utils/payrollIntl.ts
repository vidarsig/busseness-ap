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
  futa: { rate: 0.6, annualMax: 7000 },              // employer only (after state credit)
};
const CA2026 = {
  cpp: { rate: 5.95, annualExemption: 3500, annualMax: 74600 }, // both sides
  ei: { empRate: 1.63, employerRate: 2.282, annualMax: 68900 }, // employer = 1.4×
};

const r = (n: number) => Math.round(n);

/** Base for a percentage deduction on a monthly slip: gross capped at the
 *  monthly share of the annual max, less the monthly share of any exemption. */
function monthlyBase(gross: number, annualMax?: number, annualExemption = 0): number {
  const capped = annualMax != null ? Math.min(gross, annualMax / 12) : gross;
  return Math.max(0, capped - annualExemption / 12);
}

export function isIntlPayroll(country: string): boolean {
  return country === 'US' || country === 'CA';
}

/**
 * @param federalPct  employee's federal income-tax withholding %
 * @param secondaryPct  employee's state (US) / provincial (CA) income-tax %
 */
export function calcIntlPayroll(
  country: string,
  gross: number,
  federalPct = 0,
  secondaryPct = 0,
): IntlPayroll {
  const employee: PayLine[] = [];
  const employer: PayLine[] = [];

  if (country === 'US') {
    const ssBase = monthlyBase(gross, US2026.socialSecurity.annualMax);
    const ss = r(ssBase * US2026.socialSecurity.rate / 100);
    const medicare = r(gross * US2026.medicare.rate / 100);
    employee.push({ key: 'ss', label: 'Social Security', rate: US2026.socialSecurity.rate, amount: ss });
    employee.push({ key: 'medicare', label: 'Medicare', rate: US2026.medicare.rate, amount: medicare });
    employer.push({ key: 'ss', label: 'Social Security (employer)', rate: US2026.socialSecurity.rate, amount: ss });
    employer.push({ key: 'medicare', label: 'Medicare (employer)', rate: US2026.medicare.rate, amount: medicare });
    employer.push({ key: 'futa', label: 'FUTA', rate: US2026.futa.rate, amount: r(monthlyBase(gross, US2026.futa.annualMax) * US2026.futa.rate / 100) });
  } else if (country === 'CA') {
    const cppBase = monthlyBase(gross, CA2026.cpp.annualMax, CA2026.cpp.annualExemption);
    const cpp = r(cppBase * CA2026.cpp.rate / 100);
    const eiBase = monthlyBase(gross, CA2026.ei.annualMax);
    const ei = r(eiBase * CA2026.ei.empRate / 100);
    const eiEmployer = r(eiBase * CA2026.ei.employerRate / 100);
    employee.push({ key: 'cpp', label: 'CPP', rate: CA2026.cpp.rate, amount: cpp });
    employee.push({ key: 'ei', label: 'EI', rate: CA2026.ei.empRate, amount: ei });
    employer.push({ key: 'cpp', label: 'CPP (employer)', rate: CA2026.cpp.rate, amount: cpp });
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
