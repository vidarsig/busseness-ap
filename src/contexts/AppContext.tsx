import React, { createContext, useContext, useReducer, useEffect, useCallback, useState, useRef } from 'react';
import { pushData, pullData, resolveCompanyKey } from '../utils/supabase';
import { idbGet, idbSet } from '../utils/idb';
import {
  AppData, Transaction, BalanceSheetItem, AppSettings,
  Account, Invoice, RecurringTransaction, BudgetLine, PayrollEntry, CategoryRule, Task,
  StockItem, StockMovement, Supplier, Customer, Job, TimeEntry, JobMaterial, JobPhoto, AppUser, Employee,
  DEFAULT_SETTINGS, DEFAULT_ACCOUNTS, DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY, Language, CountryConfig,
} from '../types';
import { translations, TranslationKey } from '../i18n/translations';
import { COUNTRY_CONFIGS } from '../data/countries';
import { formatCurrency, formatISK } from '../utils/formatters';

const STORAGE_KEY = 'bokhalds_app_v2';

const defaultData: AppData = {
  transactions: [],
  categoryRules: [],
  balanceSheetItems: [
    { id: 'bs1', name: 'Handbært fé og bankainnstæður', nameEn: 'Cash and bank balances', section: 'current_assets', amount: 0 },
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
      const delta = mv.type === 'in' || mv.type === 'return' ? mv.qty : mv.type === 'adjust' ? mv.qty : -mv.qty;
      return {
        ...state,
        stockMovements: [...(state.stockMovements ?? []), mv],
        stockItems: (state.stockItems ?? []).map(s => s.id === mv.itemId ? { ...s, qtyOnHand: Math.max(0, s.qtyOnHand + delta), updatedAt: mv.createdAt } : s),
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
}

const AppContext = createContext<AppContextValue | null>(null);

const SYNC_TS_KEY = 'bokhalds_sync_ts';

function migrateData(parsed: Partial<AppData>): AppData {
  return {
    ...defaultData,
    ...parsed,
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
  };
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

  // Persist locally to IndexedDB (big storage, ~GBs). Debounced so a burst of
  // changes (e.g. importing thousands of bank rows, or attaching many receipts)
  // serializes once things settle instead of re-writing the whole blob on every
  // single change — that repeated serialization is what froze the screen.
  // We don't write until the initial IndexedDB hydration has run, so we never
  // clobber the stored copy with the localStorage-seeded starting state.
  useEffect(() => {
    if (!idbReady.current) return;
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

  const syncNow = useCallback(async () => {
    const { supabaseUrl, supabaseKey } = data.settings;
    const syncKey = syncKeyRef.current;
    if (!supabaseUrl || !supabaseKey || !syncKey) return;
    setSyncStatus('syncing');
    const result = await pushData(supabaseUrl, supabaseKey, syncKey, data);
    if (result.error) { setSyncStatus('error'); }
    else {
      const now = new Date().toISOString();
      localStorage.setItem(SYNC_TS_KEY, now);
      setLastSyncedAt(now);
      setSyncStatus('synced');
    }
  }, [data]);

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
  const fmt = useCallback((amount: number) => formatCurrency(amount, cc.currency, lang), [cc.currency, lang]);

  // Converts an ISK-base amount (from getTransactionISK) → display currency → formatted string
  const fmtISK = useCallback((iskAmount: number): string => {
    const cur = (data.settings.defaultCurrency || 'ISK') as import('../types').Currency;
    if (cur === 'ISK') return formatISK(iskAmount, lang);
    const rate = (data.settings.exchangeRates as unknown as Record<string, number>)[cur] ?? 1;
    return formatCurrency(Math.round(iskAmount / (rate || 1)), cur, lang);
  }, [data.settings.defaultCurrency, data.settings.exchangeRates, lang]);

  return (
    <AppContext.Provider value={{ data, dispatch, t, lang, setLang, cc, fmt, fmtISK, syncStatus, lastSyncedAt, syncNow }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
