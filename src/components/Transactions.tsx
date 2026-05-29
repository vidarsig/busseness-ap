import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Download, X, Search, Filter, FileText, FileSpreadsheet, Camera } from 'lucide-react';
import ReceiptScanner from './ReceiptScanner';
import { useApp } from '../contexts/AppContext';
import {
  Transaction, TransactionType, Currency,
  INCOME_CATEGORIES, EXPENSE_CATEGORIES, TRANSFER_CATEGORIES,
} from '../types';
import { getTransactionISK, getVATAmountISK } from '../utils/calculations';
import { formatISK, formatDate, formatCurrency, todayISO } from '../utils/formatters';
import { isTransactionLimitReached } from '../utils/planLimits';
import PlanLimitModal from './PlanLimitModal';
import { exportPDF, exportExcel } from '../utils/exports';

const EMPTY_FORM: Omit<Transaction, 'id'> = {
  date: todayISO(),
  description: '',
  category: 'sala_thjonustu',
  type: 'income',
  amount: 0,
  currency: 'ISK',
  eurToIskRate: 148,
  vatRate: 24,
  reference: '',
  receiptNote: '',
};

function newId() {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

interface ModalProps {
  initial: Omit<Transaction, 'id'> & { id?: string };
  onSave: (t: Transaction) => void;
  onClose: () => void;
}

function TransactionModal({ initial, onSave, onClose }: ModalProps) {
  const { t, data, cc } = useApp();
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const vatAmount = form.amount * (form.vatRate / 100);
  const totalWithVat = form.amount + vatAmount;
  const iskTotal = form.currency === 'ISK' ? totalWithVat : totalWithVat * form.eurToIskRate;

  const categories = form.type === 'income' ? INCOME_CATEGORIES : form.type === 'transfer' ? TRANSFER_CATEGORIES : EXPENSE_CATEGORIES;

  function handleTypeChange(newType: TransactionType) {
    const defaultCat = newType === 'income' ? 'sala_thjonustu' : newType === 'transfer' ? 'ekki_rekstur' : 'adrir_rekstrargjold';
    setForm(f => ({ ...f, type: newType, category: defaultCat, vatRate: newType === 'transfer' ? 0 : f.vatRate }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rates = data.settings.exchangeRates;
    const rate = form.currency === 'ISK' ? 1 : (form.currency === 'EUR' ? form.eurToIskRate : rates[form.currency as keyof typeof rates] ?? 1);
    const tx: Transaction = { ...form, id: initial.id ?? newId(), eurToIskRate: rate };
    onSave(tx);
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    /* Full-screen sheet on mobile, centered modal on desktop */
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50">
      <div className="bg-white w-full md:max-w-lg md:rounded-2xl md:mx-4 rounded-t-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-gray-900">
            {initial.id ? t('editTransaction') : t('addTransaction')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Type */}
          <div>
            <label className={labelCls}>{t('type')}</label>
            <div className="flex gap-2">
              {(['income', 'expense', 'transfer'] as TransactionType[]).map(tp => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => handleTypeChange(tp)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                    form.type === tp
                      ? tp === 'income'
                        ? 'bg-green-500 text-white border-green-500'
                        : tp === 'transfer'
                        ? 'bg-gray-500 text-white border-gray-500'
                        : 'bg-red-500 text-white border-red-500'
                      : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {t(tp)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('date')}</label>
              <input type="date" className={inputCls} value={form.date}
                onChange={e => set('date', e.target.value)} required />
            </div>
            <div>
              <label className={labelCls}>{t('category')}</label>
              <select className={inputCls} value={form.category}
                onChange={e => set('category', e.target.value)} required>
                {categories.map(c => (
                  <option key={c} value={c}>{t(c as never)}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>{t('description')}</label>
            <input type="text" className={inputCls} value={form.description}
              onChange={e => set('description', e.target.value)} required
              placeholder={t('description')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('currency')}</label>
              <select className={inputCls} value={form.currency}
                onChange={e => {
                  const cur = e.target.value as Currency;
                  const rates = data.settings.exchangeRates;
                  const rate = cur === 'ISK' ? 1 : rates[cur as keyof typeof rates] ?? 1;
                  set('currency', cur);
                  set('eurToIskRate', rate);
                }}>
                <option value="ISK">ISK</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="DKK">DKK</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{t('amountExVat')} ({form.currency})</label>
              <input type="number" className={inputCls} value={form.amount || ''}
                onChange={e => set('amount', parseFloat(e.target.value) || 0)}
                min={0} step={form.currency === 'ISK' ? '1' : '0.01'} required />
            </div>
          </div>

          {form.currency !== 'ISK' && (
            <div>
              <label className={labelCls}>{t('exchangeRate')} (1 {form.currency} = ISK)</label>
              <input type="number" className={inputCls} value={form.eurToIskRate}
                onChange={e => set('eurToIskRate', parseFloat(e.target.value) || 1)}
                min={1} step="0.01" />
            </div>
          )}

          <div>
            <label className={labelCls}>{t('vatRate')}</label>
            <select className={inputCls} value={form.vatRate}
              onChange={e => set('vatRate', parseFloat(e.target.value))}>
              {(cc.isUSA ? [data.settings.salesTaxRate, 0] : cc.vatRates)
                .filter((r, i, arr) => arr.indexOf(r) === i)
                .map(r => <option key={r} value={r}>{r}%</option>)}
            </select>
          </div>

          <div>
            <label className={labelCls}>{t('reference')}</label>
            <input type="text" className={inputCls} value={form.reference || ''}
              onChange={e => set('reference', e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>{t('receiptNote')}</label>
            <input type="text" className={inputCls} value={form.receiptNote || ''}
              onChange={e => set('receiptNote', e.target.value)}
              />
          </div>

          {form.amount > 0 && (
            <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1.5">
              <div className="flex justify-between text-gray-600">
                <span>{t('amountExVat')}</span>
                <span className="font-mono">{formatCurrency(form.amount, form.currency)}</span>
              </div>
              {form.vatRate > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>VSK {form.vatRate}%</span>
                  <span className="font-mono">{formatCurrency(vatAmount, form.currency)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1.5">
                <span>{t('amountIncVat')}</span>
                <span className="font-mono">{formatCurrency(totalWithVat, form.currency)}</span>
              </div>
              {form.currency !== 'ISK' && (
                <div className="flex justify-between text-blue-600 border-t border-gray-200 pt-1.5">
                  <span>{t('iskAmount')}</span>
                  <span className="font-mono">{formatISK(iskTotal)}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-1 pb-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-xl text-sm font-medium hover:bg-gray-50">
              {t('cancel')}
            </button>
            <button type="submit"
              className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-blue-700">
              {t('save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Transactions() {
  const { data, dispatch, t, lang } = useApp();
  const [modal, setModal] = useState<{ open: boolean; tx?: Transaction }>({ open: false });
  const [limitModal, setLimitModal] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  function openAddModal() {
    if (isTransactionLimitReached(data)) { setLimitModal(true); return; }
    setModal({ open: true });
  }
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [filterYear, setFilterYear] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const years = useMemo(() => {
    const ys = new Set(data.transactions.map(tx => new Date(tx.date).getFullYear()));
    return Array.from(ys).sort((a, b) => b - a);
  }, [data.transactions]);

  const filtered = useMemo(() => {
    return data.transactions
      .filter(tx => {
        if (filterType !== 'all' && tx.type !== filterType) return false;
        if (filterYear !== 'all' && new Date(tx.date).getFullYear() !== filterYear) return false;
        if (search && !tx.description.toLowerCase().includes(search.toLowerCase()) &&
          !tx.reference?.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.transactions, filterType, filterYear, search]);

  function handleSave(tx: Transaction) {
    const existing = data.transactions.find(e => e.id === tx.id);
    dispatch(existing
      ? { type: 'UPDATE_TRANSACTION', payload: tx }
      : { type: 'ADD_TRANSACTION', payload: tx }
    );
    setModal({ open: false });
  }

  function handleDelete(id: string) {
    dispatch({ type: 'DELETE_TRANSACTION', payload: id });
    setDeleteId(null);
  }

  const txCols = [
    { header: lang === 'is' ? 'Dagsetning' : 'Date',          key: 'date',     width: 14 },
    { header: lang === 'is' ? 'Lýsing' : 'Description',       key: 'desc',     width: 36 },
    { header: lang === 'is' ? 'Tegund' : 'Type',               key: 'type',     width: 12 },
    { header: lang === 'is' ? 'Flokkur' : 'Category',          key: 'cat',      width: 22 },
    { header: lang === 'is' ? 'Gjaldmiðill' : 'Currency',      key: 'cur',      width: 10 },
    { header: lang === 'is' ? 'Upphæð' : 'Amount',             key: 'amount',   width: 14 },
    { header: 'VSK%',                                           key: 'vat',      width: 8  },
    { header: lang === 'is' ? 'VSK (ISK)' : 'VAT (ISK)',       key: 'vatamt',   width: 14 },
    { header: lang === 'is' ? 'Heild (ISK)' : 'Total (ISK)',   key: 'total',    width: 16 },
    { header: lang === 'is' ? 'Tilvísun' : 'Reference',        key: 'ref',      width: 18 },
  ];
  const txRows = filtered.map(tx => ({
    date: tx.date, desc: tx.description,
    type: t(tx.type), cat: t(tx.category as never),
    cur: tx.currency, amount: tx.amount, vat: `${tx.vatRate}%`,
    vatamt: Math.round(getVATAmountISK(tx)),
    total: Math.round(getTransactionISK(tx) + getVATAmountISK(tx)),
    ref: tx.reference || '',
  }));
  const subtitle = `${data.settings.company.name || ''} · ${new Date().toLocaleDateString()}`;

  function exportToPDF() {
    exportPDF(t('transactions'), subtitle, txCols, txRows, `faerslur_${new Date().toISOString().split('T')[0]}.pdf`);
  }
  function exportToExcel() {
    exportExcel([{ name: lang === 'is' ? 'Færslur' : 'Transactions', columns: txCols, rows: txRows }],
      `faerslur_${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  function exportCSV() {
    const header = ['Dagsetning','Lýsing','Tegund','Flokkur','Gjaldmiðill','Upphæð (án VSK)','VSK%','VSK upphæð','Heildarupphæð (ISK)','Tilvísun'];
    const rows = filtered.map(tx => [
      tx.date, tx.description, tx.type, tx.category, tx.currency, tx.amount, tx.vatRate,
      getVATAmountISK(tx).toFixed(0),
      (getTransactionISK(tx) + getVATAmountISK(tx)).toFixed(0),
      tx.reference || '',
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `faerslur_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const thCls = 'px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left';
  const tdCls = 'px-3 py-2.5 text-sm text-gray-700';

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('transactions')}</h1>
        <div className="flex gap-2">
          <button onClick={exportToPDF}
            className="hidden sm:flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            <FileText className="w-4 h-4" />PDF
          </button>
          <button onClick={exportToExcel}
            className="hidden sm:flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            <FileSpreadsheet className="w-4 h-4" />Excel
          </button>
          <button onClick={exportCSV}
            className="hidden sm:flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Download className="w-4 h-4" />CSV
          </button>
          <button onClick={() => setScannerOpen(true)}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
            title={lang === 'is' ? 'Skanna kvittun' : 'Scan receipt'}>
            <Camera className="w-5 h-5" />
            <span className="hidden sm:inline">{lang === 'is' ? 'Skanna' : 'Scan'}</span>
          </button>
          <button onClick={openAddModal}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('addTransaction')}</span>
            <span className="sm:hidden">{t('add')}</span>
          </button>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('searchTransactions')}
              className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowFilters(f => !f)}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
              showFilters || filterType !== 'all' || filterYear !== 'all'
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">{t('filterByType')}</span>
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterType}
              onChange={e => setFilterType(e.target.value as typeof filterType)}
            >
              <option value="all">{t('all')}</option>
              <option value="income">{t('income')}</option>
              <option value="expense">{t('expense')}</option>
              <option value="transfer">{t('transfer')}</option>
            </select>
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterYear}
              onChange={e => setFilterYear(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            >
              <option value="all">{t('all')}</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={exportToPDF} className="sm:hidden flex items-center gap-1 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm">
              <FileText className="w-4 h-4" />PDF
            </button>
            <button onClick={exportToExcel} className="sm:hidden flex items-center gap-1 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm">
              <FileSpreadsheet className="w-4 h-4" />Excel
            </button>
            <button onClick={exportCSV} className="sm:hidden flex items-center gap-1 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm">
              <Download className="w-4 h-4" />CSV
            </button>
          </div>
        )}
      </div>

      {/* ── MOBILE card list ─────────────────────────────── */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
            <p className="text-gray-400 text-sm">{t('noTransactions')}</p>
            <button onClick={openAddModal}
              className="mt-3 text-blue-600 text-sm font-medium">{t('addFirst')}</button>
          </div>
        ) : (
          filtered.map(tx => (
            <div key={tx.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3"
            >
              <div className={`mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${tx.type === 'income' ? 'bg-green-400' : tx.type === 'transfer' ? 'bg-gray-300' : 'bg-red-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                  <p className="font-medium text-gray-800 text-sm truncate">{tx.description}</p>
                  <span className={`font-semibold text-sm flex-shrink-0 font-mono ${tx.type === 'income' ? 'text-green-600' : tx.type === 'transfer' ? 'text-gray-500' : 'text-red-600'}`}>
                    {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '±' : '-'}{formatISK(getTransactionISK(tx) + getVATAmountISK(tx), lang)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-gray-400">{formatDate(tx.date, lang)}</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{t(tx.category as never)}</span>
                  {tx.vatRate > 0 && <span className="text-xs text-gray-400">VSK {tx.vatRate}%</span>}
                  {tx.currency === 'EUR' && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">EUR</span>}
                </div>
                {tx.reference && <p className="text-xs text-gray-400 mt-0.5">{tx.reference}</p>}
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button onClick={() => setModal({ open: true, tx })}
                  className="text-gray-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => setDeleteId(tx.id)}
                  className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── DESKTOP table ────────────────────────────────── */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className={thCls}>{t('date')}</th>
                <th className={thCls}>{t('description')}</th>
                <th className={thCls}>{t('category')}</th>
                <th className={thCls}>{t('type')}</th>
                <th className={`${thCls} text-right`}>{t('amountExVat')}</th>
                <th className={`${thCls} text-right`}>VSK%</th>
                <th className={`${thCls} text-right`}>{t('iskAmount')}</th>
                <th className={thCls}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400 text-sm">
                    {t('noTransactions')}
                  </td>
                </tr>
              ) : (
                filtered.map(tx => (
                  <tr key={tx.id} className="hover:bg-gray-50/50">
                    <td className={tdCls}>{formatDate(tx.date, lang)}</td>
                    <td className={tdCls}>
                      <div className="font-medium text-gray-800">{tx.description}</div>
                      {tx.reference && <div className="text-xs text-gray-400">{tx.reference}</div>}
                    </td>
                    <td className={tdCls}>
                      <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                        {t(tx.category as never)}
                      </span>
                    </td>
                    <td className={tdCls}>
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                        tx.type === 'income' ? 'bg-green-100 text-green-700' : tx.type === 'transfer' ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-700'
                      }`}>
                        {t(tx.type)}
                      </span>
                    </td>
                    <td className={`${tdCls} text-right font-mono`}>
                      {formatCurrency(tx.amount, tx.currency, lang)}
                    </td>
                    <td className={`${tdCls} text-right`}>
                      <span className={tx.vatRate === 0 ? 'text-gray-400' : ''}>{tx.vatRate}%</span>
                    </td>
                    <td className={`${tdCls} text-right font-mono font-semibold ${tx.type === 'income' ? 'text-green-600' : tx.type === 'transfer' ? 'text-gray-500' : 'text-red-600'}`}>
                      {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '±' : '-'}{formatISK(getTransactionISK(tx) + getVATAmountISK(tx), lang)}
                    </td>
                    <td className={tdCls}>
                      <div className="flex gap-1">
                        <button onClick={() => setModal({ open: true, tx })}
                          className="text-gray-400 hover:text-blue-600 p-1 rounded">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteId(tx.id)}
                          className="text-gray-400 hover:text-red-600 p-1 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-between text-xs text-gray-500">
            <span>{filtered.length} {lang === 'is' ? 'færslur' : 'transactions'}</span>
            <div className="flex gap-4">
              <span className="text-green-600 font-semibold">
                +{formatISK(filtered.filter(tx => tx.type === 'income').reduce((s, tx) => s + getTransactionISK(tx) + getVATAmountISK(tx), 0), lang)}
              </span>
              <span className="text-red-600 font-semibold">
                -{formatISK(filtered.filter(tx => tx.type === 'expense').reduce((s, tx) => s + getTransactionISK(tx) + getVATAmountISK(tx), 0), lang)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Mobile totals bar */}
      {filtered.length > 0 && (
        <div className="md:hidden mt-2 bg-white rounded-xl border border-gray-200 px-4 py-3 flex justify-between text-xs text-gray-500">
          <span>{filtered.length} {lang === 'is' ? 'færslur' : 'transactions'}</span>
          <div className="flex gap-3">
            <span className="text-green-600 font-semibold">
              +{formatISK(filtered.filter(tx => tx.type === 'income').reduce((s, tx) => s + getTransactionISK(tx) + getVATAmountISK(tx), 0), lang)}
            </span>
            <span className="text-red-600 font-semibold">
              -{formatISK(filtered.filter(tx => tx.type === 'expense').reduce((s, tx) => s + getTransactionISK(tx) + getVATAmountISK(tx), 0), lang)}
            </span>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal.open && (
        <TransactionModal
          initial={modal.tx ?? { ...EMPTY_FORM, currency: data.settings.defaultCurrency, eurToIskRate: data.settings.exchangeRates.EUR }}
          onSave={handleSave}
          onClose={() => setModal({ open: false })}
        />
      )}
      {scannerOpen && <ReceiptScanner onClose={() => setScannerOpen(false)} />}
      <PlanLimitModal
        open={limitModal} onClose={() => setLimitModal(false)}
        limitText="You've reached 50 transactions this month on the Free plan."
        limitTextIs="Þú hefur náð 50 færslum þennan mánuð á Free plani."
      />

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-6 w-full md:max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-2">{t('deleteTransaction')}</h3>
            <p className="text-sm text-gray-600 mb-5">{t('confirmDelete')}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)}
                className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-xl text-sm hover:bg-gray-50">{t('cancel')}</button>
              <button onClick={() => handleDelete(deleteId)}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl text-sm hover:bg-red-700">{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
