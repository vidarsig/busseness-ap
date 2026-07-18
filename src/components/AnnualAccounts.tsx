import { useState, useMemo, Fragment } from 'react';
import { Printer, Plus, Pencil, Trash2, X, Download, Send } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { filterByYear, calcProfitLoss, accountBalanceByYear } from '../utils/calculations';
import { exportPDF, sharePDF, ExportColumn, ExportRow } from '../utils/exports';
import { BalanceSheetItem, Account } from '../types';

function newId() {
  return `bs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

interface BSModalProps {
  initial?: BalanceSheetItem;
  onSave: (item: BalanceSheetItem) => void;
  onClose: () => void;
}

function BSModal({ initial, onSave, onClose }: BSModalProps) {
  const { t } = useApp();
  const [form, setForm] = useState<BalanceSheetItem>(initial ?? {
    id: newId(),
    name: '',
    nameEn: '',
    section: 'current_assets',
    amount: 0,
  });

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

  const sections = [
    { value: 'fixed_assets', label: t('fixedAssets') },
    { value: 'current_assets', label: t('currentAssets') },
    { value: 'equity', label: t('equity') },
    { value: 'long_term_liabilities', label: t('longTermLiabilities') },
    { value: 'current_liabilities', label: t('currentLiabilities') },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold">{initial ? t('edit') : t('addBalanceSheetItem')}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className={labelCls}>{t('name')} (IS)</label>
            <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label className={labelCls}>{t('name')} (EN)</label>
            <input className={inputCls} value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>{t('section')}</label>
            <select className={inputCls} value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value as BalanceSheetItem['section'] }))}>
              {sections.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('openingBalance')} (ISK)</label>
            <input type="number" className={inputCls} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">{t('cancel')}</button>
            <button onClick={() => onSave(form)} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700">{t('save')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AnnualAccounts() {
  const { data, dispatch, t, lang, fmtISK } = useApp();
  // Browse the accounts for any year with data (not just the fiscal year), so the
  // owner can see all years. Only the displayed year changes — the figures come
  // from the same calcProfitLoss engine as before.
  const years = useMemo(() => {
    const ys = new Set(data.transactions.map(tx => new Date(tx.date).getFullYear()));
    ys.add(data.settings.fiscalYear);
    return [...ys].sort((a, b) => b - a);
  }, [data.transactions, data.settings.fiscalYear]);
  const [year, setYear] = useState(data.settings.fiscalYear);
  const company = data.settings.company;
  const txs = filterByYear(data.transactions, year);
  const pl = calcProfitLoss(txs, data.settings.corporateTaxRate);

  const [bsModal, setBsModal] = useState<{ open: boolean; item?: BalanceSheetItem }>({ open: false });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'income' | 'balance' | 'notes'>('income');

  const bsItems = data.balanceSheetItems;

  const getSection = (section: BalanceSheetItem['section']) =>
    bsItems.filter(b => b.section === section);

  const totalFixedAssets = getSection('fixed_assets').reduce((s, b) => s + b.amount, 0);
  const totalCurrentAssets = getSection('current_assets').reduce((s, b) => s + b.amount, 0);
  const totalAssets = totalFixedAssets + totalCurrentAssets;

  const totalEquity = getSection('equity').reduce((s, b) => s + b.amount, 0) + pl.netResult;
  const totalLongTerm = getSection('long_term_liabilities').reduce((s, b) => s + b.amount, 0);
  const totalCurrentLiab = getSection('current_liabilities').reduce((s, b) => s + b.amount, 0);
  const totalEquityAndLiab = totalEquity + totalLongTerm + totalCurrentLiab;

  // Carried key balances for the selected year: each balance-sheet key's closing
  // balance at year-end (opening + booked entries, principal-only for loans),
  // shown as a per-year informational section. Kept separate from the manual
  // balance-sheet totals above so a partly-keyed setup can't show a false
  // "doesn't balance" — full integration needs cash tracking (in progress).
  const keyClosing = (acc: Account): number => {
    const rows = accountBalanceByYear(acc, data.transactions);
    const upto = rows.filter(r => r.year <= year);
    if (upto.length) return upto[upto.length - 1].closing;
    return acc.openingYear != null && year >= acc.openingYear ? (acc.openingBalance ?? 0) : 0;
  };
  const balanceKeys = useMemo(() => {
    const rowsFor = (type: Account['type']) => data.accounts
      .filter(a => a.isActive && a.type === type &&
        (a.openingBalance != null || data.transactions.some(tx => tx.accountId === a.id)))
      .map(a => ({ acc: a, closing: keyClosing(a) }));
    return { asset: rowsFor('asset'), liability: rowsFor('liability'), equity: rowsFor('equity') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.accounts, data.transactions, year]);
  const hasKeyBalances = balanceKeys.asset.length + balanceKeys.liability.length + balanceKeys.equity.length > 0;

  function handleSaveBs(item: BalanceSheetItem) {
    const exists = bsItems.find(b => b.id === item.id);
    dispatch(exists
      ? { type: 'UPDATE_BS_ITEM', payload: item }
      : { type: 'ADD_BS_ITEM', payload: item }
    );
    setBsModal({ open: false });
  }

  // The exact figures shown on screen, flattened into a two-column statement so
  // the annual accounts can be downloaded as a PDF or attached to an email. Same
  // numbers as the display — no separate calculation.
  function statementExport(): { columns: ExportColumn[]; rows: ExportRow[] } {
    const nm = (i: BalanceSheetItem) => lang === 'is' ? i.name : (i.nameEn || i.name);
    const R = (label: string, amount: number): ExportRow => ({ label, amount: fmtISK(amount) });
    const SEC = (label: string): ExportRow => ({ label: label.toUpperCase(), amount: '' });
    const rows: ExportRow[] = [];
    rows.push(SEC(t('incomeStatement')));
    rows.push(SEC(t('revenues')));
    if (pl.salaTekjur > 0) rows.push(R(t('sala_vara'), pl.salaTekjur));
    if (pl.thjonustutekjur > 0) rows.push(R(t('sala_thjonustu'), pl.thjonustutekjur));
    if (pl.adrarTekjur > 0) rows.push(R(t('adrar_tekjur'), pl.adrarTekjur));
    rows.push(R(t('revenues'), pl.totalRevenue));
    if (pl.laun + pl.launatengd > 0) rows.push(R(t('wagesExpenses'), -(pl.laun + pl.launatengd)));
    if (pl.afskriftir > 0) rows.push(R(t('afskriftir'), -pl.afskriftir));
    const otherOp = pl.husaleiga + pl.simagjold + pl.skrifstofugjold + pl.samgongur + pl.markadsmal + pl.fagthjonusta + pl.vorur + pl.adrir;
    if (otherOp > 0) rows.push(R(t('otherOperating'), -otherOp));
    rows.push(R(t('operatingExpenses'), -pl.totalOperatingExpenses));
    rows.push(R(t('operatingProfit'), pl.operatingProfit));
    if (pl.fjarmagntekjur > 0) rows.push(R(t('fjarmagns_tekjur'), pl.fjarmagntekjur));
    if (pl.fjarmagnsgjold > 0) rows.push(R(t('fjarmagnsgjold'), -pl.fjarmagnsgjold));
    rows.push(R(t('profitBeforeTax'), pl.profitBeforeTax));
    if (pl.incomeTax > 0) rows.push(R(t('incomeTax'), -pl.incomeTax));
    rows.push(R(t('netResult'), pl.netResult));
    rows.push(SEC(t('assets')));
    getSection('fixed_assets').forEach(i => rows.push(R(nm(i), i.amount)));
    rows.push(R(t('fixedAssets'), totalFixedAssets));
    getSection('current_assets').forEach(i => rows.push(R(nm(i), i.amount)));
    rows.push(R(t('currentAssets'), totalCurrentAssets));
    rows.push(R(t('totalAssets'), totalAssets));
    rows.push(SEC(t('equityAndLiabilities')));
    getSection('equity').forEach(i => rows.push(R(nm(i), i.amount)));
    rows.push(R(lang === 'is' ? 'Hagnaður / tap árs' : 'Net result for year', pl.netResult));
    rows.push(R(t('totalEquity'), totalEquity));
    getSection('long_term_liabilities').forEach(i => rows.push(R(nm(i), i.amount)));
    rows.push(R(t('longTermLiabilities'), totalLongTerm));
    getSection('current_liabilities').forEach(i => rows.push(R(nm(i), i.amount)));
    rows.push(R(t('currentLiabilities'), totalCurrentLiab));
    rows.push(R(t('equityAndLiabilities'), totalEquityAndLiab));
    if (hasKeyBalances) {
      rows.push(SEC(lang === 'is' ? `Staða lykla í árslok ${year}` : `Key balances at year-end ${year}`));
      ([['asset', t('assets')], ['liability', lang === 'is' ? 'Skuldir' : 'Liabilities'], ['equity', t('equity')]] as [keyof typeof balanceKeys, string][])
        .forEach(([type, label]) => {
          if (!balanceKeys[type].length) return;
          balanceKeys[type].forEach(({ acc, closing }) => rows.push(R(`  ${acc.number} ${lang === 'is' ? acc.name : (acc.nameEn || acc.name)}`, closing)));
          rows.push(R(`${label} ${lang === 'is' ? 'samtals' : 'total'}`, balanceKeys[type].reduce((s, r) => s + r.closing, 0)));
        });
    }
    return {
      columns: [
        { header: t('description'), key: 'label', width: 120 },
        { header: `${year} (ISK)`, key: 'amount', width: 45 },
      ],
      rows,
    };
  }

  const pdfTitle = company.name || t('annualAccounts');
  const pdfSubtitle = `${t('annualAccounts')} — ${year}${company.kennitala ? ` · ${company.kennitala}` : ''}`;
  const pdfFile = `arsreikningur_${year}.pdf`;

  function downloadAccounts() {
    const { columns, rows } = statementExport();
    exportPDF(pdfTitle, pdfSubtitle, columns, rows, pdfFile);
  }
  async function emailAccounts() {
    const { columns, rows } = statementExport();
    await sharePDF(pdfTitle, pdfSubtitle, columns, rows, pdfFile, {
      emailTo: '',
      subject: `${t('annualAccounts')} ${year} — ${company.name}`,
      body: `${t('annualAccounts')} ${year}`,
    });
  }

  const BSRow = ({ label, amount, bold, indent }: { label: string; amount: number; bold?: boolean; indent?: boolean }) => (
    <tr className={bold ? 'border-t border-gray-300 bg-gray-50' : ''}>
      <td className={`px-4 py-1.5 text-sm ${bold ? 'font-bold' : ''} ${indent ? 'pl-8' : ''}`}>{label}</td>
      <td className={`px-4 py-1.5 text-sm text-right font-mono ${bold ? 'font-bold' : ''}`}>
        {amount !== 0 || bold ? fmtISK(amount) : '—'}
      </td>
    </tr>
  );

  const PLRow = ({ label, amount, bold, indent, isNeg }: { label: string; amount: number; bold?: boolean; indent?: boolean; isNeg?: boolean }) => (
    <tr className={bold ? 'border-t border-gray-300 bg-gray-50' : ''}>
      <td className={`px-4 py-1.5 text-sm ${bold ? 'font-bold' : ''} ${indent ? 'pl-8' : ''}`}>{label}</td>
      <td className={`px-4 py-1.5 text-sm text-right font-mono ${bold ? 'font-bold' : ''}`}>
        {amount !== 0 ? fmtISK(isNeg ? -amount : amount) : '—'}
      </td>
    </tr>
  );

  const tabs = [
    { id: 'income' as const, label: t('incomeStatement') },
    { id: 'balance' as const, label: t('balanceSheet') },
    { id: 'notes' as const, label: t('notes') },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('annualAccounts')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('annualAccountsTitle')}</p>
        </div>
        <div className="flex gap-2 no-print items-center">
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            title={lang === 'is' ? 'Reikningsár' : 'Financial year'}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => setBsModal({ open: true })}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <Plus className="w-4 h-4" />
            {t('addBalanceSheetItem')}
          </button>
          <button
            onClick={downloadAccounts}
            title={lang === 'is' ? 'Sækja PDF' : 'Download PDF'}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{lang === 'is' ? 'Sækja' : 'Download'}</span>
          </button>
          <button
            onClick={emailAccounts}
            title={lang === 'is' ? 'Senda í tölvupósti' : 'Send by email'}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">{lang === 'is' ? 'Senda' : 'Send'}</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Printer className="w-4 h-4" />
            {t('printAccounts')}
          </button>
        </div>
      </div>

      {/* Print header */}
      <div className="print-only text-center mb-6 border-b pb-4">
        <div className="text-xl font-bold">{company.name}</div>
        {company.kennitala && <div className="text-sm text-gray-600">{t('companyKennitala')}: {company.kennitala}</div>}
        {company.address && <div className="text-sm text-gray-600">{company.address}{company.postalCode ? `, ${company.postalCode}` : ''} {company.city}</div>}
        <div className="text-base font-semibold mt-2">{t('annualAccounts')} {t('forYear')} {year}</div>
        <div className="text-xs text-gray-500 mt-1">{t('annualAccountsTitle')}</div>
      </div>

      {/* Company info bar */}
      {company.name && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 mb-5 flex flex-wrap gap-4 text-sm no-print">
          <span className="font-semibold text-blue-900">{company.name}</span>
          {company.kennitala && <span className="text-blue-700">{t('companyKennitala')}: {company.kennitala}</span>}
          {company.vskNumber && <span className="text-blue-700">VSK: {company.vskNumber}</span>}
          <span className="text-blue-700">{t('fiscalYear')}: {year}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-5 no-print">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Income Statement */}
      {(activeTab === 'income' || true) && (
        <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden mb-5 ${activeTab !== 'income' ? 'hidden print-only' : ''}`}>
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-bold text-gray-900">{t('incomeStatement')}</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-xs text-gray-500 font-semibold text-left uppercase">{t('description')}</th>
                <th className="px-4 py-2 text-xs text-gray-500 font-semibold text-right uppercase">{year} (ISK)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              <tr className="bg-blue-50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-blue-700 uppercase">{t('revenues')}</td></tr>
              {pl.salaTekjur > 0 && <PLRow label={t('sala_vara')} amount={pl.salaTekjur} indent />}
              {pl.thjonustutekjur > 0 && <PLRow label={t('sala_thjonustu')} amount={pl.thjonustutekjur} indent />}
              {pl.adrarTekjur > 0 && <PLRow label={t('adrar_tekjur')} amount={pl.adrarTekjur} indent />}
              <PLRow label={t('revenues')} amount={pl.totalRevenue} bold />

              <tr className="bg-blue-50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-blue-700 uppercase">{t('operatingExpenses')}</td></tr>
              {(pl.laun + pl.launatengd) > 0 && <PLRow label={t('wagesExpenses')} amount={pl.laun + pl.launatengd} indent isNeg />}
              {pl.afskriftir > 0 && <PLRow label={t('afskriftir')} amount={pl.afskriftir} indent isNeg />}
              {(pl.husaleiga + pl.simagjold + pl.skrifstofugjold + pl.samgongur + pl.markadsmal + pl.fagthjonusta + pl.vorur + pl.adrir) > 0 && (
                <PLRow label={t('otherOperating')} amount={pl.husaleiga + pl.simagjold + pl.skrifstofugjold + pl.samgongur + pl.markadsmal + pl.fagthjonusta + pl.vorur + pl.adrir} indent isNeg />
              )}
              <PLRow label={t('operatingExpenses')} amount={-pl.totalOperatingExpenses} bold />
              <PLRow label={t('operatingProfit')} amount={pl.operatingProfit} bold />

              {(pl.fjarmagntekjur > 0 || pl.fjarmagnsgjold > 0) && (
                <>
                  <tr className="bg-blue-50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-blue-700 uppercase">{t('financialIncome')} / {t('financialExpenses')}</td></tr>
                  {pl.fjarmagntekjur > 0 && <PLRow label={t('fjarmagns_tekjur')} amount={pl.fjarmagntekjur} indent />}
                  {pl.fjarmagnsgjold > 0 && <PLRow label={t('fjarmagnsgjold')} amount={-pl.fjarmagnsgjold} indent />}
                </>
              )}
              <PLRow label={t('profitBeforeTax')} amount={pl.profitBeforeTax} bold />
              {pl.incomeTax > 0 && <PLRow label={t('incomeTax')} amount={-pl.incomeTax} indent />}
              <PLRow label={t('netResult')} amount={pl.netResult} bold />
            </tbody>
          </table>
        </div>
      )}

      {/* Balance Sheet */}
      {(activeTab === 'balance' || true) && (
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5 ${activeTab !== 'balance' ? 'hidden print-only' : ''}`}>
          {/* Assets */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-bold text-gray-900">{t('assets')}</h2>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-xs text-gray-500 font-semibold text-left uppercase">{t('description')}</th>
                  <th className="px-4 py-2 text-xs text-gray-500 font-semibold text-right uppercase">{year} (ISK)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                <tr className="bg-blue-50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-blue-700 uppercase">{t('fixedAssets')}</td></tr>
                {getSection('fixed_assets').map(item => (
                  <tr key={item.id}>
                    <td className="px-4 py-1.5 text-sm pl-8 flex items-center gap-2">
                      {lang === 'is' ? item.name : (item.nameEn || item.name)}
                      <button onClick={() => setBsModal({ open: true, item })} className="text-gray-300 hover:text-blue-500 no-print"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => setDeleteId(item.id)} className="text-gray-300 hover:text-red-500 no-print"><Trash2 className="w-3 h-3" /></button>
                    </td>
                    <td className="px-4 py-1.5 text-sm text-right font-mono">{fmtISK(item.amount)}</td>
                  </tr>
                ))}
                <BSRow label={t('fixedAssets')} amount={totalFixedAssets} bold />

                <tr className="bg-blue-50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-blue-700 uppercase">{t('currentAssets')}</td></tr>
                {getSection('current_assets').map(item => (
                  <tr key={item.id}>
                    <td className="px-4 py-1.5 text-sm pl-8 flex items-center gap-2">
                      {lang === 'is' ? item.name : (item.nameEn || item.name)}
                      <button onClick={() => setBsModal({ open: true, item })} className="text-gray-300 hover:text-blue-500 no-print"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => setDeleteId(item.id)} className="text-gray-300 hover:text-red-500 no-print"><Trash2 className="w-3 h-3" /></button>
                    </td>
                    <td className="px-4 py-1.5 text-sm text-right font-mono">{fmtISK(item.amount)}</td>
                  </tr>
                ))}
                <BSRow label={t('currentAssets')} amount={totalCurrentAssets} bold />
                <BSRow label={t('totalAssets')} amount={totalAssets} bold />
              </tbody>
            </table>
          </div>

          {/* Equity & Liabilities */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-bold text-gray-900">{t('equityAndLiabilities')}</h2>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-xs text-gray-500 font-semibold text-left uppercase">{t('description')}</th>
                  <th className="px-4 py-2 text-xs text-gray-500 font-semibold text-right uppercase">{year} (ISK)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                <tr className="bg-blue-50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-blue-700 uppercase">{t('equity')}</td></tr>
                {getSection('equity').map(item => (
                  <tr key={item.id}>
                    <td className="px-4 py-1.5 text-sm pl-8 flex items-center gap-2">
                      {lang === 'is' ? item.name : (item.nameEn || item.name)}
                      <button onClick={() => setBsModal({ open: true, item })} className="text-gray-300 hover:text-blue-500 no-print"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => setDeleteId(item.id)} className="text-gray-300 hover:text-red-500 no-print"><Trash2 className="w-3 h-3" /></button>
                    </td>
                    <td className="px-4 py-1.5 text-sm text-right font-mono">{fmtISK(item.amount)}</td>
                  </tr>
                ))}
                <BSRow label={lang === 'is' ? 'HagnaÃ°ur / tap Ã¡rs' : 'Net result for year'} amount={pl.netResult} indent />
                <BSRow label={t('totalEquity')} amount={totalEquity} bold />

                <tr className="bg-blue-50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-blue-700 uppercase">{t('longTermLiabilities')}</td></tr>
                {getSection('long_term_liabilities').map(item => (
                  <tr key={item.id}>
                    <td className="px-4 py-1.5 text-sm pl-8 flex items-center gap-2">
                      {lang === 'is' ? item.name : (item.nameEn || item.name)}
                      <button onClick={() => setBsModal({ open: true, item })} className="text-gray-300 hover:text-blue-500 no-print"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => setDeleteId(item.id)} className="text-gray-300 hover:text-red-500 no-print"><Trash2 className="w-3 h-3" /></button>
                    </td>
                    <td className="px-4 py-1.5 text-sm text-right font-mono">{fmtISK(item.amount)}</td>
                  </tr>
                ))}
                <BSRow label={t('longTermLiabilities')} amount={totalLongTerm} bold />

                <tr className="bg-blue-50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-blue-700 uppercase">{t('currentLiabilities')}</td></tr>
                {getSection('current_liabilities').map(item => (
                  <tr key={item.id}>
                    <td className="px-4 py-1.5 text-sm pl-8 flex items-center gap-2">
                      {lang === 'is' ? item.name : (item.nameEn || item.name)}
                      <button onClick={() => setBsModal({ open: true, item })} className="text-gray-300 hover:text-blue-500 no-print"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => setDeleteId(item.id)} className="text-gray-300 hover:text-red-500 no-print"><Trash2 className="w-3 h-3" /></button>
                    </td>
                    <td className="px-4 py-1.5 text-sm text-right font-mono">{fmtISK(item.amount)}</td>
                  </tr>
                ))}
                <BSRow label={t('currentLiabilities')} amount={totalCurrentLiab} bold />
                <BSRow label={t('totalEquityAndLiabilities')} amount={totalEquityAndLiab} bold />
              </tbody>
            </table>
            {Math.abs(totalAssets - totalEquityAndLiab) > 1 && (
              <div className="px-4 py-2 bg-yellow-50 border-t border-yellow-200 text-xs text-yellow-700">
                âš  {lang === 'is' ? 'Efnahagsreikningur jafnast ekki â€” uppfÃ¦rÃ°u opnunarstÃ¶Ã°ur' : 'Balance sheet does not balance â€” update opening balances'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Carried key balances for the selected year (Bókhaldslyklar) */}
      {hasKeyBalances && (activeTab === 'balance' || true) && (
        <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden mb-5 ${activeTab !== 'balance' ? 'hidden print-only' : ''}`}>
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-bold text-gray-900">{lang === 'is' ? `Staða lykla í árslok ${year}` : `Key balances at year-end ${year}`}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{lang === 'is' ? 'Fluttar milli ára úr Bókhaldslyklum (höfuðstóll lána o.fl.).' : 'Carried forward from Bókhaldslyklar (loan principal, etc.).'}</p>
          </div>
          <table className="w-full">
            <tbody className="divide-y divide-gray-50">
              {([
                ['asset', t('assets')],
                ['liability', lang === 'is' ? 'Skuldir' : 'Liabilities'],
                ['equity', t('equity')],
              ] as [keyof typeof balanceKeys, string][]).map(([type, label]) =>
                balanceKeys[type].length > 0 && (
                  <Fragment key={type}>
                    <tr className="bg-blue-50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-blue-700 uppercase">{label}</td></tr>
                    {balanceKeys[type].map(({ acc, closing }) => (
                      <tr key={acc.id}>
                        <td className="px-4 py-1.5 text-sm pl-8">{acc.number} {lang === 'is' ? acc.name : (acc.nameEn || acc.name)}</td>
                        <td className="px-4 py-1.5 text-sm text-right font-mono">{fmtISK(closing)}</td>
                      </tr>
                    ))}
                    <BSRow label={`${label} ${lang === 'is' ? 'samtals' : 'total'}`} amount={balanceKeys[type].reduce((s, r) => s + r.closing, 0)} bold />
                  </Fragment>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes */}
      {(activeTab === 'notes' || true) && (
        <div className={`bg-white rounded-xl border border-gray-200 p-6 space-y-5 ${activeTab !== 'notes' ? 'hidden print-only' : ''}`}>
          <h2 className="font-bold text-gray-900 text-lg border-b pb-2">{t('notes')}</h2>

          <div>
            <h3 className="font-semibold text-gray-800 mb-1">1. {t('note1Title')}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{t('note1Text')}</p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-800 mb-1">2. {t('note2Title')}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{t('note2Text')}</p>
            {company.vskNumber && (
              <p className="text-sm text-gray-600 mt-1">{t('vatInfo')}: {company.vskNumber}</p>
            )}
          </div>

          <div>
            <h3 className="font-semibold text-gray-800 mb-1">3. {t('note3Title')}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{t('note3Text')}</p>
          </div>

          {/* Signature area */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <div className="border-b border-gray-400 mb-1 pb-8"></div>
                <p className="text-xs text-gray-500">{t('boardSignature')}</p>
              </div>
              <div>
                <div className="border-b border-gray-400 mb-1 pb-8"></div>
                <p className="text-xs text-gray-500">{t('signatureDate')}</p>
              </div>
            </div>
            {company.auditor && (
              <div className="mt-4">
                <p className="text-sm text-gray-600">{t('auditedBy')}: <span className="font-medium">{company.auditor}</span></p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {bsModal.open && (
        <BSModal
          initial={bsModal.item}
          onSave={handleSaveBs}
          onClose={() => setBsModal({ open: false })}
        />
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-base font-semibold text-gray-900 mb-2">{t('warning')}</h3>
            <p className="text-sm text-gray-600 mb-5">{t('confirmDelete')}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">{t('cancel')}</button>
              <button onClick={() => { dispatch({ type: 'DELETE_BS_ITEM', payload: deleteId }); setDeleteId(null); }} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm hover:bg-red-700">{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

