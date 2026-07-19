export type Currency = 'ISK' | 'EUR' | 'USD' | 'GBP' | 'DKK' | 'NOK' | 'SEK' | 'AUD' | 'CAD' | 'NZD';
// 'transfer' = money in/out that is NOT business income or expense:
// transfers between own accounts, loans, owner's own money, asset purchases,
// refunds. These are deliberately EXCLUDED from profit/loss and VAT — the
// calculation engine only ever sums 'income' and 'expense'.
export type TransactionType = 'income' | 'expense' | 'transfer';
export type VATRate = number;
export type Language = 'is' | 'en' | 'de' | 'fr' | 'nl' | 'no' | 'da' | 'sv';
export type View =
  | 'dashboard' | 'transactions' | 'recurring' | 'bankimport' | 'rules'
  | 'invoices' | 'accounts' | 'budget' | 'payroll'
  | 'vat' | 'vatreturn' | 'reports' | 'annual' | 'settings' | 'tasks' | 'ai'
  | 'stock' | 'suppliers' | 'contacts' | 'jobs' | 'users' | 'upgrade' | 'reviews';

// ── User roles ──────────────────────────────────────────────
export type UserRole = 'owner' | 'manager' | 'accountant' | 'staff' | 'viewer';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
  permissions: UserPermissions;
}

export interface UserPermissions {
  canViewFinancials: boolean;    // transactions, reports, VAT
  canEditTransactions: boolean;
  canViewPayroll: boolean;
  canEditPayroll: boolean;
  canViewInvoices: boolean;
  canEditInvoices: boolean;
  canViewStock: boolean;
  canEditStock: boolean;
  canViewJobs: boolean;
  canEditJobs: boolean;
  canLogTime: boolean;           // clock in/out on jobs
  canApproveJobReports: boolean; // approve a job report & convert it to an invoice
  canViewSettings: boolean;
  canExportData: boolean;
  // Optional per-screen access overrides. When a screen has an explicit entry
  // here it wins over the grouped flags above — lets the owner turn any single
  // screen on/off. Absent = fall back to the grouped logic.
  viewOverrides?: Partial<Record<View, boolean>>;
}

export const DEFAULT_PERMISSIONS: Record<UserRole, UserPermissions> = {
  owner: { canViewFinancials:true, canEditTransactions:true, canViewPayroll:true, canEditPayroll:true, canViewInvoices:true, canEditInvoices:true, canViewStock:true, canEditStock:true, canViewJobs:true, canEditJobs:true, canLogTime:true, canApproveJobReports:true, canViewSettings:true, canExportData:true },
  manager: { canViewFinancials:true, canEditTransactions:true, canViewPayroll:true, canEditPayroll:false, canViewInvoices:true, canEditInvoices:true, canViewStock:true, canEditStock:true, canViewJobs:true, canEditJobs:true, canLogTime:true, canApproveJobReports:true, canViewSettings:false, canExportData:true },
  accountant: { canViewFinancials:true, canEditTransactions:true, canViewPayroll:true, canEditPayroll:true, canViewInvoices:true, canEditInvoices:true, canViewStock:false, canEditStock:false, canViewJobs:true, canEditJobs:false, canLogTime:false, canApproveJobReports:true, canViewSettings:false, canExportData:true },
  staff: { canViewFinancials:false, canEditTransactions:false, canViewPayroll:false, canEditPayroll:false, canViewInvoices:false, canEditInvoices:false, canViewStock:true, canEditStock:false, canViewJobs:true, canEditJobs:false, canLogTime:true, canApproveJobReports:false, canViewSettings:false, canExportData:false },
  viewer: { canViewFinancials:true, canEditTransactions:false, canViewPayroll:false, canEditPayroll:false, canViewInvoices:true, canEditInvoices:false, canViewStock:true, canEditStock:false, canViewJobs:true, canEditJobs:false, canLogTime:false, canApproveJobReports:false, canViewSettings:false, canExportData:false },
};

export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskStatus = 'open' | 'done';

export interface Task {
  id: string;
  title: string;
  note?: string;
  dueDate?: string;       // ISO date YYYY-MM-DD
  priority: TaskPriority;
  status: TaskStatus;
  linkedView?: View;      // optional shortcut to an app screen
  createdAt: string;
  completedAt?: string;
}

