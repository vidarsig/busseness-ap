import { useMemo, useState } from 'react';
import { Printer, Download, FileText, FileSpreadsheet } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { filterByYear, calcProfitLoss, yearOf, getTransactionISK } from '../utils/calculations';
import { exportPDF, exportExcel } from '../utils/exports';

export default function Reports({ drill }: { drill?: (category: string, year: number) => void } = {}) {
  const { data, t, lang, fmtISK } = useApp();
  const currentYear = data.settings.fiscalYear;
  const [year, setYear] = useState(currentYear);

  const plCols = [
    { header: lang === 'is' ? 'Lykill' : 'Item', key: 'label', width: 40 },
    // 18mm could not hold a grouped million-króna figure at 8pt, so it wrapped.
    { header: `${year} ISK`,                       key: 'value', width: 32 },
  ];

  // The exported rows must be the rows the screen shows. They were not: every
  // expense line printed even when it was empty, and printed as "-0" — the screen
  // hides those. And the raw values carry decimals the screen rounds away, so the
  // PDF said 10.445.479,84 where the screen said 10.445.480. Round once, drop the
  // empty detail lines, and the paper matches the app.
  function getPlRows() {
    const k = (n: number) => Math.round(n);
    const rows: { label: string; value: number }[] = [];
    const push = (label: string, value: number) => rows.push({ label, value: k(value) });
    const pushIf = (cond: boolean, label: string, value: number) => { if (cond) push(label, value); };

    pushIf(pl.salaTekjur !== 0, t('sala_vara'), pl.salaTekjur);
    svcByKey.forEach(r => push(r.label, r.amount));
    pushIf(salaThjonustuRest !== 0, t('sala_thjonustu'), salaThjonustuRest);
    pushIf(pl.adrarTekjur !== 0, t('adrar_tekjur'), pl.adrarTekjur);
    push(t('revenues'), pl.totalRevenue);

    pushIf(pl.laun > 0,            t('laun'),              -pl.laun);
    pushIf(pl.launatengd > 0,      t('launatengd_gjold'),  -pl.launatengd);
    pushIf(pl.husaleiga > 0,       t('husaleiga'),         -pl.husaleiga);
    pushIf(pl.rafmagnHiti > 0,     t('rafmagn_hiti'),      -pl.rafmagnHiti);
    pushIf(pl.simagjold > 0,       t('simagjold'),         -pl.simagjold);
    pushIf(pl.skrifstofugjold > 0, t('skrifstofugjold'),   -pl.skrifstofugjold);
    pushIf(pl.samgongur > 0,       t('samgongur'),         -pl.samgongur);
    pushIf(pl.markadsmal > 0,      t('markadsmal'),        -pl.markadsmal);
    pushIf(pl.fagthjonusta > 0,    t('fagthjonusta'),      -pl.fagthjonusta);
    pushIf(pl.vorur !== 0,         t('vorur'),             -pl.vorur);
    pushIf(pl.afskriftir > 0,      t('afskriftir'),        -pl.afskriftir);
    pushIf(pl.adrir > 0,           t('adrir_rekstrargjold'), -pl.adrir);
    push(t('operatingExpenses'), -pl.totalOperatingExpenses);
    push(t('operatingProfit'),   pl.operatingProfit);

    pushIf(pl.fjarmagntekjur > 0,  t('fjarmagns_tekjur'),  pl.fjarmagntekjur);
    pushIf(pl.fjarmagnsgjold > 0,  t('fjarmagnsgjold'),    -pl.fjarmagnsgjold);
    push(t('profitBeforeTax'), pl.profitBeforeTax);
    pushIf(pl.incomeTax > 0, t('incomeTax'), -pl.incomeTax);
    push(t('netResult'), pl.netResult);
    return rows;
  }

  function exportToPDF() {
    exportPDF(`${t('profitLoss')} ${year}`, data.settings.company.name || '', plCols, getPlRows(), `rekstrarreikningur_${year}.pdf`);
  }
  function exportToExcel() {
    exportExcel([{ name: t('profitLoss').slice(0, 31), columns: plCols, rows: getPlRows() }],
      `rekstrarreikningur_${year}.xlsx`);
  }

  function exportCSV() {
    const header = [lang === 'is' ? 'Lykill' : 'Item', `${year} ISK`];
    const rows: (string | number)[][] = getPlRows().map(r => [r.label, r.value]);
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `rekstrarreikningur_${year}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const years = Array.from(
    new Set(data.transactions.map(tx => yearOf(tx.date)))
  ).sort((a, b) => b - a);
  if (!years.includes(currentYear)) years.unshift(currentYear);

  const txs = filterByYear(data.transactions, year);
  const pl = calcProfitLoss(txs, data.settings.corporateTaxRate, data.settings.pricesIncludeVAT);

  // "SALA ÞJÓNUSTU" IS NOT ONE THING ON A MIXED COMPANY. Letting residential property
  // is VAT-exempt and insurance compensation is not turnover at all, yet both are booked
  // under the sala_thjonustu CATEGORY and were printed as a single line — on this
  // company's own 2026 that hid 3.840.252 of rent and 24.291.914 of tryggingabætur
  // inside 28.187.299 of "services", which is precisely the split that decides what
  // input VAT is reclaimable. The category cannot tell them apart; the KEY can, so any
  // revenue key the user made of their own gets its own line and comes off the services
  // total. Same rule AnnualAccounts already applies — Reports was the one still lumping.
  const STD_REVENUE_KEYS = ['ac3000', 'ac3100', 'ac3200', 'ac3900'];
  const svcByKey = useMemo(() => {
    const revAccounts = (data.accounts ?? []).filter(
      a => a.type === 'revenue' && !STD_REVENUE_KEYS.includes(a.id));
    const sums = new Map<string, number>();
    for (const tx of txs) {
      if (tx.type !== 'income' || tx.category !== 'sala_thjonustu' || !tx.accountId) continue;
      if (!revAccounts.some(a => a.id === tx.accountId)) continue;
      sums.set(tx.accountId, (sums.get(tx.accountId) ?? 0) + getTransactionISK(tx));
    }
    return revAccounts
      .filter(a => (sums.get(a.id) ?? 0) !== 0)
      .map(a => ({ label: (lang === 'is' ? a.name : (a.nameEn || a.name)), amount: sums.get(a.id) as number }));
  }, [txs, data.accounts, lang]);
  const svcOnKeys = svcByKey.reduce((s2, r) => s2 + r.amount, 0);
  const salaThjonustuRest = pl.thjonustutekjur - svcOnKeys;

  const Row = ({ label, amount, bold, indent, isNegative, catKey }: {
    label: string; amount: number; bold?: boolean; indent?: boolean; isNegative?: boolean; catKey?: string;
  }) => (
    <tr className={bold ? 'border-t-2 border-gray-300 bg-gray-50' : ''}>
      <td className={`px-5 py-2 text-sm ${bold ? 'font-bold text-gray-900' : 'text-gray-700'} ${indent ? 'pl-10' : ''}`}>
        {catKey && drill
          ? <button onClick={() => drill(catKey, year)}
              className="text-blue-600 hover:underline no-print text-left"
              title={lang === 'is' ? 'Skoða/laga færslur þessa lykils' : 'View/fix this key’s transactions'}>
              {label}
            </button>
          : label}
      </td>
      <td className={`px-5 py-2 text-sm text-right font-mono ${bold ? 'font-bold' : ''} ${
        amount < 0 ? 'text-red-600' : isNegative ? 'text-gray-700' : 'text-gray-700'
      }`}>
        {amount !== 0 ? fmtISK(isNegative ? -amount : amount) : '—'}
      </td>
    </tr>
  );

  const SectionHeader = ({ label }: { label: string }) => (
    <tr className="bg-blue-50">
      <td colSpan={2} className="px-5 py-2 text-xs font-bold text-blue-700 uppercase tracking-wide">
        {label}
      </td>
    </tr>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">{t('profitLoss')}</h1>
        <div className="flex gap-2">
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={exportToPDF}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 no-print">
            <FileText className="w-4 h-4" />PDF
          </button>
          <button onClick={exportToExcel}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 no-print">
            <FileSpreadsheet className="w-4 h-4" />Excel
          </button>
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 no-print">
            <Download className="w-4 h-4" />CSV
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 no-print"
          >
            <Printer className="w-4 h-4" />
            {t('printReport')}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden print-container">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 text-center print-only">
          <div className="text-lg font-bold">{data.settings.company.name}</div>
          <div className="text-sm text-gray-500">{t('profitLoss')} {year}</div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 no-print">
          <span className="text-sm font-semibold text-gray-700">{data.settings.company.name || t('profitLoss')}</span>
          <span className="text-sm text-gray-500">{t('fiscalYear')}: {year}</span>
        </div>

        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-5 py-2 text-xs font-semibold text-gray-500 text-left uppercase tracking-wide">
                {t('description')}
              </th>
              <th className="px-5 py-2 text-xs font-semibold text-gray-500 text-right uppercase tracking-wide">
                {year} (ISK)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            <SectionHeader label={t('revenues')} />
            <Row label={t('sala_vara')} amount={pl.salaTekjur} indent catKey="sala_vara" />
            {svcByKey.map(r => <Row key={r.label} label={r.label} amount={r.amount} indent />)}
            <Row label={t('sala_thjonustu')} amount={salaThjonustuRest} indent catKey="sala_thjonustu" />
            <Row label={t('adrar_tekjur')} amount={pl.adrarTekjur} indent catKey="adrar_tekjur" />
            <Row label={t('revenues')} amount={pl.totalRevenue} bold />

            <SectionHeader label={t('operatingExpenses')} />
            {pl.laun > 0 && <Row label={t('laun')} amount={pl.laun} indent isNegative catKey="laun" />}
            {pl.launatengd > 0 && <Row label={t('launatengd_gjold')} amount={pl.launatengd} indent isNegative catKey="launatengd_gjold" />}
            {pl.husaleiga > 0 && <Row label={t('husaleiga')} amount={pl.husaleiga} indent isNegative catKey="husaleiga" />}
            {pl.rafmagnHiti > 0 && <Row label={t('rafmagn_hiti')} amount={pl.rafmagnHiti} indent isNegative catKey="rafmagn_hiti" />}
            {pl.simagjold > 0 && <Row label={t('simagjold')} amount={pl.simagjold} indent isNegative catKey="simagjold" />}
            {pl.skrifstofugjold > 0 && <Row label={t('skrifstofugjold')} amount={pl.skrifstofugjold} indent isNegative catKey="skrifstofugjold" />}
            {pl.samgongur > 0 && <Row label={t('samgongur')} amount={pl.samgongur} indent isNegative catKey="samgongur" />}
            {pl.markadsmal > 0 && <Row label={t('markadsmal')} amount={pl.markadsmal} indent isNegative catKey="markadsmal" />}
            {pl.fagthjonusta > 0 && <Row label={t('fagthjonusta')} amount={pl.fagthjonusta} indent isNegative catKey="fagthjonusta" />}
            {pl.vorur > 0 && <Row label={t('vorur')} amount={pl.vorur} indent isNegative catKey="vorur" />}
            {pl.afskriftir > 0 && <Row label={t('afskriftir')} amount={pl.afskriftir} indent isNegative catKey="afskriftir" />}
            {pl.adrir > 0 && <Row label={t('adrir_rekstrargjold')} amount={pl.adrir} indent isNegative catKey="adrir_rekstrargjold" />}
            <Row label={t('operatingExpenses')} amount={-pl.totalOperatingExpenses} bold />

            <Row label={t('operatingProfit')} amount={pl.operatingProfit} bold />

            <SectionHeader label={t('financialExpenses')} />
            {pl.fjarmagntekjur > 0 && <Row label={t('fjarmagns_tekjur')} amount={pl.fjarmagntekjur} indent catKey="fjarmagns_tekjur" />}
            {pl.fjarmagnsgjold > 0 && <Row label={t('fjarmagnsgjold')} amount={-pl.fjarmagnsgjold} indent catKey="fjarmagnsgjold" />}

            <Row label={t('profitBeforeTax')} amount={pl.profitBeforeTax} bold />
            {pl.incomeTax > 0 && <Row label={t('incomeTax')} amount={-pl.incomeTax} indent />}
            <Row label={t('netResult')} amount={pl.netResult} bold />
          </tbody>
        </table>

        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-500">{lang === 'is' ? 'Upphæðir í íslenskum krónum (ISK)' : 'Amounts in Icelandic krónur (ISK)'}</span>
            <div className={`text-base font-bold ${pl.netResult >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {t('netResult')}: {fmtISK(pl.netResult)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
