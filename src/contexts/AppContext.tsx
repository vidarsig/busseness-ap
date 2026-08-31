import React, { createContext, useContext, useReducer, useEffect, useCallback, useState, useRef } from 'react';
import { pushData, pullData, remoteUpdatedAt, syncDirection, resolveCompanyKey } from '../utils/supabase';
import { idbGet, idbSet } from '../utils/idb';
import {
  AppData, Transaction, BalanceSheetItem, AppSettings,
  Account, Invoice, RecurringTransaction, BudgetLine, PayrollEntry, CategoryRule, Task,
  StockItem, StockMovement, Supplier, Customer, Job, TimeEntry, JobMaterial, JobPhoto, AppUser, Employee,
  DEFAULT_SETTINGS, DEFAULT_ACCOUNTS, DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY, Language, CountryConfig,
  canonicalCategory,
} from '../types';
import { translations, TranslationKey } from '../i18n/translations';
import { COUNTRY_CONFIGS } from '../data/countries';
import { formatCurrency, formatISK , setUiLanguage } from '../utils/formatters';
import { generateDemoData } from '../utils/demoData';

const STORAGE_KEY = 'bokhalds_app_v2';

// ── One-time owner data seeds ───────────────────────────────────────────────
// The owner (Efra skrið ehf) bought three properties on real deeds. They belong
// on the balance sheet as fixed assets at BOOK VALUE (building depreciates 2%/yr,
// land never — see BalanceSheetItem). This seed UPSERTS them by stable id once,
// then records a marker in `seededMigrations` so it runs exactly once (later manual
// edits/deletes by the owner are preserved). It is gated to the owner's company
// only, so future users (e.g. the US launch) never receive these rows. Land = 15%
// of cost — the owner's established basis (matches his prior book values: fixed-
// asset totals 47,297,000 in 2025 and 46,447,000 in 2026); adjustable in the app.
// Values from the afsöl/kaupsamningar on file. v2 corrects a v1 seeding that used
// a 20% land split.
const EFRA_SEED_ID = 'efra-skrid-properties-v2';
const OWNER_KT = '6901201780'; // Efra skrið ehf
const EFRA_PROPERTIES: BalanceSheetItem[] = [
  {
    id: 'bs-efra-deildartun4-0301',
    name: 'Deildartún 4, efsta hæð (íbúð 01-0301), Akranesi',
    nameEn: 'Deildartún 4, top-floor flat (01-0301), Akranes',
    section: 'fixed_assets', amount: 9000000,
    cost: 9000000, acquiredYear: 2021, landValue: 1350000, depreciationRate: 2,
  },
  {
    id: 'bs-efra-deildartun4-0101',
    name: 'Deildartún 4, íbúð 01-0101, Akranesi',
    nameEn: 'Deildartún 4, flat 01-0101, Akranes',
    section: 'fixed_assets', amount: 30000000,
    cost: 30000000, acquiredYear: 2022, landValue: 4500000, depreciationRate: 2,
  },
  {
    id: 'bs-efra-akurgerdi13',
    name: 'Akurgerði 13 (01-0101), Akranesi',
    nameEn: 'Akurgerði 13 (01-0101), Akranes',
    section: 'fixed_assets', amount: 11000000,
    cost: 11000000, acquiredYear: 2022, landValue: 1650000, depreciationRate: 2,
  },
];

// The owner's REAL company cash = the Arion account 0370-26-690127 year-end balances
// (his Landsbankinn account is PRIVATE, used only for framlag). The app's calculated
// cash is polluted by mixed personal/framlag entries ("the mess", not cleaned yet), so
// the balance-sheet cash line uses these actual reconciled figures instead. 2026 is the
// current partial-year balance (all loans settled 2026 → big outflows); owner updates at
// year-end. Computed by cumsum of the full Arion export.
const EFRA_CASH_SEED_ID = 'efra-cash-arion-v1';
const ARION_CASH_BY_YEAR: Record<string, number> = {
  '2020': 15112, '2021': 2827298, '2022': 600, '2023': 3542,
  '2024': 505063, '2025': 206489, '2026': -5528872,
};
const isCashLineItem = (b: BalanceSheetItem) =>
  b.computed === 'cash' || b.id === 'bs1' || (b.section === 'current_assets' && /handbært/i.test(b.name));

// The loan keys that are MORTGAGES financing the 3 properties (Arion ×3 + the two
// bonds still owed — A00750 Akurgerði, A00346 Deildartún). Only these net against
// property book value. The paid-up bonds (M2595, A01536), the family loans (Heiða,
// Jane) and the owner account are NOT property mortgages.
const EFRA_MORTGAGE_SEED_ID = 'efra-mortgages-v1';
const EFRA_MORTGAGE_NUMBERS = new Set(['20301', '20302', '20303', '20304', '20305']);

// Owner's amounts are GROSS (VAT inside). Contracting/work income is 24% VSK; RENT is
// exempt (0%); insurance payouts (adrar_tekjur) + loans/framlag are outside VAT.
const EFRA_WORK_VAT_SEED_ID = 'efra-work-vat-v1';
const efraFold = (s: string) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/æ/g, 'ae').replace(/ø/g, 'o');
const EFRA_RENT_RE = /victor|janeks|olajumoke|oleksandr|johann|leiga|husaleig/;
const EFRA_NONWORK_RE = /vordur|trygg|framlag|vidar sig|heida|jane/;
const isEfraWorkIncome = (t: Transaction) =>
  t.type === 'income' && t.category !== 'adrar_tekjur' && t.category !== 'framlag' && t.category !== 'lan_mottekid'
  && !EFRA_RENT_RE.test(efraFold(t.description)) && !EFRA_NONWORK_RE.test(efraFold(t.description));

