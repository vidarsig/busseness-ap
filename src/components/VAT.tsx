import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import {
  calcVATSummary,
  filterByYear, filterByMonth, filterByQuarter,
} from '../utils/calculations';

type PeriodType = 'year' | 'quarter' | 'month';

export default function VAT() {
  const { data, t, fmtISK } = useApp();
  const year = data.settings.fiscalYear;

  const [periodType, setPeriodType] = useState<PeriodType>('year');
  const [quarter, setQuarter] = useState(1);
  const [month, setMonth] = useState(1);

  const months = [
    t('january'), t('february'), t('march'), t('april'),
    t('may'), t('june'), t('july'), t('august'),
    t('september'), t('october'), t('november'), t('december'),
  ];

  let filtered = data.transactions;
  if (periodType === 'year') filtered = filterByYear(filtered, year);
  else if (periodType === 'quarter') filtered = filterByQuarter(filtered, year, quarter);
  else filtered = filterByMonth(filtered, year, month);

  const vat = calcVATSummary(filtered);

  const SectionTable = ({
    title, rows, total, color,
  }: {
    title: string;
    rows: { rate: number; baseAmount: number; vatAmount: number; totalAmount: number }[];
    total: number;
    color: string;
  }) => (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className={`px-5 py-3 border-b border-gray-100 ${color}`}>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-left">VSK%</th>
            <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">{t('baseAmount')}</th>
            <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">{t('vatAmountCol')}</th>
            <th className="px-4 py-2 text-xs font-semibold text-gray-500 text-right">{t('totalWithVAT')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.filter(r => r.baseAmount > 0 || r.vatAmount > 0).map(row => (
            <tr key={row.rate}>
              <td className="px-4 py-2.5 text-sm font-medium text-gray-700">{row.rate}%</td>
              <td className="px-4 py-2.5 text-sm text-right font-mono">{fmtISK(row.baseAmount)}</td>
              <td className="px-4 py-2.5 text-sm text-right font-mono font-semibold">{fmtISK(row.vatAmount)}</td>
              <td className="px-4 py-2.5 text-sm text-right font-mono">{fmtISK(row.totalAmount)}</td>
            </tr>
          ))}
          {rows.every(r => r.baseAmount === 0 && r.vatAmount === 0) && (
            <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">{t('noTransactions')}</td></tr>
          )}
        </tbody>
        <tfoot className="border-t-2 border-gray-200 bg-gray-50">
          <tr>
            <td className="px-4 py-2.5 text-sm font-bold text-gray-900">{t('total')}</td>
            <td className="px-4 py-2.5 text-sm text-right font-mono font-bold">
              {fmtISK(rows.reduce((s, r) => s + r.baseAmount, 0))}
            </td>
            <td className="px-4 py-2.5 text-sm text-right font-mono font-bold">
              {fmtISK(total)}
            </td>
            <td className="px-4 py-2.5 text-sm text-right font-mono font-bold">
              {fmtISK(rows.reduce((s, r) => s + r.totalAmount, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const isOwed = vat.netVAT > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">{t('vatSummary')}</h1>
        {data.settings.company.vskNumber && (
          <div className="text-sm text-gray-500">
            {t('vatInfo')}: <span className="font-semibold text-gray-700">{data.settings.company.vskNumber}</span>
          </div>
        )}
      </div>

      {/* Period selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['year', 'quarter', 'month'] as PeriodType[]).map(pt => (
            <button
              key={pt}
              onClick={() => setPeriodType(pt)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                periodType === pt ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t(pt)}
            </button>
          ))}
        </div>
        {periodType === 'quarter' && (
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={quarter}
            onChange={e => setQuarter(parseInt(e.target.value))}
          >
            {[1,2,3,4].map(q => <option key={q} value={q}>{t(`q${q}` as never)}</option>)}
          </select>
        )}
        {periodType === 'month' && (
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={month}
            onChange={e => setMonth(parseInt(e.target.value))}
          >
            {months.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        )}
      </div>

      {/* Net VAT card */}
      <div className={`rounded-xl border p-5 mb-5 ${
        isOwed ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'
      }`}>
        <div className="text-sm font-medium text-gray-600 mb-1">
          {isOwed ? t('toPayRSK') : t('refundFromRSK')}
        </div>
        <div className={`text-3xl font-bold ${isOwed ? 'text-orange-600' : 'text-green-600'}`}>
          {fmtISK(Math.abs(vat.netVAT))}
        </div>
        <div className="mt-3 flex gap-6 text-sm text-gray-500">
          <span>{t('outputVAT')}: <span className="font-semibold text-gray-700">{fmtISK(vat.totalOutput)}</span></span>
          <span>{t('inputVAT')}: <span className="font-semibold text-gray-700">{fmtISK(vat.totalInput)}</span></span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionTable
          title={t('outputVAT')}
          rows={vat.outputByRate}
          total={vat.totalOutput}
          color="text-green-700"
        />
        <SectionTable
          title={t('inputVAT')}
          rows={vat.inputByRate}
          total={vat.totalInput}
          color="text-blue-700"
        />
      </div>
    </div>
  );
}
