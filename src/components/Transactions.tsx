import { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Pencil, Trash2, Download, X, Search, Filter, FileText, FileSpreadsheet, Camera, Receipt, Users } from 'lucide-react';
import ReceiptScanner from './ReceiptScanner';
import MicButton from './MicButton';
import PhotoViewer from './PhotoViewer';
import { useApp } from '../contexts/AppContext';
import {
  Transaction, TransactionType, Currency,
  INCOME_CATEGORIES, EXPENSE_CATEGORIES, TRANSFER_CATEGORIES,
} from '../types';
import { getVATAmountISK, getTotalISK } from '../utils/calculations';
import { formatISK, formatDate, formatCurrency, todayISO } from '../utils/formatters';
import { isTransactionLimitReached } from '../utils/planLimits';
import PlanLimitModal from './PlanLimitModal';
import { exportPDF, exportExcel } from '../utils/exports';

// Case- and accent-insensitive fold (matches the AI match helper), so the name
// filter finds "Krónan"/"Vörður" when you type "kronan"/"vordur".
const foldAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/æ/g, 'ae').replace(/ø/g, 'o');

// How a row reads at a glance in a long list. Money IN — income, or a loan RECEIVED
// ('lan_mottekid' transfer) — is green +. Money OUT — expense, or a loan repayment
// ('lan_afborgun' transfer) — is red −. A neutral transfer whose direction the app
// can't know ('ekki_rekstur') stays gray ±. Same in/out rule the balance math uses,
// so the colour and the running balance always agree.
function flowStyle(tx: Transaction): { sign: string; text: string; dot: string; chip: string } {
  if (tx.type === 'income' || tx.category === 'lan_mottekid')
    return { sign: '+', text: 'text-green-600', dot: 'bg-green-400', chip: 'bg-green-100 text-green-700' };
  if (tx.type === 'expense' || tx.category === 'lan_afborgun')
    return { sign: '-', text: 'text-red-600', dot: 'bg-red-400', chip: 'bg-red-100 text-red-700' };
  return { sign: '±', text: 'text-gray-500', dot: 'bg-gray-300', chip: 'bg-gray-100 text-gray-600' };
}

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
  jobId: '',
  accountId: '',
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
  const { t, data, cc, lang } = useApp();
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const vatAmount = form.amount * (form.vatRate / 100);
  const totalWithVat = form.amount + vatAmount;
  const iskTotal = form.currency === 'ISK' ? totalWithVat : totalWithVat * form.eurToIskRate;

  // US reads "Sales Tax", not "VAT"; other languages keep their own translation.
  const exVatLabel = cc.isUSA ? `Amount excl. ${cc.vatTerm}` : t('amountExVat');
  const incVatLabel = cc.isUSA ? `Amount incl. ${cc.vatTerm}` : t('amountIncVat');

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
            <div className="flex gap-2 items-center">
              <input type="text" className={inputCls} value={form.description}
                onChange={e => set('description', e.target.value)} required
                placeholder={t('description')} />
              <MicButton value={form.description} onChange={v => set('description', v)} lang={lang} />
            </div>
          </div>

          {(data.jobs ?? []).length > 0 && (
            <div>
              <label className={labelCls}>{lang === 'is' ? 'Verkefni (valfrjálst)' : 'Project (optional)'}</label>
              <select className={inputCls} value={form.jobId ?? ''} onChange={e => set('jobId', e.target.value)}>
                <option value="">{lang === 'is' ? 'Ekkert verkefni' : 'No project'}</option>
                {(data.jobs ?? []).filter(j => j.status !== 'cancelled').map(j => (
                  <option key={j.id} value={j.id}>{j.number}{j.name ? ` — ${j.name}` : ''}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">{lang === 'is' ? 'Bókast áfram sem færsla — birtist líka sem kostnaður á verkefninu (ekki tvíbókað).' : 'Still booked as a transaction — also shows as a cost on the project (not double-booked).'}</p>
            </div>
          )}

          {data.accounts.filter(a => a.isActive).length > 0 && (
            <div>
              <label className={labelCls}>{lang === 'is' ? 'Bókhaldslykill (valfrjálst)' : 'Key / account (optional)'}</label>
              <select className={inputCls} value={form.accountId ?? ''} onChange={e => set('accountId', e.target.value)}>
                <option value="">{lang === 'is' ? 'Enginn lykill' : 'No key'}</option>
                {data.accounts.filter(a => a.isActive)
                  .sort((a, b) => a.number.localeCompare(b.number))
                  .map(a => (
                    <option key={a.id} value={a.id}>{a.number} — {lang === 'is' ? a.name : (a.nameEn || a.name)}</option>
                  ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">{lang === 'is' ? 'Bókar færsluna á tiltekinn lykil (t.d. veðskuldabréf, leigutekjur).' : 'Books this entry onto a specific key (e.g. a loan, rent income).'}</p>
            </div>
          )}

          {data.accounts.find(a => a.id === form.accountId)?.type === 'liability' && form.type !== 'income' && (
            <div>
              <label className={labelCls}>{lang === 'is' ? 'Þar af vextir (valfrjálst)' : 'Of which interest (optional)'}</label>
              <input type="number" inputMode="decimal" className={inputCls} placeholder="0"
                value={form.interestAmount ?? ''}
                onChange={e => set('interestAmount', e.target.value === '' ? undefined : Number(e.target.value))}
                min={0} />
              <p className="text-xs text-gray-400 mt-1">{lang === 'is' ? 'Aðeins höfuðstóllinn (upphæð − vextir) lækkar lánið; vextir teljast fjármagnsgjöld.' : 'Only the principal (amount − interest) reduces the loan; interest counts as a financial expense.'}</p>
            </div>
          )}

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
              <label className={labelCls}>{exVatLabel} ({form.currency})</label>
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
            <label className={labelCls}>{cc.isUSA ? `${cc.vatTerm} Rate` : t('vatRate')}</label>
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
                <span>{exVatLabel}</span>
                <span className="font-mono">{formatCurrency(form.amount, form.currency)}</span>
              </div>
              {form.vatRate > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>{cc.vatTerm} {form.vatRate}%</span>
                  <span className="font-mono">{formatCurrency(vatAmount, form.currency)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1.5">
                <span>{incVatLabel}</span>
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

export default function Transactions({ initialFilter, onFilterConsumed }: { initialFilter?: { category?: string; year?: number } | null; onFilterConsumed?: () => void } = {}) {
  const { data, dispatch, t, lang, cc } = useApp();
  const inclVat = data.settings.pricesIncludeVAT; // amounts are gross → extract VAT for display
  const [modal, setModal] = useState<{ open: boolean; tx?: Transaction }>({ open: false });
  const [limitModal, setLimitModal] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [receiptView, setReceiptView] = useState<string | null>(null);
  // Attach a photo to an existing entry: the camera icon on a row without a
  // receipt targets that entry, then the hidden input opens the camera.
  const [photoTargetTx, setPhotoTargetTx] = useState<Transaction | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  function openPhoto(tx: Transaction) {
    if (tx.receiptUrl) { setReceiptView(tx.receiptUrl); return; }
    setPhotoTargetTx(tx);
    receiptInputRef.current?.click();
  }
  function attachReceipt(files: FileList | null) {
    const file = files?.[0];
    const tx = photoTargetTx;
    if (!file || !tx) { setPhotoTargetTx(null); return; }
    const reader = new FileReader();
    reader.onload = () => {
      dispatch({ type: 'UPDATE_TRANSACTION', payload: { ...tx, receiptUrl: String(reader.result) } });
      setPhotoTargetTx(null);
    };
    reader.readAsDataURL(file);
  }

  function openAddModal() {
    if (isTransactionLimitReached(data)) { setLimitModal(true); return; }
    setModal({ open: true });
  }
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [filterYear, setFilterYear] = useState<number | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<string | 'all'>('all');
  const [filterKey, setFilterKey] = useState<string>('all'); // accountId, 'all', or 'none'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [filterName, setFilterName] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [bulkKey, setBulkKey] = useState(''); // accountId to bulk-assign onto all filtered rows
  const [bulkType, setBulkType] = useState<string>('');  // '' | income | expense | transfer — bulk-set the type
  const [bulkCat, setBulkCat] = useState<string>('');    // '' or a category key — bulk-set the category

  // When arriving from a drill-down (e.g. clicking a key in Skýrslur), pre-filter
  // to that key and year and open the filter panel so it's obvious what's shown.
  useEffect(() => {
    if (!initialFilter) return;
    if (initialFilter.category) setFilterCategory(initialFilter.category);
    if (initialFilter.year) setFilterYear(initialFilter.year);
    setShowFilters(true);
    // Clear the drill target so it doesn't force this filter on every later visit.
    onFilterConsumed?.();
  }, [initialFilter, onFilterConsumed]);

  const years = useMemo(() => {
    const ys = new Set(data.transactions.map(tx => new Date(tx.date).getFullYear()));
    return Array.from(ys).sort((a, b) => b - a);
  }, [data.transactions]);

  const filtered = useMemo(() => {
    return data.transactions
      .filter(tx => {
        if (filterType !== 'all' && tx.type !== filterType) return false;
        if (filterYear !== 'all' && new Date(tx.date).getFullYear() !== filterYear) return false;
        if (filterCategory !== 'all' && tx.category !== filterCategory) return false;
        if (filterKey === 'none') { if (tx.accountId && data.accounts.some(a => a.id === tx.accountId)) return false; }
        else if (filterKey !== 'all' && tx.accountId !== filterKey) return false;
        if (dateFrom && tx.date < dateFrom) return false;
        if (dateTo && tx.date > dateTo) return false;
        if (search && !tx.description.toLowerCase().includes(search.toLowerCase()) &&
          !tx.reference?.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterName) {
          // Accent-insensitive so "kronan" finds "Krónan", "vordur" finds "Vörður".
          const q = foldAccents(filterName);
          if (!foldAccents(tx.description).includes(q) && !foldAccents(tx.reference ?? '').includes(q)) return false;
        }
        const min = parseFloat(amountMin), max = parseFloat(amountMax);
        if (!isNaN(min) && tx.amount < min) return false;
        if (!isNaN(max) && tx.amount > max) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.transactions, filterType, filterYear, filterCategory, filterKey, dateFrom, dateTo, search, filterName, amountMin, amountMax]);

  // Keys (categories) actually in use, so the filter only lists real ones.
  const usedCategories = useMemo(() =>
    Array.from(new Set(data.transactions.map(tx => tx.category))).sort(),
    [data.transactions]);

  // Summary of whatever is currently shown (e.g. one key) — count + totals, so
  // you see the transactions AND the total for each key in one place.
  const summary = useMemo(() => {
    let income = 0, expense = 0, transfer = 0;
    for (const tx of filtered) {
      const v = getTotalISK(tx, inclVat);
      if (tx.type === 'income') income += v;
      else if (tx.type === 'expense') expense += v;
      else transfer += v;
    }
    return { income, expense, transfer, net: income - expense, count: filtered.length };
  }, [filtered]);

  // Book the SAME key onto every currently-filtered row in one go — the fast way
  // to clear the long tail (filter "Enginn lykill" → dump into a catch-all key).
  // Confirms with the exact count first; only the accountId changes, so it's fully
  // reversible (re-filter and reassign). Guarded to a filtered subset so it can't
  // silently key the entire history.
  // Bulk-reclassify every filtered row: set any of type / category / key at once.
  // '__none__' on the key clears it (accountId → undefined). Guarded to a filtered
  // subset and confirmed with the exact count, so it can't silently re-key the
  // whole history and is fully reversible (re-filter and change again).
  function bulkApply() {
    const clearing = bulkKey === '__none__';
    const acc = (!clearing && bulkKey) ? data.accounts.find(a => a.id === bulkKey) : null;
    const changes: Partial<Transaction> = {};
    if (bulkType) {
      changes.type = bulkType as TransactionType;
      if (bulkType === 'transfer') changes.vatRate = 0; // transfers never carry VAT
    }
    if (bulkCat) changes.category = bulkCat;
    if (clearing) changes.accountId = undefined;
    else if (bulkKey) changes.accountId = bulkKey;
    if (Object.keys(changes).length === 0) return;
    const parts: string[] = [];
    if (bulkType) parts.push(`${lang === 'is' ? 'tegund' : 'type'} → ${t(bulkType as never)}`);
    if (bulkCat) parts.push(`${lang === 'is' ? 'flokkur' : 'category'} → ${t(bulkCat as never)}`);
    if (clearing) parts.push(lang === 'is' ? 'taka lykil af' : 'clear key');
    else if (acc) parts.push(`${lang === 'is' ? 'lykill' : 'key'} → ${acc.number}`);
    const msg = lang === 'is'
      ? `Breyta öllum ${filtered.length} færslum sem hér sjást?\n  ${parts.join('\n  ')}\nÞú getur breytt aftur síðar.`
      : `Change all ${filtered.length} shown transactions?\n  ${parts.join('\n  ')}\nYou can change it again later.`;
    if (!window.confirm(msg)) return;
    for (const tx of filtered) dispatch({ type: 'UPDATE_TRANSACTION', payload: { ...tx, ...changes } });
    setBulkType(''); setBulkCat(''); setBulkKey('');
  }

  // Render only a page at a time — a full history can be thousands of rows, and
  // drawing them all at once freezes the screen (especially right after a big
  // bank import). Reset back to the first page whenever the filters change.
  const PAGE = 150;
  const [visibleCount, setVisibleCount] = useState(PAGE);
  useEffect(() => { setVisibleCount(PAGE); }, [filterType, filterYear, filterCategory, filterKey, dateFrom, dateTo, search, filterName, amountMin, amountMax]);
  const paged = filtered.slice(0, visibleCount);

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
    { header: `${cc.vatTerm}%`,                                 key: 'vat',      width: 8  },
    { header: `${cc.vatTerm} (ISK)`,                            key: 'vatamt',   width: 14 },
    { header: lang === 'is' ? 'Heild (ISK)' : 'Total (ISK)',   key: 'total',    width: 16 },
    { header: lang === 'is' ? 'Tilvísun' : 'Reference',        key: 'ref',      width: 18 },
  ];
  const txRows = filtered.map(tx => ({
    date: tx.date, desc: tx.description,
    type: t(tx.type), cat: t(tx.category as never),
    cur: tx.currency, amount: tx.amount, vat: `${tx.vatRate}%`,
    vatamt: Math.round(getVATAmountISK(tx, inclVat)),
    total: Math.round(getTotalISK(tx, inclVat)),
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
    const header = lang === 'is'
      ? ['Dagsetning','Lýsing','Tegund','Flokkur','Gjaldmiðill',`Upphæð (án ${cc.vatTerm})`,`${cc.vatTerm}%`,`${cc.vatTerm} upphæð`,'Heildarupphæð (ISK)','Tilvísun']
      : ['Date','Description','Type','Category','Currency',`Amount (excl. ${cc.vatTerm})`,`${cc.vatTerm}%`,`${cc.vatTerm} amount`,'Total (ISK)','Reference'];
    const rows = filtered.map(tx => [
      tx.date, tx.description, tx.type, tx.category, tx.currency, tx.amount, tx.vatRate,
      getVATAmountISK(tx, inclVat).toFixed(0),
      (getTotalISK(tx, inclVat)).toFixed(0),
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

  // Export a counterparty index of the currently-filtered set: one row per party
  // (grouped by description), with count, total in/out/net, and a column per year.
  function exportCounterparties() {
    const yrs = Array.from(new Set(filtered.map(tx => new Date(tx.date).getFullYear()))).sort((a, b) => a - b);
    const map = new Map<string, { inc: number; exp: number; count: number; perYear: Record<number, number> }>();
    for (const tx of filtered) {
      const key = (tx.description || '').trim() || (lang === 'is' ? '(engin lýsing)' : '(no description)');
      let e = map.get(key);
      if (!e) { e = { inc: 0, exp: 0, count: 0, perYear: {} }; map.set(key, e); }
      const y = new Date(tx.date).getFullYear();
      const v = getTotalISK(tx, inclVat);
      e.perYear[y] = e.perYear[y] ?? 0;
      if (tx.type === 'income') { e.inc += v; e.perYear[y] += v; }
      else if (tx.type === 'expense') { e.exp += v; e.perYear[y] -= v; }
      e.count++;
    }
    const cols = [
      { header: lang === 'is' ? 'Aðili' : 'Party', key: 'party', width: 38 },
      { header: lang === 'is' ? 'Fjöldi' : 'Count', key: 'count', width: 8 },
      { header: lang === 'is' ? 'Inn' : 'In', key: 'inc', width: 14 },
      { header: lang === 'is' ? 'Út' : 'Out', key: 'exp', width: 14 },
      { header: lang === 'is' ? 'Nettó' : 'Net', key: 'net', width: 14 },
      ...yrs.map(y => ({ header: String(y), key: `y${y}`, width: 12 })),
    ];
    const rows = [...map.entries()].map(([party, e]) => {
      const row: Record<string, string | number> = {
        party, count: e.count, inc: Math.round(e.inc), exp: Math.round(e.exp), net: Math.round(e.inc - e.exp),
      };
      yrs.forEach(y => { row[`y${y}`] = Math.round(e.perYear[y] ?? 0); });
      return row;
    }).sort((a, b) => Math.abs(b.net as number) - Math.abs(a.net as number));
    exportExcel([{ name: lang === 'is' ? 'Aðilar' : 'Counterparties', columns: cols, rows }],
      `adilar_${new Date().toISOString().split('T')[0]}.xlsx`);
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
          <button onClick={exportCounterparties} title={lang === 'is' ? 'Flytja út aðilalista (Excel)' : 'Export counterparty list (Excel)'}
            className="hidden sm:flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Users className="w-4 h-4" />{lang === 'is' ? 'Aðilar' : 'Parties'}
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
              showFilters || filterType !== 'all' || filterYear !== 'all' || filterCategory !== 'all' || filterKey !== 'all' || dateFrom || dateTo || filterName || amountMin || amountMax
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
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              title={lang === 'is' ? 'Flokkur' : 'Category'}
            >
              <option value="all">{lang === 'is' ? 'Allir flokkar' : 'All categories'}</option>
              {usedCategories.map(c => <option key={c} value={c}>{t(c as never)}</option>)}
            </select>
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterKey}
              onChange={e => setFilterKey(e.target.value)}
              title={lang === 'is' ? 'Bókhaldslykill' : 'Key / account'}
            >
              <option value="all">{lang === 'is' ? 'Allir lyklar' : 'All keys'}</option>
              <option value="none">{lang === 'is' ? 'Enginn lykill' : 'No key'}</option>
              {[...data.accounts].sort((a, b) => a.number.localeCompare(b.number)).map(a => (
                <option key={a.id} value={a.id}>{a.number} — {lang === 'is' ? a.name : (a.nameEn || a.name)}</option>
              ))}
            </select>
            <div className="flex items-center gap-1.5">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                title={lang === 'is' ? 'Frá dagsetningu' : 'From date'}
                className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <span className="text-gray-400 text-sm">–</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                title={lang === 'is' ? 'Til dagsetningar' : 'To date'}
                className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); }}
                  title={lang === 'is' ? 'Hreinsa dagsetningar' : 'Clear dates'}
                  className="text-gray-400 hover:text-gray-600 p-1"><X className="w-4 h-4" /></button>
              )}
            </div>
            <input type="text" value={filterName} onChange={e => setFilterName(e.target.value)}
              placeholder={lang === 'is' ? 'Nafn' : 'Name'}
              title={lang === 'is' ? 'Nafn viðskiptaaðila' : 'Counterparty name'}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="flex items-center gap-1.5">
              <input type="number" inputMode="decimal" value={amountMin} onChange={e => setAmountMin(e.target.value)}
                placeholder={lang === 'is' ? 'Lágm. upphæð' : 'Min amount'}
                title={lang === 'is' ? 'Lágmarksupphæð' : 'Minimum amount'}
                className="border border-gray-300 rounded-lg px-2 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <span className="text-gray-400 text-sm">–</span>
              <input type="number" inputMode="decimal" value={amountMax} onChange={e => setAmountMax(e.target.value)}
                placeholder={lang === 'is' ? 'Hám. upphæð' : 'Max amount'}
                title={lang === 'is' ? 'Hámarksupphæð' : 'Maximum amount'}
                className="border border-gray-300 rounded-lg px-2 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {(amountMin || amountMax) && (
                <button onClick={() => { setAmountMin(''); setAmountMax(''); }}
                  title={lang === 'is' ? 'Hreinsa upphæð' : 'Clear amount'}
                  className="text-gray-400 hover:text-gray-600 p-1"><X className="w-4 h-4" /></button>
              )}
            </div>
            <button onClick={exportToPDF} className="sm:hidden flex items-center gap-1 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm">
              <FileText className="w-4 h-4" />PDF
            </button>
            <button onClick={exportToExcel} className="sm:hidden flex items-center gap-1 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm">
              <FileSpreadsheet className="w-4 h-4" />Excel
            </button>
            <button onClick={exportCSV} className="sm:hidden flex items-center gap-1 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm">
              <Download className="w-4 h-4" />CSV
            </button>
            <button onClick={exportCounterparties} className="sm:hidden flex items-center gap-1 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm">
              <Users className="w-4 h-4" />{lang === 'is' ? 'Aðilar' : 'Parties'}
            </button>
            {filtered.length > 0 && (
              <button onClick={() => setBulkDeleteOpen(true)}
                className="flex items-center gap-1 border border-red-200 text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm ml-auto">
                <Trash2 className="w-4 h-4" />
                {lang === 'is' ? `Eyða völdum (${filtered.length})` : `Delete shown (${filtered.length})`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Summary of the current selection (per key) ───── */}
      {filtered.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-semibold text-gray-800">
            {filterKey !== 'all'
              ? (filterKey === 'none'
                  ? (lang === 'is' ? 'Enginn lykill' : 'No key')
                  : (() => { const a = data.accounts.find(x => x.id === filterKey); return a ? `${a.number} — ${lang === 'is' ? a.name : (a.nameEn || a.name)}` : (lang === 'is' ? 'Lykill' : 'Key'); })())
              : filterCategory !== 'all' ? t(filterCategory as never) : (lang === 'is' ? 'Allar færslur' : 'All transactions')}
          </span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-600">{summary.count} {lang === 'is' ? 'færslur' : 'transactions'}</span>
          {summary.income > 0 && <span className="font-mono text-green-600">+{formatISK(summary.income, lang)}</span>}
          {summary.expense > 0 && <span className="font-mono text-red-600">-{formatISK(summary.expense, lang)}</span>}
          {summary.transfer !== 0 && <span className="font-mono text-gray-500">±{formatISK(summary.transfer, lang)}</span>}
          {summary.income > 0 && summary.expense > 0 && (
            <span className="ml-auto font-semibold text-gray-800">{lang === 'is' ? 'Nettó' : 'Net'}: {formatISK(summary.net, lang)}</span>
          )}
        </div>
      )}

      {/* Bulk-assign a key to every filtered row — only when a filter narrows the
          list, so you can't accidentally re-key the whole history. */}
      {filtered.length > 0 && filtered.length < data.transactions.length && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-amber-800 font-medium">
            {lang === 'is' ? `Breyta öllum ${filtered.length} færslum:` : `Change all ${filtered.length} rows:`}
          </span>
          <select value={bulkType} onChange={e => { setBulkType(e.target.value); setBulkCat(''); }}
            className="border border-amber-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
            <option value="">{lang === 'is' ? 'Tegund…' : 'Type…'}</option>
            <option value="income">{t('income')}</option>
            <option value="expense">{t('expense')}</option>
            <option value="transfer">{t('transfer')}</option>
          </select>
          {bulkType && (
            <select value={bulkCat} onChange={e => setBulkCat(e.target.value)}
              className="border border-amber-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
              <option value="">{lang === 'is' ? 'Flokkur…' : 'Category…'}</option>
              {(bulkType === 'income' ? INCOME_CATEGORIES : bulkType === 'transfer' ? TRANSFER_CATEGORIES : EXPENSE_CATEGORIES)
                .map(c => <option key={c} value={c}>{t(c as never)}</option>)}
            </select>
          )}
          <select value={bulkKey} onChange={e => setBulkKey(e.target.value)}
            className="border border-amber-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
            <option value="">{lang === 'is' ? 'Lykill…' : 'Key…'}</option>
            <option value="__none__">{lang === 'is' ? '— Taka lykil af (hreinsa) —' : '— Remove key (clear) —'}</option>
            {[...data.accounts].sort((a, b) => a.number.localeCompare(b.number)).map(a => (
              <option key={a.id} value={a.id}>{a.number} — {lang === 'is' ? a.name : (a.nameEn || a.name)}</option>
            ))}
          </select>
          <button onClick={bulkApply} disabled={!bulkType && !bulkCat && !bulkKey}
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:bg-gray-300">
            {lang === 'is' ? 'Setja á allar' : 'Apply to all'}
          </button>
        </div>
      )}

      {/* ── MOBILE card list ─────────────────────────────── */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
            <p className="text-gray-400 text-sm">{t('noTransactions')}</p>
            <button onClick={openAddModal}
              className="mt-3 text-blue-600 text-sm font-medium">{t('addFirst')}</button>
          </div>
        ) : (
          paged.map(tx => { const flow = flowStyle(tx); return (
            <div key={tx.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3"
            >
              <div className={`mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${flow.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                  <p className="font-medium text-gray-800 text-sm truncate">{tx.description}</p>
                  <span className={`font-semibold text-sm flex-shrink-0 font-mono ${flow.text}`}>
                    {flow.sign}{formatISK(getTotalISK(tx, inclVat), lang)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-gray-400">{formatDate(tx.date, lang)}</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{t(tx.category as never)}</span>
                  {tx.accountId && (() => { const acc = data.accounts.find(a => a.id === tx.accountId); return acc ? <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full">{acc.number} {lang === 'is' ? acc.name : (acc.nameEn || acc.name)}</span> : null; })()}
                  {tx.vatRate > 0 && <span className="text-xs text-gray-400">{cc.vatTerm} {tx.vatRate}%</span>}
                  {tx.currency === 'EUR' && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">EUR</span>}
                </div>
                {tx.reference && <p className="text-xs text-gray-400 mt-0.5">{tx.reference}</p>}
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button onClick={() => openPhoto(tx)}
                  title={tx.receiptUrl ? (lang === 'is' ? 'Skoða mynd' : 'View photo') : (lang === 'is' ? 'Bæta við mynd' : 'Add photo')}
                  className={tx.receiptUrl
                    ? 'text-green-600 hover:text-green-700 p-1.5 rounded-lg hover:bg-green-50'
                    : 'text-gray-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50'}>
                  {tx.receiptUrl ? <Receipt className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                </button>
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
          ); })
        )}
        {filtered.length > visibleCount && (
          <button onClick={() => setVisibleCount(c => c + 300)}
            className="w-full py-3 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors">
            {lang === 'is' ? `Sýna fleiri (${filtered.length - visibleCount} eftir)` : `Show more (${filtered.length - visibleCount} left)`}
          </button>
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
                <th className={`${thCls} text-right`}>{cc.isUSA ? `Amount excl. ${cc.vatTerm}` : t('amountExVat')}</th>
                <th className={`${thCls} text-right`}>{cc.vatTerm}%</th>
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
                paged.map(tx => { const flow = flowStyle(tx); return (
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
                      <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${flow.chip}`}>
                        {t(tx.type)}
                      </span>
                    </td>
                    <td className={`${tdCls} text-right font-mono`}>
                      {formatCurrency(tx.amount, tx.currency, lang)}
                    </td>
                    <td className={`${tdCls} text-right`}>
                      <span className={tx.vatRate === 0 ? 'text-gray-400' : ''}>{tx.vatRate}%</span>
                    </td>
                    <td className={`${tdCls} text-right font-mono font-semibold ${flow.text}`}>
                      {flow.sign}{formatISK(getTotalISK(tx, inclVat), lang)}
                    </td>
                    <td className={tdCls}>
                      <div className="flex gap-1">
                        <button onClick={() => openPhoto(tx)}
                          title={tx.receiptUrl ? (lang === 'is' ? 'Skoða mynd' : 'View photo') : (lang === 'is' ? 'Bæta við mynd' : 'Add photo')}
                          className={tx.receiptUrl ? 'text-green-600 hover:text-green-700 p-1 rounded' : 'text-gray-400 hover:text-blue-600 p-1 rounded'}>
                          {tx.receiptUrl ? <Receipt className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
                        </button>
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
                ); })
              )}
            </tbody>
          </table>
          {filtered.length > visibleCount && (
            <button onClick={() => setVisibleCount(c => c + 300)}
              className="w-full py-3 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border-t border-gray-100 transition-colors">
              {lang === 'is' ? `Sýna fleiri (${filtered.length - visibleCount} eftir)` : `Show more (${filtered.length - visibleCount} left)`}
            </button>
          )}
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-between text-xs text-gray-500">
            <span>{filtered.length} {lang === 'is' ? 'færslur' : 'transactions'}</span>
            <div className="flex gap-4">
              <span className="text-green-600 font-semibold">
                +{formatISK(filtered.filter(tx => tx.type === 'income').reduce((s, tx) => s + getTotalISK(tx, inclVat), 0), lang)}
              </span>
              <span className="text-red-600 font-semibold">
                -{formatISK(filtered.filter(tx => tx.type === 'expense').reduce((s, tx) => s + getTotalISK(tx, inclVat), 0), lang)}
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
              +{formatISK(filtered.filter(tx => tx.type === 'income').reduce((s, tx) => s + getTotalISK(tx, inclVat), 0), lang)}
            </span>
            <span className="text-red-600 font-semibold">
              -{formatISK(filtered.filter(tx => tx.type === 'expense').reduce((s, tx) => s + getTotalISK(tx, inclVat), 0), lang)}
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

      {/* Hidden camera/file input for attaching a photo to an existing entry */}
      <input ref={receiptInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { attachReceipt(e.target.files); e.target.value = ''; }} />

      {/* Receipt image viewer */}
      {receiptView && (
        <PhotoViewer
          photos={[{ dataUrl: receiptView }]}
          onClose={() => setReceiptView(null)}
          altLabel={lang === 'is' ? 'Kvittun' : 'Receipt'}
        />
      )}
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

      {/* Bulk delete confirm (development clean-up) */}
      {bulkDeleteOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-6 w-full md:max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              {lang === 'is' ? `Eyða ${filtered.length} færslum?` : `Delete ${filtered.length} transactions?`}
            </h3>
            <p className="text-sm text-gray-600 mb-2">
              {lang === 'is'
                ? 'Þetta eyðir öllum færslunum sem núna eru sýndar (miðað við síu). Þetta er ekki hægt að afturkalla.'
                : 'This deletes every transaction currently shown (matching your filter). This cannot be undone.'}
            </p>
            <p className="text-xs text-gray-500 mb-5">
              {filterYear === 'all' && filterType === 'all' && filterCategory === 'all' && !search
                ? (lang === 'is' ? '⚠️ Engin sía valin — ALLAR færslur verða fjarlægðar.' : '⚠️ No filter set — ALL transactions will be removed.')
                : (lang === 'is' ? 'Ábending: notaðu síuna (lykill/ár/tegund/leit) til að eyða aðeins hluta.' : 'Tip: use the filters (key/year/type/search) to delete only part.')}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setBulkDeleteOpen(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-xl text-sm hover:bg-gray-50">{t('cancel')}</button>
              <button onClick={() => { dispatch({ type: 'DELETE_TRANSACTIONS', payload: filtered.map(tx => tx.id) }); setBulkDeleteOpen(false); }}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl text-sm hover:bg-red-700">
                {lang === 'is' ? `Eyða ${filtered.length}` : `Delete ${filtered.length}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