// Input VAT (innskattur): the owner's real innskattur is NOT booked yet (serious work
// for later), so E must be 0 — no fake reclaim. This REVERTS the earlier 24% seeding on
// reclaimable purchases back to 0%. (isEfraReclaimable identifies the rows that were set.)
const EFRA_INPUT_VAT_REVERT_ID = 'efra-input-vat-revert-v1';
const EFRA_ACC_1210 = 'ac_1784964615252_1s9q';
const EFRA_NO_INNSKATTUR = /\bn1\b|olis|orkan|atlantsol|skeljung|costco|eldsneyt|\bob |vordur|trygg|sysluma|rikissj|innheimt|tollur|skatt|inkasso|gjaldheimt|motus|intrum|worldremit|western|wise|hradbanki|\batm\b|vidar sig|heida|jane|deildartun|husfelag|akraneskaup/;
const NON_VAT_EXP_CATS = new Set(['laun', 'launatengd_gjold', 'afskriftir', 'fjarmagnsgjold']);
const isEfraReclaimable = (t: Transaction) =>
  t.type === 'expense' && t.accountId !== EFRA_ACC_1210
  && !NON_VAT_EXP_CATS.has(t.category) && !EFRA_NO_INNSKATTUR.test(efraFold(t.description));

// Bank INTEREST (positive) and tiny date-serial IMPORT JUNK (a number as the whole
// description, e.g. "46204", tiny amount) were swept into taxable sales — they aren't
// turnover. Move both to financial income (fjármagnstekjur), which is outside VSK.
const EFRA_INTEREST_SEED_ID = 'efra-interest-clean-v1';
const isEfraBankInterest = (t: Transaction) => {
  if (t.type !== 'income') return false;
  const d = String(t.description ?? '').trim();
  if (/vext|innvext/.test(efraFold(d))) return true;       // real bank interest (Innvextir)
  return /^\d+$/.test(d) && t.amount < 5000;               // date-serial junk imported as tiny income
};

function applyOwnerSeeds(d: AppData): AppData {
  const kt = (d.settings.company?.kennitala ?? '').replace(/\D/g, '');
  const name = (d.settings.company?.name ?? '').toLowerCase();
  const isOwner = kt === OWNER_KT || name.includes('efra skrið') || name.includes('efra skrid');
  if (!isOwner) return d;
  const done = [...(d.seededMigrations ?? [])];
  let items = d.balanceSheetItems;
  let accounts = d.accounts;
  let transactions = d.transactions;
  let settings = d.settings;
  let changed = false;
  // Seed 1: the 3 properties as fixed assets (upsert by stable id).
  if (!done.includes(EFRA_SEED_ID)) {
    const seededIds = new Set(EFRA_PROPERTIES.map(p => p.id));
    items = [...items.filter(b => !seededIds.has(b.id)), ...EFRA_PROPERTIES];
    done.push(EFRA_SEED_ID); changed = true;
  }
  // Seed 2: the real Arion per-year cash on the cash line (overrides the polluted calc).
  if (!done.includes(EFRA_CASH_SEED_ID)) {
    items = items.map(b => isCashLineItem(b) ? { ...b, cashByYear: { ...(b.cashByYear ?? {}), ...ARION_CASH_BY_YEAR } } : b);
    done.push(EFRA_CASH_SEED_ID); changed = true;
  }
  // Seed 3: flag the 5 property-mortgage loan keys so they net against property book
  // value (the rest of the debt stays a normal liability). Idempotent by account number.
  if (!done.includes(EFRA_MORTGAGE_SEED_ID)) {
    accounts = accounts.map(a => EFRA_MORTGAGE_NUMBERS.has(a.number) ? { ...a, isPropertyMortgage: true } : a);
    done.push(EFRA_MORTGAGE_SEED_ID); changed = true;
  }
  // Seed 4: work income → 24% VSK (amounts are gross, so turn on pricesIncludeVAT to
  // EXTRACT the VAT), rent stays 0% (exempt). So the VSK return shows work under A
  // (skattskyld velta 24%) with útskattur, rent under C (undanþegin). Idempotent.
  if (!done.includes(EFRA_WORK_VAT_SEED_ID)) {
    transactions = transactions.map(t => isEfraWorkIncome(t) && t.vatRate !== 24 ? { ...t, vatRate: 24 as typeof t.vatRate } : t);
    settings = { ...settings, pricesIncludeVAT: true };
    done.push(EFRA_WORK_VAT_SEED_ID); changed = true;
  }
  // Seed 5 (revert): real innskattur isn't booked yet, so E must be 0 — set the earlier-
  // seeded 24% reclaimable purchases back to 0%. Real input VAT is later, serious work.
  if (!done.includes(EFRA_INPUT_VAT_REVERT_ID)) {
    transactions = transactions.map(t => isEfraReclaimable(t) && t.vatRate === 24 ? { ...t, vatRate: 0 as typeof t.vatRate } : t);
    done.push(EFRA_INPUT_VAT_REVERT_ID); changed = true;
  }
  // Seed 6: bank interest + tiny date-serial junk → financial income (out of taxable velta).
  if (!done.includes(EFRA_INTEREST_SEED_ID)) {
    transactions = transactions.map(t => isEfraBankInterest(t) && (t.category !== 'fjarmagns_tekjur' || t.vatRate !== 0)
      ? { ...t, category: 'fjarmagns_tekjur', vatRate: 0 as typeof t.vatRate } : t);
    done.push(EFRA_INTEREST_SEED_ID); changed = true;
  }
  return changed ? { ...d, balanceSheetItems: items, accounts, transactions, settings, seededMigrations: done } : d;
}