export interface CategoryRule {
  id: string;
  pattern: string;        // case-insensitive substring match against description
  category: string;
  type: TransactionType;
  vatRate: VATRate;
  useCount: number;
  createdAt: string;
  lastUsed?: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  category: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  eurToIskRate: number;
  vatRate: VATRate;
  reference?: string;
  accountNumber?: string;
  receiptNote?: string;
  receiptUrl?: string;   // base64 image of the attached receipt/invoice (proof)
  jobId?: string;        // optional: tag this purchase to a Verkbókhald project (shows as a job cost; NOT double-booked)
  accountId?: string;    // optional: book this entry onto a chart-of-accounts key (Bókhaldslyklar / data.accounts)
  interestAmount?: number; // optional: for a loan payment, the interest portion (a financial expense). Only the principal (amount − interest) reduces the loan balance; interest hits the P&L.
}

export interface BalanceSheetItem {
  id: string;
  name: string;
  nameEn: string;
  section: 'fixed_assets' | 'current_assets' | 'equity' | 'long_term_liabilities' | 'current_liabilities';
  amount: number;
}

export interface Account {
  id: string;
  number: string;
  name: string;
  nameEn: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  isSystem: boolean;
  isActive: boolean;
  // Balance-sheet accounts (asset/liability/equity) carry a balance across years.
  // openingBalance is the starting figure as of openingYear; later years are
  // derived by rolling this forward with the account's movements. Undefined for
  // revenue/expense (P&L) accounts, which reset each year.
  openingBalance?: number;
  openingYear?: number;
}

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: VATRate;
  accountNumber?: string;
}

export interface InvoiceCustomer {
  name: string;
  kennitala?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  email?: string;
  phone?: string;
}

export interface Invoice {
  id: string;
  number: string;
  type: 'invoice' | 'quote';
  date: string;
  dueDate: string;
  customer: InvoiceCustomer;
  lines: InvoiceLine[];
  notes?: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  currency: Currency;
  eurToIskRate: number;
  creditNoteOf?: string;  // invoice number this credit note corrects
  photos?: InvoicePhoto[]; // attached photos (proof of work, etc.)
  discountType?: 'percent' | 'amount'; // whole-invoice discount (optional)
  discountValue?: number;              // percent (e.g. 10) or a fixed amount in the invoice currency
}

export interface InvoicePhoto {
  id: string;
  dataUrl: string;   // base64 image
  caption?: string;
  createdAt: string; // ISO datetime
}

export interface RecurringTransaction {
  id: string;
  description: string;
  category: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  vatRate: VATRate;
  frequency: 'monthly' | 'quarterly' | 'annually';
  dayOfMonth: number;
  startDate: string;
  endDate?: string;
  lastGenerated?: string;
  isActive: boolean;
  accountNumber?: string;
}

export interface BudgetLine {
  id: string;
  year: number;
  category: string;
  type: TransactionType;
  amounts: number[]; // 12 values, one per month
}

export interface PayrollEntry {
  id: string;
  month: string; // YYYY-MM
  employeeId?: string; // links to Employee master record when chosen
  employeeName: string;
  employeeKennitala?: string;
  grossWage: number;
  employeePension: number;
  taxWithheld: number;
  employerPension: number;
  socialInsurance: number;
  netWage: number;
  notes?: string;
}

// Employee master record. Holds the agreed pay for each individual —
// BOTH a monthly salary and an hourly rate — so a payroll run can be
// started from either basis. Sensitive material (kennitala + pay).
export interface Employee {
  id: string;
  name: string;
  kennitala?: string;
  monthlySalary: number; // agreed gross monthly salary
  hourlyRate: number;    // agreed gross hourly rate
  personalAllowancePct?: number;        // IS: % of persónuafsláttur to apply (from the tax card; 0 = none)
  incomeTaxPct?: number;                // US/CA: employee's federal income-tax withholding % (from W-4 / TD1)
  secondaryTaxPct?: number;             // US: state income-tax % · CA: provincial income-tax %
  payFrequency?: 'monthly' | 'weekly';  // pay period — weekly prorates the allowance (default monthly)
  active: boolean;
  notes?: string;
}

