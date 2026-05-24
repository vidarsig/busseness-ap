import React, { createContext, useContext, useReducer, useEffect, useCallback, useState, useRef } from 'react';
import { pushData, pullData } from '../utils/supabase';
import {
  AppData, Transaction, BalanceSheetItem, AppSettings,
  Account, Invoice, RecurringTransaction, BudgetLine, PayrollEntry, CategoryRule, Task,
  StockItem, StockMovement, Supplier,
  DEFAULT_SETTINGS, DEFAULT_ACCOUNTS, Language, CountryConfig,
} from '../types';
import { translations, TranslationKey } from '../i18n/translations';
import { COUNTRY_CONFIGS } from '../data/countries';
import { formatCurrency } from '../utils/formatters';

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
  tasks: [],
  stockItems: [],
  stockMovements: [],
  suppliers: [],
  settings: DEFAULT_SETTINGS,
};

type Action =
  | { type: 'ADD_TRANSACTION'; payload: Transaction }
  | { type: 'UPDATE_TRANSACTION'; payload: Transaction }
  | { type: 'DELETE_TRANSACTION'; payload: string }
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
  | { type: 'ADD_RULE'; payload: CategoryRule }
  | { type: 'UPDATE_RULE'; payload: CategoryRule }
  | { type: 'DELETE_RULE'; payload: string }
  | { type: 'ADD_TASK'; payload: Task }
  | { type: 'UPDATE_TASK'; payload: Task }
  | { type: 'DELETE_TASK'; payload: string }
  | { type: 'ADD_STOCK_ITEM'; payload: StockItem }
  | { type: 'UPDATE_STOCK_ITEM'; payload: StockItem }
  | { type: 'DELETE_STOCK_ITEM'; payload: string }
  | { type: 'ADD_STOCK_MOVEMENT'; payload: StockMovement }
  | { type: 'ADD_SUPPLIER'; payload: Supplier }
  | { type: 'UPDATE_SUPPLIER'; payload: Supplier }
  | { type: 'DELETE_SUPPLIER'; payload: string }
  | { type: 'SET_LANGUAGE'; payload: Language }
  | { type: 'LOAD'; payload: AppData };

function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'LOAD': return action.payload;
    case 'ADD_TRANSACTION': return { ...state, transactions: [...state.transactions, action.payload] };
    case 'UPDATE_TRANSACTION': return { ...state, transactions: state.transactions.map(t => t.id === action.payload.id ? action.payload : t) };
    case 'DELETE_TRANSACTION': return { ...state, transactions: state.transactions.filter(t => t.id !== action.payload) };
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
    case 'ADD_RULE': return { ...state, categoryRules: [...state.categoryRules, action.payload] };
    case 'UPDATE_RULE': return { ...state, categoryRules: state.categoryRules.map(r => r.id === action.payload.id ? action.payload : r) };
    case 'DELETE_RULE': return { ...state, categoryRules: state.categoryRules.filter(r => r.id !== action.payload) };
    case 'ADD_TASK': return { ...state, tasks: [...state.tasks, action.payload] };
    case 'UPDATE_TASK': return { ...state, tasks: state.tasks.map(t => t.id === action.payload.id ? action.payload : t) };
    case 'DELETE_TASK': return { ...state, tasks: state.tasks.filter(t => t.id !== action.payload) };
    case 'ADD_STOCK_ITEM': return { ...state, stockItems: [...(state.stockItems ?? []), action.payload] };
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
    case 'UPDATE_SUPPLIER': return { ...state, suppliers: (state.suppliers ?? []).map(s => s.id === action.payload.id ? action.payload : s) };
    case 'DELETE_SUPPLIER': return { ...state, suppliers: (state.suppliers ?? []).filter(s => s.id !== action.payload) };
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
    categoryRules: parsed.categoryRules ?? [],
    tasks: parsed.tasks ?? [],
    stockItems: parsed.stockItems ?? [],
    stockMovements: parsed.stockMovements ?? [],
    suppliers: parsed.suppliers ?? [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...parsed.settings,
      exchangeRates: { ...DEFAULT_SETTINGS.exchangeRates, ...parsed.settings?.exchangeRates },
      company: { ...DEFAULT_SETTINGS.company, ...parsed.settings?.company },
      country: parsed.settings?.country ?? '',
      salesTaxRate: parsed.settings?.salesTaxRate ?? 8,
      quoteLastNumber: parsed.settings?.quoteLastNumber ?? 0,
      supabaseUrl: parsed.settings?.supabaseUrl ?? '',
      supabaseKey: parsed.settings?.supabaseKey ?? '',
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
  const pushTimer = useRef<ReturnType<typeof setTimeout>>();

  // Save to localStorage on every change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch { /* ignore */ }
  }, [data]);

  // On mount: pull from Supabase if configured and remote is newer
  useEffect(() => {
    const { supabaseUrl, supabaseKey, supabaseUserKey } = data.settings;
    if (!supabaseUrl || !supabaseKey || !supabaseUserKey) return;
    setSyncStatus('syncing');
    pullData(supabaseUrl, supabaseKey, supabaseUserKey).then(result => {
      if (result.error === 'no_data') {
        // Nothing in cloud yet — push local up
        pushData(supabaseUrl, supabaseKey, supabaseUserKey, data).then(() => {
          const now = new Date().toISOString();
          localStorage.setItem(SYNC_TS_KEY, now);
          setLastSyncedAt(now);
          setSyncStatus('synced');
        });
        return;
      }
      if (result.error || !result.data) { setSyncStatus('error'); return; }
      const localTs = localStorage.getItem(SYNC_TS_KEY) ?? '';
      const remoteTs = result.updatedAt ?? '';
      if (remoteTs > localTs) {
        skipNextPush.current = true;
        dispatch({ type: 'LOAD', payload: migrateData(result.data) });
        localStorage.setItem(SYNC_TS_KEY, remoteTs);
        setLastSyncedAt(remoteTs);
      }
      setSyncStatus('synced');
    }).catch(() => setSyncStatus('error'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced push to Supabase on data change
  useEffect(() => {
    const { supabaseUrl, supabaseKey, supabaseUserKey } = data.settings;
    if (!supabaseUrl || !supabaseKey || !supabaseUserKey) return;
    if (skipNextPush.current) { skipNextPush.current = false; return; }
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      setSyncStatus('syncing');
      const result = await pushData(supabaseUrl, supabaseKey, supabaseUserKey, data);
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
    const { supabaseUrl, supabaseKey, supabaseUserKey } = data.settings;
    if (!supabaseUrl || !supabaseKey || !supabaseUserKey) return;
    setSyncStatus('syncing');
    const result = await pushData(supabaseUrl, supabaseKey, supabaseUserKey, data);
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

  return (
    <AppContext.Provider value={{ data, dispatch, t, lang, setLang, cc, fmt, syncStatus, lastSyncedAt, syncNow }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