const defaultData: AppData = {
  transactions: [],
  categoryRules: [],
  balanceSheetItems: [
    { id: 'bs1', name: 'Handbært fé og bankainnstæður', nameEn: 'Cash and bank balances', section: 'current_assets', amount: 0, computed: 'cash' },
    { id: 'bs2', name: 'Viðskiptakröfur', nameEn: 'Trade receivables', section: 'current_assets', amount: 0 },
    { id: 'bs3', name: 'Aðrar skammtímaeignir', nameEn: 'Other current assets', section: 'current_assets', amount: 0 },
    { id: 'bs4', name: 'Varanlegir rekstrarfjármunir', nameEn: 'Tangible fixed assets', section: 'fixed_assets', amount: 0 },
    { id: 'bs5', name: 'Hlutafé', nameEn: 'Share capital', section: 'equity', amount: 500000 },
    { id: 'bs6', name: 'Viðskiptaskuldir', nameEn: 'Trade payables', section: 'current_liabilities', amount: 0 },
    { id: 'bs7', name: 'Aðrar skammtímaskuldir', nameEn: 'Other current liabilities', section: 'current_liabilities', amount: 0 },
    { id: 'bs8', name: 'Langtímalán', nameEn: 'Long-term loans', section: 'long_term_liabilities', amount: 0 },
  ],
  accounts: DEFAULT_ACCOUNTS,
  invoices: [],
  recurringTransactions: [],
  budgetLines: [],
  payrollEntries: [],
  employees: [],
  tasks: [],
  stockItems: [],
  stockMovements: [],
  suppliers: [],
  customers: [],
  jobs: [],
  timeEntries: [],
  jobMaterials: [],
  jobPhotos: [],
  appUsers: [],
  settings: DEFAULT_SETTINGS,
};

type Action =
  | { type: 'ADD_TRANSACTION'; payload: Transaction }
  | { type: 'ADD_TRANSACTIONS'; payload: Transaction[] }
  | { type: 'UPDATE_TRANSACTION'; payload: Transaction }
  | { type: 'DELETE_TRANSACTION'; payload: string }
  | { type: 'DELETE_TRANSACTIONS'; payload: string[] }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<AppSettings> }
  | { type: 'SET_AI_CHAT'; payload: { role: 'user' | 'assistant'; content: string }[] }
  | { type: 'SET_AI_MEMORY'; payload: string }
  | { type: 'ADD_BS_ITEM'; payload: BalanceSheetItem }
  | { type: 'UPDATE_BS_ITEM'; payload: BalanceSheetItem }
  | { type: 'DELETE_BS_ITEM'; payload: string }
  | { type: 'ADD_ACCOUNT'; payload: Account }
  | { type: 'UPDATE_ACCOUNT'; payload: Account }
  | { type: 'DELETE_ACCOUNT'; payload: string }
  | { type: 'ADD_INVOICE'; payload: Invoice }
  | { type: 'UPDATE_INVOICE'; payload: Invoice }
  | { type: 'DELETE_INVOICE'; payload: string }
  | { type: 'ADD_RECURRING'; payload: RecurringTransaction }
  | { type: 'UPDATE_RECURRING'; payload: RecurringTransaction }
  | { type: 'DELETE_RECURRING'; payload: string }
  | { type: 'UPSERT_BUDGET_LINE'; payload: BudgetLine }
  | { type: 'DELETE_BUDGET_LINE'; payload: string }
  | { type: 'ADD_PAYROLL'; payload: PayrollEntry }
  | { type: 'UPDATE_PAYROLL'; payload: PayrollEntry }
  | { type: 'DELETE_PAYROLL'; payload: string }
  | { type: 'ADD_EMPLOYEE'; payload: Employee }
  | { type: 'UPDATE_EMPLOYEE'; payload: Employee }
  | { type: 'DELETE_EMPLOYEE'; payload: string }
  | { type: 'ADD_RULE'; payload: CategoryRule }
  | { type: 'UPDATE_RULE'; payload: CategoryRule }
  | { type: 'DELETE_RULE'; payload: string }
  | { type: 'ADD_TASK'; payload: Task }
  | { type: 'UPDATE_TASK'; payload: Task }
  | { type: 'DELETE_TASK'; payload: string }
  | { type: 'ADD_STOCK_ITEM'; payload: StockItem }
  | { type: 'ADD_STOCK_ITEMS'; payload: StockItem[] }
  | { type: 'UPDATE_STOCK_ITEM'; payload: StockItem }
  | { type: 'DELETE_STOCK_ITEM'; payload: string }
  | { type: 'ADD_STOCK_MOVEMENT'; payload: StockMovement }
  | { type: 'ADD_SUPPLIER'; payload: Supplier }
  | { type: 'ADD_SUPPLIERS'; payload: Supplier[] }
  | { type: 'UPDATE_SUPPLIER'; payload: Supplier }
  | { type: 'DELETE_SUPPLIER'; payload: string }
  | { type: 'ADD_CUSTOMER'; payload: Customer }
  | { type: 'ADD_CUSTOMERS'; payload: Customer[] }
  | { type: 'UPDATE_CUSTOMER'; payload: Customer }
  | { type: 'DELETE_CUSTOMER'; payload: string }
  | { type: 'ADD_JOB'; payload: Job }
  | { type: 'UPDATE_JOB'; payload: Job }
  | { type: 'DELETE_JOB'; payload: string }
  | { type: 'ADD_TIME_ENTRY'; payload: TimeEntry }
  | { type: 'UPDATE_TIME_ENTRY'; payload: TimeEntry }
  | { type: 'DELETE_TIME_ENTRY'; payload: string }
  | { type: 'ADD_JOB_MATERIAL'; payload: JobMaterial }
  | { type: 'UPDATE_JOB_MATERIAL'; payload: JobMaterial }
  | { type: 'DELETE_JOB_MATERIAL'; payload: string }
  | { type: 'ADD_APP_USER'; payload: AppUser }
  | { type: 'UPDATE_APP_USER'; payload: AppUser }
  | { type: 'DELETE_APP_USER'; payload: string }
  | { type: 'ADD_JOB_PHOTO'; payload: JobPhoto }
  | { type: 'UPDATE_JOB_PHOTO'; payload: JobPhoto }
  | { type: 'DELETE_JOB_PHOTO'; payload: string }
  | { type: 'SET_LANGUAGE'; payload: Language }
  | { type: 'LOAD'; payload: AppData };

