import { useState, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { BudgetLine, INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../types';
import { filterByYear, getTransactionISK, yearOf, monthOf } from '../utils/calculations';

const MONTHS = ['jan','feb','mar','apr','may_short','jun','jul','aug','sep','oct','nov','dec'] as const;

export default function Budget() {
  const { data, dispatch, t, lang } = useApp();
  const [year, setYear] = useState(data.settings.fiscalYear);
  const [editCell, setEditCell] = useState<{ category: string; type: 'income'|'expense'; monthIdx: number } | null>(null);
  const [editValue, setEditValue] = useState('');

  const categories = [
    ...INCOME_CATEGORIES.map(c => ({ c, type: 'income' as const })),
    ...EXPENSE_CATEGORIES.map(c => ({ c, type: 'expense' as const })),
  ];

  const yearlyTx = filterByYear(data.transactions, year);

  // Actual by category & month
  const actual = useMemo(() => {
    const m: Record<string, number[]> = {};
    categories.forEach(({ c }) => { m[c] = Array(12).fill(0); });
    yearlyTx.forEach(tx => {
      const mo = monthOf(tx.date) - 1;
      if (m[tx.category] !== undefined) m[tx.category][mo] += getTransactionISK(tx);
    });
    return m;
  }, [yearlyTx]);

  function getBudget(category: string, type: 'income'|'expense'): BudgetLine {
    const id = `${year}_${category}`;
    return data.budgetLines.find(b => b.id === id) ?? {
      id, year, category, type, amounts: Array(12).fill(0),
    };
  }

  function setMonth(category: string, type: 'income'|'expense', monthIdx: number, value: number) {
    const bl = getBudget(category, type);
    const amounts = [...bl.amounts];
    amounts[monthIdx] = value;
    dispatch({ type: 'UPSERT_BUDGET_LINE', payload: { ...bl, amounts } });
  }

  const years = Array.from(new Set([
    year - 1, year, year + 1,
    ...data.transactions.map(tx => yearOf(tx.date)),
  ])).sort((a, b) => b - a);

  const inp = 'w-full border border-blue-300 rounded px-1.5 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500';

  const Cell = ({ category, type, monthIdx }: { category: string; type: 'income'|'expense'; monthIdx: number }) => {
    const budget = getBudget(category, type).amounts[monthIdx];
    const act = actual[category]?.[monthIdx] ?? 0;
    const isEditing = editCell?.category === category && editCell.monthIdx === monthIdx;
    const variance = act - budget;

    if (isEditing) {
      return (
        <td className="p-0.5">
          <input
            autoFocus
            type="number"
            className={inp}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => { setMonth(category, type, monthIdx, parseFloat(editValue) || 0); setEditCell(null); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { setMonth(category, type, monthIdx, parseFloat(editValue) || 0); setEditCell(null); } }}
          />
        </td>
      );
    }

    return (
      <td
        className="px-1 py-1.5 text-right cursor-pointer hover:bg-blue-50 group text-xs"
        onClick={() => { setEditCell({ category, type, monthIdx }); setEditValue(String(budget || '')); }}
      >
        <div className={budget ? 'font-medium text-gray-700' : 'text-gray-300 group-hover:text-gray-400'}>
          {budget ? Math.round(budget / 1000) + 'k' : '—'}
        </div>
        {act > 0 && (
          <div className={`text-[9px] ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {act > 0 ? Math.round(act / 1000) + 'k' : ''}
          </div>
        )}
      </td>
    );
  };

  const totals = useMemo(() => {
    const incBudget = Array(12).fill(0);
    const expBudget = Array(12).fill(0);
    const incActual = Array(12).fill(0);
    const expActual = Array(12).fill(0);
    INCOME_CATEGORIES.forEach(c => {
      const bl = getBudget(c, 'income');
      bl.amounts.forEach((v, i) => { incBudget[i] += v; });
      (actual[c] ?? []).forEach((v: number, i: number) => { incActual[i] += v; });
    });
    EXPENSE_CATEGORIES.forEach(c => {
      const bl = getBudget(c, 'expense');
      bl.amounts.forEach((v, i) => { expBudget[i] += v; });
      (actual[c] ?? []).forEach((v: number, i: number) => { expActual[i] += v; });
    });
    return { incBudget, expBudget, incActual, expActual };
  }, [data.budgetLines, actual]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('budgetPlan')}</h1>
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={year} onChange={e => setYear(parseInt(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 mb-4 text-xs text-blue-700">
        {lang === 'is'
          ? 'Smelltu á reit til að slá inn áætlun. Raungildi (litlu tölurnar) eru sýnd undir áætluninni.'
          : 'Click a cell to enter a budget. Actual values (small numbers) are shown below the budget.'}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-xs min-w-[800px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-40">{t('category')}</th>
              {MONTHS.map(m => (
                <th key={m} className="px-1 py-2 text-center text-xs font-semibold text-gray-500 w-12">{t(m as never)}</th>
              ))}
              <th className="px-2 py-2 text-right text-xs font-semibold text-gray-500">{t('total')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {/* Income section */}
            <tr className="bg-green-50">
              <td colSpan={14} className="px-3 py-1.5 text-xs font-bold text-green-700 uppercase">{t('revenues')}</td>
            </tr>
            {INCOME_CATEGORIES.map(c => {
              const bl = getBudget(c, 'income');
              const totalBudget = bl.amounts.reduce((s, v) => s + v, 0);
              const totalActual = (actual[c] ?? []).reduce((s: number, v: number) => s + v, 0);
              return (
                <tr key={c} className="hover:bg-gray-50/50">
                  <td className="px-3 py-1.5 text-xs text-gray-700 font-medium">{t(c as never)}</td>
                  {Array.from({ length: 12 }, (_, i) => (
                    <Cell key={i} category={c} type="income" monthIdx={i} />
                  ))}
                  <td className="px-2 py-1.5 text-right">
                    <div className="font-semibold text-gray-700">{totalBudget ? Math.round(totalBudget/1000)+'k' : '—'}</div>
                    {totalActual > 0 && <div className="text-[9px] text-green-600">{Math.round(totalActual/1000)}k</div>}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-green-50 border-t-2 border-green-200">
              <td className="px-3 py-1.5 text-xs font-bold text-green-700">{t('revenues')}</td>
              {totals.incBudget.map((v, i) => (
                <td key={i} className="px-1 py-1.5 text-right">
                  <div className="font-bold text-green-700 text-xs">{v ? Math.round(v/1000)+'k' : '—'}</div>
                  {totals.incActual[i] > 0 && <div className="text-[9px] text-green-600">{Math.round(totals.incActual[i]/1000)}k</div>}
                </td>
              ))}
              <td className="px-2 py-1.5 text-right font-bold text-green-700">{Math.round(totals.incBudget.reduce((s,v)=>s+v,0)/1000)}k</td>
            </tr>

            {/* Expense section */}
            <tr className="bg-red-50">
              <td colSpan={14} className="px-3 py-1.5 text-xs font-bold text-red-700 uppercase">{t('operatingExpenses')}</td>
            </tr>
            {EXPENSE_CATEGORIES.map(c => {
              const bl = getBudget(c, 'expense');
              const totalBudget = bl.amounts.reduce((s, v) => s + v, 0);
              const totalActual = (actual[c] ?? []).reduce((s: number, v: number) => s + v, 0);
              return (
                <tr key={c} className="hover:bg-gray-50/50">
                  <td className="px-3 py-1.5 text-xs text-gray-700 font-medium">{t(c as never)}</td>
                  {Array.from({ length: 12 }, (_, i) => (
                    <Cell key={i} category={c} type="expense" monthIdx={i} />
                  ))}
                  <td className="px-2 py-1.5 text-right">
                    <div className="font-semibold text-gray-700">{totalBudget ? Math.round(totalBudget/1000)+'k' : '—'}</div>
                    {totalActual > 0 && <div className="text-[9px] text-red-600">{Math.round(totalActual/1000)}k</div>}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-red-50 border-t-2 border-red-200">
              <td className="px-3 py-1.5 text-xs font-bold text-red-700">{t('operatingExpenses')}</td>
              {totals.expBudget.map((v, i) => (
                <td key={i} className="px-1 py-1.5 text-right">
                  <div className="font-bold text-red-700 text-xs">{v ? Math.round(v/1000)+'k' : '—'}</div>
                  {totals.expActual[i] > 0 && <div className="text-[9px] text-red-600">{Math.round(totals.expActual[i]/1000)}k</div>}
                </td>
              ))}
              <td className="px-2 py-1.5 text-right font-bold text-red-700">{Math.round(totals.expBudget.reduce((s,v)=>s+v,0)/1000)}k</td>
            </tr>

            {/* Net */}
            <tr className="bg-blue-50 border-t-2 border-blue-200">
              <td className="px-3 py-2 text-xs font-bold text-blue-900">{t('netResult')}</td>
              {Array.from({ length: 12 }, (_, i) => {
                const netBudget = totals.incBudget[i] - totals.expBudget[i];
                const netActual = totals.incActual[i] - totals.expActual[i];
                return (
                  <td key={i} className="px-1 py-2 text-right">
                    <div className={`font-bold text-xs ${netBudget >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                      {netBudget ? Math.round(netBudget/1000)+'k' : '—'}
                    </div>
                    {(netActual !== 0) && <div className={`text-[9px] ${netActual >= 0 ? 'text-green-600' : 'text-red-600'}`}>{Math.round(netActual/1000)}k</div>}
                  </td>
                );
              })}
              <td className="px-2 py-2 text-right">
                {(() => {
                  const n = totals.incBudget.reduce((s,v)=>s+v,0) - totals.expBudget.reduce((s,v)=>s+v,0);
                  return <div className={`font-bold text-xs ${n>=0?'text-blue-700':'text-red-700'}`}>{Math.round(n/1000)}k</div>;
                })()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">
        {lang === 'is' ? 'Tölur í þúsundum (k). Áætlun (stór) / Raun (lítil).' : 'Numbers in thousands (k). Budget (large) / Actual (small).'}
      </p>
    </div>
  );
}