export interface ExchangeRates {
  EUR: number;
  USD: number;
  GBP: number;
  DKK: number;
  NOK: number;
  SEK: number;
  AUD: number;
  CAD: number;
  NZD: number;
}

export interface CountryConfig {
  code: string;
  flag: string;
  nameEn: string;
  currency: Currency;
  vatTerm: string;
  vatRates: number[];
  standardRate: number;
  taxAuthority: string;
  companyIdLabel: string;
  vatNumberLabel: string;
  isUSA: boolean;
  taxWithholdingRate: number;
  employeePensionRate: number;
  employerPensionRate: number;
  socialInsuranceRate: number;
  personalDeductionMonthly: number;
}

export interface CompanyInfo {
  name: string;
  kennitala: string;
  address: string;
  postalCode: string;
  city: string;
  email: string;
  phone: string;
  bankAccount: string;
  vskNumber: string;
  auditor: string;
}

export interface AppSettings {
  language: Language;
  defaultCurrency: Currency;
  exchangeRates: ExchangeRates;
  fiscalYear: number;
  company: CompanyInfo;
  invoicePrefix: string;
  invoiceLastNumber: number;
  quoteLastNumber: number;
  taxWithholdingRate: number;
  employeePensionRate: number;
  employerPensionRate: number;
  socialInsuranceRate: number;
  personalDeductionMonthly: number;
  country: string;
  usState?: string;        // US state name (drives the base sales-tax rate)
  salesTaxRate: number;
  corporateTaxRate: number;
  vatRates: number[];
  aiMaxTransactions?: number; // how many recent transactions the in-app AI reads (default 12,000)
  invoiceEmailFrom?: string;  // verified sender for app-sent invoices, e.g. "Jobboks <accounts@jobboks.app>"
  standardRate: number;
  vatTerm: string;
  taxAuthority: string;
  companyIdLabel: string;
  vatNumberLabel: string;
  supabaseUrl: string;
  supabaseKey: string;
  supabaseUserKey: string;
  anthropicKey: string;
  plan: 'free' | 'pro' | 'business';
  paddleCustomerId?: string;
  paddleSubscriptionId?: string;
}

// ── Jobs / Work Accounting ───────────────────────────────────
// Site-visit-first pipeline. Offers/quotes live in Invoices, not here.
//   survey    → foreman visits the site, takes photos, gathers info
//   scheduled → customer said yes; plan when the work happens
//   active    → work being done (logs hours/materials/photos)
//   paused    → active job temporarily stopped
//   complete  → finished → becomes an invoice
//   cancelled → customer said no / job dropped (reachable from any stage)
export type JobStatus = 'survey' | 'scheduled' | 'active' | 'paused' | 'complete' | 'cancelled';

// Report approval workflow: a worker submits the job report (time + photos),
// a manager/owner approves it, and ONLY then can the job become an invoice.
export type JobReportStatus = 'draft' | 'submitted' | 'approved';