function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'LOAD': return action.payload;
    case 'ADD_TRANSACTION': return { ...state, transactions: [...state.transactions, action.payload] };
    case 'ADD_TRANSACTIONS': return { ...state, transactions: [...state.transactions, ...action.payload] };
    case 'UPDATE_TRANSACTION': return { ...state, transactions: state.transactions.map(t => t.id === action.payload.id ? action.payload : t) };
    case 'DELETE_TRANSACTION': return { ...state, transactions: state.transactions.filter(t => t.id !== action.payload) };
    case 'DELETE_TRANSACTIONS': { const ids = new Set(action.payload); return { ...state, transactions: state.transactions.filter(t => !ids.has(t.id)) }; }
    case 'UPDATE_SETTINGS': return { ...state, settings: { ...state.settings, ...action.payload } };
    case 'SET_AI_CHAT': return { ...state, aiChat: action.payload };
    case 'SET_AI_MEMORY': return { ...state, aiMemory: action.payload };
    case 'ADD_BS_ITEM': return { ...state, balanceSheetItems: [...state.balanceSheetItems, action.payload] };
    case 'UPDATE_BS_ITEM': return { ...state, balanceSheetItems: state.balanceSheetItems.map(b => b.id === action.payload.id ? action.payload : b) };
    case 'DELETE_BS_ITEM': return { ...state, balanceSheetItems: state.balanceSheetItems.filter(b => b.id !== action.payload) };
    case 'ADD_ACCOUNT': return { ...state, accounts: [...state.accounts, action.payload] };
    case 'UPDATE_ACCOUNT': return { ...state, accounts: state.accounts.map(a => a.id === action.payload.id ? action.payload : a) };
    case 'DELETE_ACCOUNT': return { ...state, accounts: state.accounts.filter(a => a.id !== action.payload) };
    case 'ADD_INVOICE': return { ...state, invoices: [...state.invoices, action.payload] };
    case 'UPDATE_INVOICE': return { ...state, invoices: state.invoices.map(i => i.id === action.payload.id ? action.payload : i) };
    case 'DELETE_INVOICE': return { ...state, invoices: state.invoices.filter(i => i.id !== action.payload) };
    case 'ADD_RECURRING': return { ...state, recurringTransactions: [...state.recurringTransactions, action.payload] };
    case 'UPDATE_RECURRING': return { ...state, recurringTransactions: state.recurringTransactions.map(r => r.id === action.payload.id ? action.payload : r) };
    case 'DELETE_RECURRING': return { ...state, recurringTransactions: state.recurringTransactions.filter(r => r.id !== action.payload) };
    case 'UPSERT_BUDGET_LINE': {
      const exists = state.budgetLines.find(b => b.id === action.payload.id);
      return { ...state, budgetLines: exists ? state.budgetLines.map(b => b.id === action.payload.id ? action.payload : b) : [...state.budgetLines, action.payload] };
    }
    case 'DELETE_BUDGET_LINE': return { ...state, budgetLines: state.budgetLines.filter(b => b.id !== action.payload) };
    case 'ADD_PAYROLL': return { ...state, payrollEntries: [...state.payrollEntries, action.payload] };
    case 'UPDATE_PAYROLL': return { ...state, payrollEntries: state.payrollEntries.map(p => p.id === action.payload.id ? action.payload : p) };
    case 'DELETE_PAYROLL': return { ...state, payrollEntries: state.payrollEntries.filter(p => p.id !== action.payload) };
    case 'ADD_EMPLOYEE': return { ...state, employees: [...state.employees, action.payload] };
    case 'UPDATE_EMPLOYEE': return { ...state, employees: state.employees.map(e => e.id === action.payload.id ? action.payload : e) };
    case 'DELETE_EMPLOYEE': return { ...state, employees: state.employees.filter(e => e.id !== action.payload) };
    case 'ADD_RULE': return { ...state, categoryRules: [...state.categoryRules, action.payload] };
    case 'UPDATE_RULE': return { ...state, categoryRules: state.categoryRules.map(r => r.id === action.payload.id ? action.payload : r) };
    case 'DELETE_RULE': return { ...state, categoryRules: state.categoryRules.filter(r => r.id !== action.payload) };
    case 'ADD_TASK': return { ...state, tasks: [...state.tasks, action.payload] };
    case 'UPDATE_TASK': return { ...state, tasks: state.tasks.map(t => t.id === action.payload.id ? action.payload : t) };
    case 'DELETE_TASK': return { ...state, tasks: state.tasks.filter(t => t.id !== action.payload) };
    case 'ADD_STOCK_ITEM': return { ...state, stockItems: [...(state.stockItems ?? []), action.payload] };
    case 'ADD_STOCK_ITEMS': return { ...state, stockItems: [...(state.stockItems ?? []), ...action.payload] };
    case 'UPDATE_STOCK_ITEM': return { ...state, stockItems: (state.stockItems ?? []).map(s => s.id === action.payload.id ? action.payload : s) };
    case 'DELETE_STOCK_ITEM': return { ...state, stockItems: (state.stockItems ?? []).filter(s => s.id !== action.payload), stockMovements: (state.stockMovements ?? []).filter(m => m.itemId !== action.payload) };
    case 'ADD_STOCK_MOVEMENT': {
      // Update qtyOnHand on the item
      const mv = action.payload;
      // 'adjust' (Leiðrétting) SETS the on-hand count to the entered value — a real
      // correction that can move stock down as well as up. in/return add, out subtracts.
      const delta = mv.type === 'in' || mv.type === 'return' ? mv.qty : -mv.qty;
      return {
        ...state,
        stockMovements: [...(state.stockMovements ?? []), mv],
        stockItems: (state.stockItems ?? []).map(s => s.id === mv.itemId
          ? { ...s, qtyOnHand: Math.max(0, mv.type === 'adjust' ? mv.qty : s.qtyOnHand + delta), updatedAt: mv.createdAt }
          : s),
      };
    }
    case 'ADD_SUPPLIER': return { ...state, suppliers: [...(state.suppliers ?? []), action.payload] };
    case 'ADD_SUPPLIERS': return { ...state, suppliers: [...(state.suppliers ?? []), ...action.payload] };
    case 'UPDATE_SUPPLIER': return { ...state, suppliers: (state.suppliers ?? []).map(s => s.id === action.payload.id ? action.payload : s) };
    case 'DELETE_SUPPLIER': return { ...state, suppliers: (state.suppliers ?? []).filter(s => s.id !== action.payload) };
    case 'ADD_CUSTOMER': return { ...state, customers: [...(state.customers ?? []), action.payload] };
    case 'ADD_CUSTOMERS': return { ...state, customers: [...(state.customers ?? []), ...action.payload] };
    case 'UPDATE_CUSTOMER': return { ...state, customers: (state.customers ?? []).map(c => c.id === action.payload.id ? action.payload : c) };
    case 'DELETE_CUSTOMER': return { ...state, customers: (state.customers ?? []).filter(c => c.id !== action.payload) };
    case 'ADD_JOB': return { ...state, jobs: [...(state.jobs ?? []), action.payload] };
    case 'UPDATE_JOB': return { ...state, jobs: (state.jobs ?? []).map(j => j.id === action.payload.id ? action.payload : j) };
    case 'DELETE_JOB': return { ...state, jobs: (state.jobs ?? []).filter(j => j.id !== action.payload), timeEntries: (state.timeEntries ?? []).filter(t => t.jobId !== action.payload), jobMaterials: (state.jobMaterials ?? []).filter(m => m.jobId !== action.payload), jobPhotos: (state.jobPhotos ?? []).filter(p => p.jobId !== action.payload) };
    case 'ADD_TIME_ENTRY': return { ...state, timeEntries: [...(state.timeEntries ?? []), action.payload] };
    case 'UPDATE_TIME_ENTRY': return { ...state, timeEntries: (state.timeEntries ?? []).map(t => t.id === action.payload.id ? action.payload : t) };
    case 'DELETE_TIME_ENTRY': return { ...state, timeEntries: (state.timeEntries ?? []).filter(t => t.id !== action.payload) };
    case 'ADD_JOB_MATERIAL': return { ...state, jobMaterials: [...(state.jobMaterials ?? []), action.payload] };
    case 'UPDATE_JOB_MATERIAL': return { ...state, jobMaterials: (state.jobMaterials ?? []).map(m => m.id === action.payload.id ? action.payload : m) };
    case 'DELETE_JOB_MATERIAL': return { ...state, jobMaterials: (state.jobMaterials ?? []).filter(m => m.id !== action.payload) };
    case 'ADD_APP_USER': return { ...state, appUsers: [...(state.appUsers ?? []), action.payload] };
    case 'UPDATE_APP_USER': return { ...state, appUsers: (state.appUsers ?? []).map(u => u.id === action.payload.id ? action.payload : u) };
    case 'DELETE_APP_USER': return { ...state, appUsers: (state.appUsers ?? []).filter(u => u.id !== action.payload) };
    case 'ADD_JOB_PHOTO': return { ...state, jobPhotos: [...(state.jobPhotos ?? []), action.payload] };
    case 'UPDATE_JOB_PHOTO': return { ...state, jobPhotos: (state.jobPhotos ?? []).map(p => p.id === action.payload.id ? action.payload : p) };
    case 'DELETE_JOB_PHOTO': return { ...state, jobPhotos: (state.jobPhotos ?? []).filter(p => p.id !== action.payload) };
    case 'SET_LANGUAGE': return { ...state, settings: { ...state.settings, language: action.payload } };
    default: return state;
  }
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface AppContextValue {
  data: AppData;
  dispatch: React.Dispatch<Action>;
  t: (key: TranslationKey) => string;
  lang: Language;
  setLang: (l: Language) => void;
  cc: CountryConfig;
  fmt: (amount: number) => string;
  /** Format an ISK-base amount (output of getTransactionISK) in the app's display currency */
  fmtISK: (iskAmount: number) => string;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  syncNow: () => Promise<void>;
  /** Restore a backup so it STICKS: migrate + persist to IndexedDB immediately, bump the
   *  sync timestamp so the mount-time cloud pull can't overwrite it, and push to the cloud. */
  restoreData: (payload: AppData) => Promise<void>;
  /** Test mode: play with data (imports etc.) without saving locally or to the cloud. */
  testMode: boolean;
  enterTestMode: () => void;
  exitTestMode: () => void;
  /** Add realistic sample data (customers/invoices/jobs), tagged _demo_, WITHOUT
   *  touching real settings/company. Used by Settings and Review Intelligence. */
  loadSampleData: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const SYNC_TS_KEY = 'bokhalds_sync_ts';

// A category written as its LABEL instead of its key ("fæði" for 'faedi') is a row
// no total names, so it disappears from the accounts without appearing anywhere as
// an error. Heal it on the way in — on first load and on every restore — so the row
// shows on its own line in the lists too, not merely in the totals.
function healCategories(list: Transaction[]): Transaction[] {
  let changed = false;
  const healed = list.map(t => {
    const c = canonicalCategory(t.category);
    if (c === t.category) return t;
    changed = true;
    return { ...t, category: c as Transaction['category'] };
  });
  return changed ? healed : list;
}

function migrateData(parsed: Partial<AppData>): AppData {
  return applyOwnerSeeds({
    ...defaultData,
    ...parsed,
    transactions: healCategories(parsed.transactions ?? []),
    seededMigrations: parsed.seededMigrations ?? [],
    accounts: parsed.accounts?.length ? parsed.accounts : DEFAULT_ACCOUNTS,
    invoices: (parsed.invoices ?? []).map((inv: Invoice) => ({ ...inv, type: inv.type ?? 'invoice' as const })),
    recurringTransactions: parsed.recurringTransactions ?? [],
    budgetLines: parsed.budgetLines ?? [],
    payrollEntries: parsed.payrollEntries ?? [],
    employees: parsed.employees ?? [],
    categoryRules: parsed.categoryRules ?? [],
    tasks: parsed.tasks ?? [],
    stockItems: parsed.stockItems ?? [],
    stockMovements: parsed.stockMovements ?? [],
    suppliers: parsed.suppliers ?? [],
    customers: parsed.customers ?? [],
    jobs: parsed.jobs ?? [],
    timeEntries: parsed.timeEntries ?? [],
    jobMaterials: parsed.jobMaterials ?? [],
    jobPhotos: parsed.jobPhotos ?? [],
    appUsers: parsed.appUsers ?? [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...parsed.settings,
      exchangeRates: { ...DEFAULT_SETTINGS.exchangeRates, ...parsed.settings?.exchangeRates },
      company: { ...DEFAULT_SETTINGS.company, ...parsed.settings?.company },
      country: parsed.settings?.country ?? '',
      salesTaxRate: parsed.settings?.salesTaxRate ?? 8,
      corporateTaxRate: parsed.settings?.corporateTaxRate ?? 20,
      quoteLastNumber: parsed.settings?.quoteLastNumber ?? 0,
      supabaseUrl: parsed.settings?.supabaseUrl || DEFAULT_SUPABASE_URL,
      supabaseKey: parsed.settings?.supabaseKey || DEFAULT_SUPABASE_ANON_KEY,
      supabaseUserKey: parsed.settings?.supabaseUserKey ?? '',
      anthropicKey: parsed.settings?.anthropicKey ?? '',
      vatRates: parsed.settings?.vatRates ?? [],
      standardRate: parsed.settings?.standardRate ?? 0,
      vatTerm: parsed.settings?.vatTerm ?? '',
      taxAuthority: parsed.settings?.taxAuthority ?? '',
      companyIdLabel: parsed.settings?.companyIdLabel ?? '',
      vatNumberLabel: parsed.settings?.vatNumberLabel ?? '',
    },
  });
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, dispatch] = useReducer(reducer, defaultData, () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return migrateData(JSON.parse(stored) as Partial<AppData>);
    } catch { /* ignore */ }
    return defaultData;
  });

  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => localStorage.getItem(SYNC_TS_KEY));
  const skipNextPush = useRef(false);
  const idbReady = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout>>();
  // The resolved data-partition key: the logged-in user's company key when
  // authenticated, else the legacy manual key. Set during the mount sync.
  const syncKeyRef = useRef<string>('');
  const persistTimer = useRef<ReturnType<typeof setTimeout>>();

  // ── Test mode ──────────────────────────────────────────────────────────
  // While on, the app runs on an in-memory copy of the real data: nothing is
  // persisted to IndexedDB/localStorage and nothing is pushed to Supabase, so
  // imports/experiments can't touch the real books. Exiting restores the real
  // data (which was never overwritten). A page reload also drops straight back
  // to the real data, since test changes are only ever in memory.
  const [testMode, setTestMode] = useState(false);
  const testModeRef = useRef(false);           // synchronous gate for the effects
  const realDataBackup = useRef<AppData | null>(null);

  // DEV-ONLY sample-data loader for testing. import.meta.env.DEV is statically false
  // in the production build, so Vite drops this whole effect and never bundles the
  // demo generator (dynamic import). Call window.__loadDemo() in the dev console to
  // fill the app with realistic data in the current jurisdiction/locale.
  const dataRef = useRef(data);
  dataRef.current = data;
  // Fill the app with realistic sample data (customers/invoices/jobs) — but DROP the
  // generator's settings block so a real company's name/currency/tax is never
  // overwritten. Shared by Settings and Review Intelligence's "Reproduce" action.
  const loadSampleData = useCallback(() => {
    const cur = dataRef.current;
    const { settings: _s, ...entities } = generateDemoData(cur);
    dispatch({ type: 'LOAD', payload: { ...cur, ...entities } });
  }, []);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __loadDemo?: () => void }).__loadDemo = () => loadSampleData();
  }, [loadSampleData]);

  const enterTestMode = useCallback(() => {
    realDataBackup.current = data;             // immutable snapshot of the real data
    testModeRef.current = true;
    setTestMode(true);
  }, [data]);

  const exitTestMode = useCallback(() => {
    const real = realDataBackup.current;
    realDataBackup.current = null;
    testModeRef.current = false;
    setTestMode(false);
    if (real) { skipNextPush.current = true; dispatch({ type: 'LOAD', payload: real }); }
  }, []);

  // Persist locally to IndexedDB (big storage, ~GBs). Debounced so a burst of
  // changes (e.g. importing thousands of bank rows, or attaching many receipts)
  // serializes once things settle instead of re-writing the whole blob on every
  // single change — that repeated serialization is what froze the screen.
  // We don't write until the initial IndexedDB hydration has run, so we never
  // clobber the stored copy with the localStorage-seeded starting state.
  useEffect(() => {
    if (!idbReady.current || testModeRef.current) return; // test mode never persists
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      idbSet(STORAGE_KEY, data).catch(() => { /* ignore transient write errors */ });
      // Best-effort mirror to localStorage for a fast cold-start paint. This may
      // exceed the 5 MB cap once there's lots of data/photos — that's fine, the
      // full copy lives in IndexedDB either way.
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
      catch { /* over the localStorage cap — IndexedDB holds the complete data */ }
    }, 500);
    return () => clearTimeout(persistTimer.current);
  }, [data]);

  // Returning from Stripe Connect onboarding (/?stripe=return|refresh): confirm the
  // contractor can now get paid by re-reading their connected account, then strip the
  // query so a reload doesn't re-fire. Waits for settings (and the acct id) to hydrate.
  const stripeReturnHandled = useRef(false);
  useEffect(() => {
    if (stripeReturnHandled.current) return;
    const flag = new URLSearchParams(window.location.search).get('stripe');
    if (flag !== 'return' && flag !== 'refresh') return;
    const acct = data.settings.stripeConnectAccountId;
    if (!acct) return; // settings not hydrated yet — re-runs when the id appears
    stripeReturnHandled.current = true;
    (async () => {
      try {
        const res = await fetch('/api/stripe-connect', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'status', accountId: acct }),
        });
        const d = await res.json().catch(() => ({}));
        if (res.ok) dispatch({ type: 'UPDATE_SETTINGS', payload: { stripeChargesEnabled: !!d.chargesEnabled, paymentsEnabled: !!d.chargesEnabled } });
      } catch { /* leave status as-is; the user can re-check in Settings */ }
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('stripe');
        window.history.replaceState({}, '', url.toString());
      } catch { /* ignore */ }
    })();
  }, [data.settings.stripeConnectAccountId]);

  // On mount: (1) hydrate from IndexedDB (migrating from localStorage on first
  // run), then (2) sync with Supabase if configured and the cloud copy is newer.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // ── 1) Local hydration ──────────────────────────────────────────
      // `data` here is the localStorage-seeded reducer state (see initializer).
      let local: AppData = data;
      try {
        const idbData = await idbGet<Partial<AppData>>(STORAGE_KEY);
        if (idbData) {
          local = migrateData(idbData);
          if (!cancelled) { skipNextPush.current = true; dispatch({ type: 'LOAD', payload: local }); }
        } else {
          // First run on IndexedDB — seed the big store from whatever we had
          // in localStorage so no existing data is lost.
          await idbSet(STORAGE_KEY, local);
        }
      } catch { /* fall back to the localStorage-seeded state */ }
      idbReady.current = true;
      if (cancelled) return;

      // ── 2) Supabase sync ────────────────────────────────────────────
      const { supabaseUrl, supabaseKey } = local.settings;
      if (!supabaseUrl || !supabaseKey) return;
      // Sync is strictly tied to a logged-in user's company key. If not
      // authenticated yet (e.g. the login screen is showing), we skip syncing
      // entirely — so nothing is pulled/pushed until the user actually logs in.
      const syncKey = await resolveCompanyKey(supabaseUrl, supabaseKey);
      if (!syncKey || cancelled) return;
      syncKeyRef.current = syncKey;
      setSyncStatus('syncing');
      try {
        const result = await pullData(supabaseUrl, supabaseKey, syncKey);
        if (cancelled) return;
        if (result.error === 'no_data') {
          // Nothing in cloud yet — push local up
          await pushData(supabaseUrl, supabaseKey, syncKey, local);
          const now = new Date().toISOString();
          localStorage.setItem(SYNC_TS_KEY, now);
          setLastSyncedAt(now);
          setSyncStatus('synced');
          return;
        }
        if (result.error || !result.data) { setSyncStatus('error'); return; }
        const localTs = localStorage.getItem(SYNC_TS_KEY) ?? '';
        const remoteTs = result.updatedAt ?? '';
        if (remoteTs > localTs) {
          const remote = migrateData(result.data);
          skipNextPush.current = true;
          dispatch({ type: 'LOAD', payload: remote });
          await idbSet(STORAGE_KEY, remote);   // keep the big store in step with cloud
          localStorage.setItem(SYNC_TS_KEY, remoteTs);
          setLastSyncedAt(remoteTs);
        }
        setSyncStatus('synced');
      } catch { setSyncStatus('error'); }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced push to Supabase on data change
  useEffect(() => {
    if (testModeRef.current) return; // test mode never pushes to the cloud
    const { supabaseUrl, supabaseKey } = data.settings;
    const syncKey = syncKeyRef.current;
    if (!supabaseUrl || !supabaseKey || !syncKey) return;
    if (skipNextPush.current) { skipNextPush.current = false; return; }
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      setSyncStatus('syncing');
      const result = await pushData(supabaseUrl, supabaseKey, syncKey, data);
      if (result.error) { setSyncStatus('error'); }
      else {
        const now = new Date().toISOString();
        localStorage.setItem(SYNC_TS_KEY, now);
        setLastSyncedAt(now);
        setSyncStatus('synced');
      }
    }, 3000);
    return () => clearTimeout(pushTimer.current);
  }, [data]);

  // THE SYNC BUTTON LOOKS BEFORE IT WRITES. It used to push, always — so on a
  // device that had fallen behind, one tap replaced the good books with the stale
  // ones. See syncDirection: behind the cloud means fetch, level or ahead means send.
  const syncNow = useCallback(async () => {
    if (testModeRef.current) return; // never push test data, even on a manual sync
    const { supabaseUrl, supabaseKey } = data.settings;
    const syncKey = syncKeyRef.current;
    if (!supabaseUrl || !supabaseKey || !syncKey) return;
    setSyncStatus('syncing');

    const stamp = await remoteUpdatedAt(supabaseUrl, supabaseKey, syncKey);
    if (syncDirection(localStorage.getItem(SYNC_TS_KEY), stamp.updatedAt) === 'pull') {
      const pulled = await pullData(supabaseUrl, supabaseKey, syncKey);
      if (pulled.error || !pulled.data) { setSyncStatus('error'); return; }
      const remote = migrateData(pulled.data);
      skipNextPush.current = true;     // adopting the cloud copy is not a change to send back
      dispatch({ type: 'LOAD', payload: remote });
      try { await idbSet(STORAGE_KEY, remote); } catch { /* cloud still holds it */ }
      const ts = pulled.updatedAt ?? new Date().toISOString();
      localStorage.setItem(SYNC_TS_KEY, ts);
      setLastSyncedAt(ts);
      setSyncStatus('synced');
      return;
    }

    const result = await pushData(supabaseUrl, supabaseKey, syncKey, data);
    if (result.error) { setSyncStatus('error'); }
    else {
      const now = new Date().toISOString();
      localStorage.setItem(SYNC_TS_KEY, now);
      setLastSyncedAt(now);
      setSyncStatus('synced');
    }
  }, [data]);

  // Restore a backup so it actually STICKS. The old path (bare dispatch LOAD) relied on
  // debounced effects to persist — if the app reloaded first, or the mount-time cloud pull
  // ran with a newer remote timestamp, the restore was silently lost (custom fields like
  // vatExempt / mortgage flags never survived). Here we: migrate (applies owner seeds),
  // load, write IndexedDB immediately, bump the sync timestamp so the next mount's pull
  // can't clobber it, and push to the cloud so other devices get the restored copy.
  const restoreData = useCallback(async (payload: AppData) => {
    const migrated = migrateData(payload);
    skipNextPush.current = true; // we push explicitly below; don't double-fire the debounce
    dispatch({ type: 'LOAD', payload: migrated });
    idbReady.current = true;
    try { await idbSet(STORAGE_KEY, migrated); } catch { /* IndexedDB write failed — cloud/localStorage still hold it */ }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); } catch { /* over the localStorage cap — IndexedDB has the full copy */ }
    const now = new Date().toISOString();
    localStorage.setItem(SYNC_TS_KEY, now); // mark local as newest so the mount pull won't overwrite the restore
    setLastSyncedAt(now);
    const { supabaseUrl, supabaseKey } = migrated.settings;
    const syncKey = syncKeyRef.current;
    if (supabaseUrl && supabaseKey && syncKey && !testModeRef.current) {
      setSyncStatus('syncing');
      const result = await pushData(supabaseUrl, supabaseKey, syncKey, migrated);
      setSyncStatus(result.error ? 'error' : 'synced');
    }
  }, []);

  const lang = data.settings.language;
  const t = useCallback((key: TranslationKey): string => translations[lang][key] ?? translations['is'][key] ?? key, [lang]);
  const setLang = useCallback((l: Language) => dispatch({ type: 'SET_LANGUAGE', payload: l }), []);

  const baseCC: CountryConfig = COUNTRY_CONFIGS[data.settings.country] ?? COUNTRY_CONFIGS['IS'];
  const cc: CountryConfig = {
    ...baseCC,
    currency: data.settings.defaultCurrency,
    vatRates: data.settings.vatRates?.length ? data.settings.vatRates : baseCC.vatRates,
    standardRate: data.settings.standardRate > 0 ? data.settings.standardRate : baseCC.standardRate,
    vatTerm: data.settings.vatTerm || baseCC.vatTerm,
    taxAuthority: data.settings.taxAuthority || baseCC.taxAuthority,
    companyIdLabel: data.settings.companyIdLabel || baseCC.companyIdLabel,
    vatNumberLabel: data.settings.vatNumberLabel || baseCC.vatNumberLabel,
  };
  // Formatters called without an explicit language fall back to this — see
  // setUiLanguage. Set during render so the very first figure is right.
  setUiLanguage(lang);
  const fmt = useCallback((amount: number) => formatCurrency(amount, cc.currency, lang), [cc.currency, lang]);

  // Converts an ISK-base amount (from getTransactionISK) → display currency → formatted string
  const fmtISK = useCallback((iskAmount: number): string => {
    const cur = (data.settings.defaultCurrency || 'ISK') as import('../types').Currency;
    if (cur === 'ISK') return formatISK(iskAmount, lang);
    const rate = (data.settings.exchangeRates as unknown as Record<string, number>)[cur] ?? 1;
    return formatCurrency(Math.round(iskAmount / (rate || 1)), cur, lang);
  }, [data.settings.defaultCurrency, data.settings.exchangeRates, lang]);

  return (
    <AppContext.Provider value={{ data, dispatch, t, lang, setLang, cc, fmt, fmtISK, syncStatus, lastSyncedAt, syncNow, restoreData, testMode, enterTestMode, exitTestMode, loadSampleData }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
