import { AppData } from '../types';

export interface PlanLimits {
  transactionsPerMonth: number | null;   // null = unlimited
  invoicesPerMonth: number | null;
  activeJobs: number | null;
  stockItems: number | null;
  payrollWorkers: number | null;
  cloudSync: boolean;
  bankImport: boolean;
  vatExport: boolean;
  invoiceWatermark: boolean;
  teamMembers: number | null;
  allLanguages: boolean;
}

export const LIMITS: Record<'free' | 'pro' | 'business', PlanLimits> = {
  free: {
    transactionsPerMonth: 50,
    invoicesPerMonth: 5,
    activeJobs: 2,
    stockItems: 20,
    payrollWorkers: 2,
    cloudSync: false,
    bankImport: false,
    vatExport: false,
    invoiceWatermark: true,
    teamMembers: 1,
    allLanguages: false,
  },
  pro: {
    transactionsPerMonth: null,
    invoicesPerMonth: null,
    activeJobs: null,
    stockItems: null,
    payrollWorkers: null,
    cloudSync: true,
    bankImport: true,
    vatExport: true,
    invoiceWatermark: false,
    teamMembers: 1,
    allLanguages: true,
  },
  business: {
    transactionsPerMonth: null,
    invoicesPerMonth: null,
    activeJobs: null,
    stockItems: null,
    payrollWorkers: null,
    cloudSync: true,
    bankImport: true,
    vatExport: true,
    invoiceWatermark: false,
    teamMembers: 5,
    allLanguages: true,
  },
};

export function getPlanLimits(data: AppData): PlanLimits {
  return LIMITS[data.settings.plan ?? 'free'];
}

/** Returns true if the user has hit the monthly transaction limit */
export function isTransactionLimitReached(data: AppData): boolean {
  const limits = getPlanLimits(data);
  if (limits.transactionsPerMonth === null) return false;
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const count = (data.transactions ?? []).filter(tx => new Date(tx.date) >= monthStart).length;
  return count >= limits.transactionsPerMonth;
}

/** Returns true if the user has hit the monthly invoice limit */
export function isInvoiceLimitReached(data: AppData): boolean {
  const limits = getPlanLimits(data);
  if (limits.invoicesPerMonth === null) return false;
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const count = (data.invoices ?? []).filter(inv => new Date(inv.date) >= monthStart).length;
  return count >= limits.invoicesPerMonth;
}

/** Returns true if the user has hit the active job limit */
export function isJobLimitReached(data: AppData): boolean {
  const limits = getPlanLimits(data);
  if (limits.activeJobs === null) return false;
  // Any job that is not yet closed (complete/cancelled) counts toward the limit.
  const count = (data.jobs ?? []).filter(j => j.status !== 'complete' && j.status !== 'cancelled').length;
  return count >= limits.activeJobs;
}

/** Returns true if the user has hit the stock items limit */
export function isStockLimitReached(data: AppData): boolean {
  const limits = getPlanLimits(data);
  if (limits.stockItems === null) return false;
  return (data.stockItems ?? []).length >= limits.stockItems;
}

/** Returns true if the user has hit the payroll workers limit */
export function isPayrollLimitReached(data: AppData): boolean {
  const limits = getPlanLimits(data);
  if (limits.payrollWorkers === null) return false;
  const uniqueWorkers = new Set((data.payrollEntries ?? []).map(p => p.employeeName)).size;
  return uniqueWorkers >= limits.payrollWorkers;
}