export interface Job {
  id: string;
  number: string;         // e.g. JOB-2026-001
  name: string;
  clientName: string;
  clientContact?: string;
  clientEmail?: string;
  clientPhone?: string;
  address?: string;
  status: JobStatus;
  startDate?: string;
  endDate?: string;
  quotedAmount?: number;  // agreed price
  currency: Currency;
  description?: string;
  notes?: string;
  // ── Report approval workflow ──
  reportStatus?: JobReportStatus;   // undefined = 'draft'
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  returnNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimeEntry {
  id: string;
  jobId: string;
  date: string;
  employeeName: string;
  hours: number;
  hourlyRate: number;     // cost to company
  description?: string;
  createdAt: string;
}

export interface JobMaterial {
  id: string;
  jobId: string;
  date: string;
  description: string;
  qty: number;
  unit: string;
  unitCost: number;
  stockItemId?: string;   // link to stock if applicable
  supplierName?: string;
  reference?: string;
  createdAt: string;
}

export interface JobPhoto {
  id: string;
  jobId: string;
  dataUrl: string;       // base64 image
  caption?: string;
  takenBy?: string;
  takenAt: string;       // ISO datetime
  createdAt: string;
}

// ── Stock / Inventory ────────────────────────────────────────
export interface StockItem {
  id: string;
  sku: string;            // supplier code or internal
  name: string;
  description?: string;
  category: string;
  unit: string;           // pcs, kg, m, m², box …
  qtyOnHand: number;
  qtyReserved: number;    // committed to jobs
  reorderPoint: number;   // alert threshold
  costPrice: number;      // per unit, excl. VAT
  sellPrice: number;      // per unit, excl. VAT
  currency: Currency;
  vatRate: VATRate;
  supplierName?: string;
  supplierCode?: string;  // their item code
  location?: string;      // shelf / bin
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  itemId: string;
  date: string;
  type: 'in' | 'out' | 'adjust' | 'return';
  qty: number;
  unitCost?: number;
  reference?: string;   // PO number, job number …
  note?: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  vatNumber?: string;
  currency: Currency;
  notes?: string;
  createdAt: string;
}

// A saved customer / tenant — reusable across invoices so details aren't retyped.
export interface Customer {
  id: string;
  name: string;
  kennitala?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  email?: string;
  phone?: string;
  notes?: string;
  createdAt: string;
}

export interface AppData {
  transactions: Transaction[];
  balanceSheetItems: BalanceSheetItem[];
  accounts: Account[];
  invoices: Invoice[];
  recurringTransactions: RecurringTransaction[];
  budgetLines: BudgetLine[];
  payrollEntries: PayrollEntry[];
  employees: Employee[];
  categoryRules: CategoryRule[];
  tasks: Task[];
  stockItems: StockItem[];
  stockMovements: StockMovement[];
  suppliers: Supplier[];
  customers: Customer[];
  jobs: Job[];
  timeEntries: TimeEntry[];
  jobMaterials: JobMaterial[];
  jobPhotos: JobPhoto[];
  appUsers: AppUser[];
  aiChat?: { role: 'user' | 'assistant'; content: string }[]; // persisted AI assistant conversation
  aiMemory?: string;                                           // facts the AI should always remember
  settings: AppSettings;
}

// ── Defaults ────────────────────────────────────────────────

export const INCOME_CATEGORIES = [
  'sala_vara', 'sala_thjonustu', 'fjarmagns_tekjur', 'adrar_tekjur',
] as const;

export const EXPENSE_CATEGORIES = [
  'laun', 'launatengd_gjold', 'husaleiga', 'rafmagn_hiti',
  'simagjold', 'skrifstofugjold', 'samgongur', 'markadsmal',
  'fagthjonusta', 'vorur', 'afskriftir', 'fjarmagnsgjold', 'adrir_rekstrargjold',
] as const;

// Categories for 'transfer' transactions — things that are NOT profit/loss.
// 'lan_afborgun' = loan / debt repayments (principal + interest paid out to a
// lender). Kept here, not under expenses, so paying down a loan never reduces
// profit. Finer sub-types (owner draw / asset) are a later stage.
export const TRANSFER_CATEGORIES = [
  'lan_afborgun',
  'ekki_rekstur',
] as const;

export type IncomeCategory = typeof INCOME_CATEGORIES[number];
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export const DEFAULT_EXCHANGE_RATES: ExchangeRates = {
  EUR: 148,
  USD: 137,
  GBP: 172,
  DKK: 20,
  NOK: 62,
  SEK: 81,
  AUD: 89,
  CAD: 100,
  NZD: 83,
};

export const DEFAULT_COMPANY: CompanyInfo = {
  name: '', kennitala: '', address: '', postalCode: '',
  city: 'Reykjavík', email: '', phone: '', bankAccount: '',
  vskNumber: '', auditor: '',
};

// Public Supabase connection, baked into the app so EVERY device and worker
// just logs in — no manual URL/key entry per device. The anon key is public by
// design (it ships in every client); Row-Level Security is what protects the data.
export const DEFAULT_SUPABASE_URL = 'https://gculnifrbgwdvnfzcrlz.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjdWxuaWZyYmd3ZHZuZnpjcmx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjg0OTgsImV4cCI6MjA5NDgwNDQ5OH0.m8iDYKIF3YDQ4cYtOFkbEz0zHXVkFgKb4oZER4JJE64';

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'is',
  defaultCurrency: 'ISK',
  exchangeRates: DEFAULT_EXCHANGE_RATES,
  fiscalYear: new Date().getFullYear(),
  company: DEFAULT_COMPANY,
  invoicePrefix: 'R',
  invoiceLastNumber: 0,
  quoteLastNumber: 0,
  taxWithholdingRate: 36.94,
  employeePensionRate: 4,
  employerPensionRate: 11.5,
  socialInsuranceRate: 6.35,
  personalDeductionMonthly: 62596,
  country: '',
  salesTaxRate: 8,
  corporateTaxRate: 20,
  vatRates: [24, 11, 0],
  standardRate: 24,
  vatTerm: 'VSK',
  taxAuthority: 'RSK',
  companyIdLabel: 'Kennitala',
  vatNumberLabel: 'VSK-númer',
  supabaseUrl: DEFAULT_SUPABASE_URL,
  supabaseKey: DEFAULT_SUPABASE_ANON_KEY,
  supabaseUserKey: '',
  anthropicKey: '',
  plan: 'free',
};

