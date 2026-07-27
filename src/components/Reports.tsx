import { useState } from 'react';
import { Printer, Download, FileText, FileSpreadsheet } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { filterByYear, calcProfitLoss } from '../utils/calculations';
import { exportPDF, exportExcel } from '../utils/exports';

export default function Reports({ drill }: { drill?: (category: string, year: number) => void } = {}) {
  const { data, t, lang, fmtISK } = useApp();
  const currentYear = data.settings.fiscalYear;
  const [year, setYear] = useState(currentYear);

  const plCols = [
    { header: lang === 'is' ? 'Lykill' : 'Item', key: 'label', width: 40 },
    { header: `${year} ISK`,                       key: 'value', width: 18 },
  ];

  function getPlRows() {
    return [
      { label: t('sala_vara'),           value: pl.salaTekjur },
      { label: t('sala_thjonustu'),      value: pl.thjonustutekjur },
      { label: t('adrar_tekjur'),        value: pl.adrarTekjur },
      { label: t('revenues'),            value: pl.totalRevenue },
      { label: t('laun'),                value: -pl.laun },
      { label: t('launatengd_gjold'),    value: -pl.launatengd },
      { label: t('husaleiga'),           value: -pl.husaleiga },
      { label: t('rafmagn_hiti'),        value: -pl.rafmagnHiti },
      { label: t('simagjold'),           value: -pl.simagjold },
      { label: t('skrifstofugjold'),     value: -pl.skrifstofugjold },
      { label: t('samgongur'),           value: -pl.samgongur },
      { label: t('markadsmal'),          value: -pl.markadsmal },
      { label: t('fagthjonusta'),        value: -pl.fagthjonusta },
      { label: t('vorur'),               value: -pl.vorur },
      { label: t('afskriftir'),          value: -pl.afskriftir },
      { label: t('adrir_rekstrargjold'), value: -pl.adrir },
      { label: t('operatingExpenses'),   value: -pl.totalOperatingExpenses },
      { label: t('operatingProfit'),     value: pl.operatingProfit },
      { label: t('fjarmagns_tekjur'),    value: pl.fjarmagntekjur },
      { label: t('fjarmagnsgjold'),      value: -pl.fjarmagnsgjold },
      { label: t('profitBeforeTax'),     value: pl.profitBeforeTax },
      { label: t('incomeTax'),           value: -pl.incomeTax },
      { label: t('netResult'),           value: pl.netResult },
    ];
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
    const rows: (string | number)[][] = [
      [t('sala_vara'),             pl.salaTekjur],
      [t('sala_thjonustu'),        pl.thjonustutekjur],
      [t('adrar_tekjur'),          pl.adrarTekjur],
      [t('revenues'),              pl.totalRevenue],
      [t('laun'),                  -pl.laun],
      [t('launatengd_gjold'),      -pl.launatengd],
      [t('husaleiga'),             -pl.husaleiga],
      [t('rafmagn_hiti'),          -pl.rafmagnHiti],
      [t('simagjold'),             -pl.simagjold],
      [t('skrifstofugjold'),       -pl.skrifstofugjold],
      [t('samgongur'),             -pl.samgongur],
      [t('markadsmal'),            -pl.markadsmal],
      [t('fagthjonusta'),          -pl.fagthjonusta],
      [t('vorur'),                 -pl.vorur],
      [t('afskriftir'),            -pl.afskriftir],
      [t('adrir_rekstrargjold'),   -pl.adrir],
      [t('operatingExpenses'),     -pl.totalOperatingExpenses],
      [t('operatingProfit'),       pl.operatingProfit],
      [t('fjarmagns_tekjur'),      pl.fjarmagntekjur],
      [t('fjarmagnsgjold'),        -pl.fjarmagnsgjold],
      [t('profitBeforeTax'),       pl.profitBeforeTax],
      [t('incomeTax'),             -pl.incomeTax],
      [t('netResult'),             pl.netResult],
    ];
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `rekstrarreikningur_${year}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const years = Array.from(
    new Set(data.transactions.map(tx => new Date(tx.date).getFullYear()))
  ).sort((a, b) => b - a);
  if (!years.includes(currentYear)) years.unshift(currentYear);

  const txs = filterByYear(data.transactions, year);
  const pl = calcProfitLoss(txs, data.settings.corporateTaxRate, data.settings.pricesIncludeVAT);

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
            <Row label={t('sala_thjonustu')} amount={pl.thjonustutekjur} indent catKey="sala_thjonustu" />
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
