import { useState, useMemo } from 'react';
import { Printer, Download, FileText, FileSpreadsheet } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { calcVATSummary, filterByMonth } from '../utils/calculations';
import { exportPDF, exportExcel } from '../utils/exports';

const PERIOD_MONTHS: Record<number, number[]> = {
  1: [1, 2], 2: [3, 4], 3: [5, 6], 4: [7, 8], 5: [9, 10], 6: [11, 12],
};

export default function VATReturn() {
  const { data, t, lang, cc, fmtISK } = useApp();
  const [year, setYear] = useState(data.settings.fiscalYear);
  const [period, setPeriod] = useState<number>(() => Math.ceil(new Date().getMonth() / 2) || 1);

  const months = PERIOD_MONTHS[period] ?? [1, 2];
  const periodTx = useMemo(() =>
    months.flatMap(m => filterByMonth(data.transactions, year, m)),
    [data.transactions, year, period]);

  const vat = useMemo(() => calcVATSummary(periodTx, cc.vatRates), [periodTx, cc.vatRates]);
  const fmt = (n: number) => fmtISK(n);

  const years = Array.from(new Set([year - 1, year, year + 1,
    ...data.transactions.map(tx => new Date(tx.date).getFullYear())])).sort((a, b) => b - a);

  const periodLabel = (p: number) => {
    const ms = PERIOD_MONTHS[p];
    const names: Record<string, string[]> = {
      is: ['Jan','Feb','Mar','Apr','Maí','Jún','Júl','Ágú','Sep','Okt','Nóv','Des'],
      en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    };
    const n = names[lang];
    return `${n[ms[0]-1]}–${n[ms[1]-1]}`;
  };

  const vatTerm = cc.vatTerm;
  const vatCols = [
    { header: lang === 'is' ? 'Lykill' : 'Field',        key: 'field', width: 8  },
    { header: lang === 'is' ? 'Lýsing' : 'Description',  key: 'label', width: 46 },
    { header: lang === 'is' ? 'Upphæð' : 'Amount', key: 'value', width: 18 },
  ];
  const outputRateRows = vat.outputByRate.flatMap((row, idx) => [
    { field: String(idx * 2 + 1),  label: `${lang === 'is' ? 'Skattskyld velta' : 'Taxable turnover'} ${row.rate}%`, value: row.baseAmount },
    { field: `${idx * 2 + 1}a`, label: `${vatTerm} ${lang === 'is' ? 'af línu' : 'on line'} ${idx * 2 + 1} (${row.rate}%)`, value: row.vatAmount },
  ]);
  const inputRateRows = vat.inputByRate.flatMap((row, idx) => [
    { field: String(outputRateRows.length + idx * 2 + 1),  label: `${lang === 'is' ? 'Skattskyld innkaup' : 'Taxable purchases'} ${row.rate}%`, value: row.baseAmount },
    { field: `${outputRateRows.length + idx * 2 + 1}a`, label: `${vatTerm} ${lang === 'is' ? 'af línu' : 'on line'} ${outputRateRows.length + idx * 2 + 1} (${row.rate}%)`, value: row.vatAmount },
  ]);
  const netField = String(outputRateRows.length + inputRateRows.length + 1);
  const vatRows = [
    ...outputRateRows,
    { field: '',   label: lang === 'is' ? 'Samtals útskattr' : `Total output ${vatTerm}`, value: vat.totalOutput },
    ...inputRateRows,
    { field: '',   label: lang === 'is' ? 'Samtals innskattr' : `Total input ${vatTerm}`, value: vat.totalInput },
    { field: vat.netVAT >= 0 ? netField : String(parseInt(netField) + 1),
      label: lang === 'is' ? (vat.netVAT >= 0 ? `${vatTerm} til greiðslu` : `${vatTerm} til endurgreiðslu`) : (vat.netVAT >= 0 ? `${vatTerm} to pay` : `${vatTerm} refund`),
      value: Math.abs(vat.netVAT) },
  ];
  const vatTitle = `${vatTerm} ${lang === 'is' ? 'skýrsla' : 'Return'} — ${year} · ${period}. ${lang === 'is' ? 'tímabil' : 'period'} (${periodLabel(period)})`;

  function exportToPDF() {
    exportPDF(vatTitle, data.settings.company.name || '', vatCols, vatRows, `vsk_${year}_${period}.pdf`);
  }
  function exportToExcel() {
    exportExcel([{ name: lang === 'is' ? 'VSK-skýrsla' : 'VAT Return', columns: vatCols, rows: vatRows }],
      `vsk_${year}_${period}.xlsx`);
  }

  function exportCSV() {
    const label = lang === 'is' ? 'Lykill' : 'Field';
    const header = [label, lang === 'is' ? 'Lýsing' : 'Description', lang === 'is' ? 'Upphæð' : 'Amount'];
    const rows = vatRows.map(r => [r.field, r.label, r.value]);
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `vsk_${year}_${period}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const field = (num: string | null, label: string, value: number, highlight = false) => (
    <div className={`flex items-center gap-4 py-2.5 px-4 border-b border-gray-100 ${highlight ? 'bg-blue-50' : ''}`}>
      {num && <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 text-xs font-bold flex items-center justify-center flex-shrink-0">{num}</span>}
      {!num && <span className="w-8 flex-shrink-0" />}
      <span className="flex-1 text-sm text-gray-700">{label}</span>
      <span className={`font-mono text-sm font-semibold ${highlight ? 'text-blue-900 text-base' : 'text-gray-800'}`}>{fmt(Math.abs(value))}</span>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('vatreturn')}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{lang === 'is' ? `${vatTerm}-skýrsla til ${cc.taxAuthority}` : `${vatTerm} return for ${cc.taxAuthority}`}</p>
        </div>
        <div className="flex gap-2 no-print">
          <button onClick={exportToPDF}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            <FileText className="w-4 h-4" /><span className="hidden sm:inline">PDF</span>
          </button>
          <button onClick={exportToExcel}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            <FileSpreadsheet className="w-4 h-4" /><span className="hidden sm:inline">Excel</span>
          </button>
          <button onClick={exportCSV}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Download className="w-4 h-4" /><span className="hidden sm:inline">CSV</span>
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">{lang === 'is' ? 'Prenta' : 'Print'}</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 flex flex-wrap items-center gap-3 no-print">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600">{lang === 'is' ? 'Ár' : 'Year'}:</label>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={year} onChange={e => setYear(parseInt(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600">{lang === 'is' ? 'Tímabil' : 'Period'}:</label>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={period} onChange={e => setPeriod(parseInt(e.target.value))}>
            {[1,2,3,4,5,6].map(p => <option key={p} value={p}>{p}. {lang === 'is' ? 'tímabil' : 'period'} ({periodLabel(p)})</option>)}
          </select>
        </div>
      </div>

      {/* Print header */}
      <div className="print-only mb-6">
        <h2 className="text-xl font-bold">VSK-skýrsla / VAT Return</h2>
        <p className="text-sm">{data.settings.company.name} — {data.settings.company.kennitala}</p>
        <p className="text-sm">{year} — {period}. {lang === 'is' ? 'tímabil' : 'period'} ({periodLabel(period)})</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">
            {data.settings.company.name || (lang === 'is' ? 'Fyrirtæki' : 'Company')}
            {data.settings.company.vskNumber && <span className="ml-2 text-sm font-normal text-gray-500">{cc.vatNumberLabel}: {data.settings.company.vskNumber}</span>}
          </h2>
          <p className="text-xs text-gray-500">{year} — {period}. {lang === 'is' ? 'tímabil' : 'period'} · {periodLabel(period)}</p>
        </div>

        <div className="px-4 py-2 bg-green-50 border-b border-green-100">
          <p className="text-xs font-bold text-green-700 uppercase">{lang === 'is' ? `Útskattr — ${vatTerm} á sölu` : `Output ${vatTerm} — ${vatTerm} on sales`}</p>
        </div>
        {vat.outputByRate.map((row, idx) => (
          <div key={row.rate}>
            {field(String(idx * 2 + 1), `${lang === 'is' ? 'Skattskyld velta' : 'Taxable turnover'} ${row.rate}%`, row.baseAmount)}
            {field(`${idx * 2 + 1}a`, `${vatTerm} ${row.rate}%`, row.vatAmount)}
          </div>
        ))}
        {field(null, lang === 'is' ? 'Samtals útskattr' : `Total output ${vatTerm}`, vat.totalOutput)}

        <div className="px-4 py-2 bg-red-50 border-b border-red-100 border-t border-gray-100">
          <p className="text-xs font-bold text-red-700 uppercase">{lang === 'is' ? `Innskattr — ${vatTerm} á kaupum` : `Input ${vatTerm} — ${vatTerm} on purchases`}</p>
        </div>
        {vat.inputByRate.map((row, idx) => (
          <div key={row.rate}>
            {field(String(outputRateRows.length + idx * 2 + 1), `${lang === 'is' ? 'Skattskyld innkaup' : 'Taxable purchases'} ${row.rate}%`, row.baseAmount)}
            {field(`${outputRateRows.length + idx * 2 + 1}a`, `${vatTerm} ${row.rate}%`, row.vatAmount)}
          </div>
        ))}
        {field(null, lang === 'is' ? 'Samtals innskattr' : `Total input ${vatTerm}`, vat.totalInput)}

        <div className="border-t-2 border-blue-200">
          {vat.netVAT >= 0
            ? field(netField, lang === 'is' ? `${vatTerm} til greiðslu (útskattr − innskattr)` : `${vatTerm} to pay (output − input)`, vat.netVAT, true)
            : field(String(parseInt(netField) + 1), lang === 'is' ? `${vatTerm} til endurgreiðslu (innskattr > útskattr)` : `${vatTerm} refund (input > output)`, Math.abs(vat.netVAT), true)
          }
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: lang === 'is' ? 'Útskattr' : `Output ${vatTerm}`, value: vat.totalOutput, color: 'green' },
          { label: lang === 'is' ? 'Innskattr' : `Input ${vatTerm}`, value: vat.totalInput, color: 'red' },
          { label: lang === 'is' ? vat.netVAT >= 0 ? 'Til greiðslu' : 'Til endurgreiðslu' : vat.netVAT >= 0 ? 'To pay' : 'Refund', value: Math.abs(vat.netVAT), color: vat.netVAT >= 0 ? 'orange' : 'blue' },
          { label: lang === 'is' ? 'Fjöldi færslna' : 'Transactions', value: periodTx.length, color: 'gray', isCount: true },
        ].map(({ label, value, color, isCount }) => (
          <div key={label} className={`bg-white rounded-xl border border-${color}-200 p-3`}>
            <p className={`text-xs text-${color}-600 font-medium`}>{label}</p>
            <p className={`text-lg font-bold font-mono text-${color}-700 mt-0.5`}>
              {isCount ? value : fmt(value)}
            </p>
          </div>
        ))}
      </div>

      {periodTx.length === 0 && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          {lang === 'is' ? 'Engar færslur fundust á þessu tímabili.' : 'No transactions found for this period.'}
        </div>
      )}
    </div>
  );
}