export const DEFAULT_ACCOUNTS: Account[] = [
  // Assets 1xxx
  { id: 'ac1200', number: '1200', name: 'Varanlegir rekstrarfjármunir', nameEn: 'Tangible fixed assets', type: 'asset', isSystem: true, isActive: true },
  { id: 'ac1400', number: '1400', name: 'Viðskiptakröfur', nameEn: 'Trade receivables', type: 'asset', isSystem: true, isActive: true },
  { id: 'ac1410', number: '1410', name: 'Aðrar kröfur', nameEn: 'Other receivables', type: 'asset', isSystem: true, isActive: true },
  { id: 'ac1420', number: '1420', name: 'Fyrirframgreiðslur', nameEn: 'Prepayments', type: 'asset', isSystem: false, isActive: true },
  { id: 'ac1500', number: '1500', name: 'Birgðir', nameEn: 'Inventories', type: 'asset', isSystem: false, isActive: true },
  { id: 'ac1600', number: '1600', name: 'Bankareikningur', nameEn: 'Bank account', type: 'asset', isSystem: true, isActive: true },
  { id: 'ac1610', number: '1610', name: 'Gjaldeyrisreikningur', nameEn: 'Foreign currency account', type: 'asset', isSystem: false, isActive: true },
  { id: 'ac1620', number: '1620', name: 'Handbært fé', nameEn: 'Petty cash', type: 'asset', isSystem: false, isActive: true },
  // Liability & Equity 2xxx
  { id: 'ac2000', number: '2000', name: 'Hlutafé', nameEn: 'Share capital', type: 'equity', isSystem: true, isActive: true },
  { id: 'ac2010', number: '2010', name: 'Stofnfé (einkahlutafélag)', nameEn: 'Founding capital (LLC)', type: 'equity', isSystem: false, isActive: true },
  { id: 'ac2100', number: '2100', name: 'Varasjóður', nameEn: 'Reserves', type: 'equity', isSystem: false, isActive: true },
  { id: 'ac2200', number: '2200', name: 'Óráðstafaður hagnaður', nameEn: 'Retained earnings', type: 'equity', isSystem: true, isActive: true },
  { id: 'ac2300', number: '2300', name: 'Langtímalán', nameEn: 'Long-term loans', type: 'liability', isSystem: false, isActive: true },
  { id: 'ac2400', number: '2400', name: 'Viðskiptaskuldir', nameEn: 'Trade payables', type: 'liability', isSystem: true, isActive: true },
  { id: 'ac2410', number: '2410', name: 'Aðrar skammtímaskuldir', nameEn: 'Other current liabilities', type: 'liability', isSystem: false, isActive: true },
  { id: 'ac2500', number: '2500', name: 'VSK til greiðslu', nameEn: 'VAT payable', type: 'liability', isSystem: true, isActive: true },
  { id: 'ac2510', number: '2510', name: 'Staðgreiðsla til greiðslu', nameEn: 'PAYE payable', type: 'liability', isSystem: false, isActive: true },
  { id: 'ac2520', number: '2520', name: 'Tryggingagjald til greiðslu', nameEn: 'Social insurance payable', type: 'liability', isSystem: false, isActive: true },
  { id: 'ac2530', number: '2530', name: 'Lífeyrissjóðsframlag til greiðslu', nameEn: 'Pension payable', type: 'liability', isSystem: false, isActive: true },
  // Revenue 3xxx
  { id: 'ac3000', number: '3000', name: 'Sala vara', nameEn: 'Sales of goods', type: 'revenue', isSystem: true, isActive: true },
  { id: 'ac3100', number: '3100', name: 'Sala þjónustu', nameEn: 'Sales of services', type: 'revenue', isSystem: true, isActive: true },
  { id: 'ac3200', number: '3200', name: 'Fjármagnstekjur', nameEn: 'Financial income', type: 'revenue', isSystem: false, isActive: true },
  { id: 'ac3900', number: '3900', name: 'Aðrar tekjur', nameEn: 'Other income', type: 'revenue', isSystem: false, isActive: true },
  // Cost of goods 4xxx
  { id: 'ac4000', number: '4000', name: 'Vara- og efniskaup', nameEn: 'Cost of goods', type: 'expense', isSystem: true, isActive: true },
  // Wages 5xxx
  { id: 'ac5000', number: '5000', name: 'Laun', nameEn: 'Wages & salaries', type: 'expense', isSystem: true, isActive: true },
  { id: 'ac5100', number: '5100', name: 'Tryggingagjald (6.35%)', nameEn: 'Social insurance (6.35%)', type: 'expense', isSystem: true, isActive: true },
  { id: 'ac5200', number: '5200', name: 'Lífeyrisframlag atvinnurekanda (11.5%)', nameEn: 'Employer pension (11.5%)', type: 'expense', isSystem: true, isActive: true },
  { id: 'ac5300', number: '5300', name: 'Aðrir launatengdir kostnaðir', nameEn: 'Other payroll costs', type: 'expense', isSystem: false, isActive: true },
  // Operating 6xxx
  { id: 'ac6000', number: '6000', name: 'Húsaleiga', nameEn: 'Rent', type: 'expense', isSystem: false, isActive: true },
  { id: 'ac6100', number: '6100', name: 'Raforka og hiti', nameEn: 'Electricity and heating', type: 'expense', isSystem: false, isActive: true },
  { id: 'ac6200', number: '6200', name: 'Símar og samskipti', nameEn: 'Phone and communications', type: 'expense', isSystem: false, isActive: true },
  { id: 'ac6300', number: '6300', name: 'Skrifstofugjöld', nameEn: 'Office expenses', type: 'expense', isSystem: false, isActive: true },
  { id: 'ac6400', number: '6400', name: 'Samgöngu- og ferðakostnaðir', nameEn: 'Travel and transport', type: 'expense', isSystem: false, isActive: true },
  { id: 'ac6500', number: '6500', name: 'Markaðsmál og auglýsingar', nameEn: 'Marketing and advertising', type: 'expense', isSystem: false, isActive: true },
  { id: 'ac6600', number: '6600', name: 'Fagþjónusta', nameEn: 'Professional services', type: 'expense', isSystem: false, isActive: true },
  { id: 'ac6700', number: '6700', name: 'Tryggingargjöld', nameEn: 'Insurance', type: 'expense', isSystem: false, isActive: true },
  { id: 'ac6800', number: '6800', name: 'Leiga á tækjum', nameEn: 'Equipment rental', type: 'expense', isSystem: false, isActive: true },
  { id: 'ac6900', number: '6900', name: 'Aðrir rekstrargjöld', nameEn: 'Other operating expenses', type: 'expense', isSystem: false, isActive: true },
  // Depreciation 7xxx
  { id: 'ac7000', number: '7000', name: 'Afskriftir rekstrarfjármuna', nameEn: 'Depreciation', type: 'expense', isSystem: false, isActive: true },
  // Financial 8xxx
  { id: 'ac8000', number: '8000', name: 'Vextir og verðbætur á skuldum', nameEn: 'Interest and indexation', type: 'expense', isSystem: false, isActive: true },
  { id: 'ac8100', number: '8100', name: 'Gengistap', nameEn: 'Exchange rate loss', type: 'expense', isSystem: false, isActive: true },
  // Tax 9xxx
  { id: 'ac9000', number: '9000', name: 'Tekjuskattur', nameEn: 'Income tax', type: 'expense', isSystem: false, isActive: true },
];
