import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Receipt, ArrowRight, CheckSquare, AlertTriangle, Circle, Download, Check } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useApp } from '../contexts/AppContext';
import { filterByYear, getTransactionISK, getMonthlyTotals, calcVATSummary, yearOf } from '../utils/calculations';
import { formatDate } from '../utils/formatters';
import { View, UserPermissions } from '../types';
import SettingsHealthBanner from './SettingsHealthBanner';

interface Props { setView: (v: View) => void; perms?: UserPermissions | null; }

export default function Dashboard({ setView, perms }: Props) {
  // Workers (e.g. staff) must not see the company's financial situation.
  const canViewFinancials = !perms || perms.canViewFinancials;
  const canExport = !perms || perms.canExportData;
  const { data, t, lang, fmtISK, cc } = useApp();
  const [backedUp, setBackedUp] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(
    () => localStorage.getItem('jobboks_last_backup'),
  );
  const [year, setYear] = useState(data.settings.fiscalYear);
  const availableYears = useMemo(() => {
    const ys = new Set<number>(data.transactions.map(tx => yearOf(tx.date)));
    ys.add(data.settings.fiscalYear);
    return Array.from(ys).sort((a, b) => b - a);
  }, [data.transactions, data.settings.fiscalYear]);

  // Getting-started checklist — the visual half of the concierge: three steps to
  // first value on the blank page. Shows only for a NEW account (few transactions)
  // and only until all three are done, so it never nags an established user.
  const gsSteps: { key: string; done: boolean; label: string; to: View }[] = [
    { key: 'setup',   done: !!data.settings.company.name?.trim(), label: lang === 'is' ? 'Settu upp fyrirtækið' : 'Set up your business', to: 'ai' },
    { key: 'invoice', done: (data.invoices?.length ?? 0) > 0,     label: lang === 'is' ? 'Sendu fyrsta reikninginn' : 'Send your first invoice', to: 'invoices' },
    { key: 'job',     done: (data.jobs?.length ?? 0) > 0,         label: lang === 'is' ? 'Skráðu fyrsta verkið' : 'Log your first job', to: 'jobs' },
  ];
  const showGettingStarted = canViewFinancials && !gsSteps.every(s => s.done) && (data.transactions?.length ?? 0) < 20;

  // Gentle reminder: how many days since the last backup (null = never).
  const daysSinceBackup = lastBackup
    ? Math.floor((Date.now() - new Date(lastBackup).getTime()) / 86400000)
    : null;
  const hasData = data.transactions.length > 0 || data.invoices.length > 0;
  const showBackupReminder = hasData && (daysSinceBackup === null || daysSinceBackup >= 7);

  function backupNow() {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jobboks_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const now = new Date().toISOString();
    localStorage.setItem('jobboks_last_backup', now);
    setLastBackup(now);
    setBackedUp(true);
    setTimeout(() => setBackedUp(false), 3000);
  }
  const yearly = filterByYear(data.transactions, year);

  const totalIncome = yearly.filter(t => t.type === 'income').reduce((s, t) => s + getTransactionISK(t), 0);
  const totalExpenses = yearly.filter(t => t.type === 'expense').reduce((s, t) => s + getTransactionISK(t), 0);
  const netProfit = totalIncome - totalExpenses;
  const vat = calcVATSummary(yearly, cc.vatRates, data.settings.pricesIncludeVAT);

  const monthlyData = getMonthlyTotals(data.transactions, year);
  const monthLabels = [t('january'),t('february'),t('march'),t('april'),t('may'),t('june'),
    t('july'),t('august'),t('september'),t('october'),t('november'),t('december')];
  const chartData = monthlyData.map((m, i) => ({
    name: monthLabels[i].slice(0, 3),
    [t('income')]: m.income,
    [t('expense')]: m.expenses,
  }));
  // The monthly totals are ISK-normalised; the Y-axis divides by the same rate the
  // tooltip's fmtISK uses, so the axis labels read in the company currency (a US
  // company sees ~5k, not ~660k) instead of leaking ISK magnitudes.
  const baseCur = data.settings.defaultCurrency || 'ISK';
  const dispRate = baseCur === 'ISK' ? 1 : ((data.settings.exchangeRates as unknown as Record<string, number>)[baseCur] ?? 1);

  const recent = [...data.transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const cards = [
    {
      label: t('totalIncome'),
      value: fmtISK(totalIncome),
      icon: TrendingUp,
      color: 'text-green-600',
      bg: 'bg-green-50',
      border: 'border-green-200',
    },
    {
      label: t('totalExpenses'),
      value: fmtISK(totalExpenses),
      icon: TrendingDown,
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-200',
    },
    {
      label: t('netProfit'),
      value: fmtISK(netProfit),
      icon: DollarSign,
      color: netProfit >= 0 ? 'text-blue-600' : 'text-red-600',
      bg: netProfit >= 0 ? 'bg-blue-50' : 'bg-red-50',
      border: netProfit >= 0 ? 'border-blue-200' : 'border-red-200',
    },
    {
      label: (cc.isUSA || lang === 'en')
        ? (vat.netVAT >= 0 ? `${cc.vatTerm} owed` : `${cc.vatTerm} refund`)
        : (vat.netVAT >= 0 ? t('vatOwed') : t('vatRefund')),
      value: fmtISK(Math.abs(vat.netVAT)),
      icon: Receipt,
      color: vat.netVAT >= 0 ? 'text-orange-600' : 'text-green-600',
      bg: vat.netVAT >= 0 ? 'bg-orange-50' : 'bg-green-50',
      border: vat.netVAT >= 0 ? 'border-orange-200' : 'border-green-200',
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('dashboard')}</h1>
          {canViewFinancials && (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-gray-500">{t('thisYear')}:</span>
              <select value={year} onChange={e => setYear(parseInt(e.target.value))}
                className="text-sm font-semibold text-gray-800 border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}
        </div>
        {canExport && (
        <button
          onClick={backupNow}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm shadow-sm transition-all flex-shrink-0 ${
            backedUp
              ? 'bg-green-600 text-white'
              : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}
        >
          {backedUp ? <Check className="w-5 h-5" /> : <Download className="w-5 h-5" />}
          <span className="hidden sm:inline">
            {backedUp
              ? (lang === 'is' ? 'Afrit vistað!' : 'Backup saved!')
              : (lang === 'is' ? 'Taka öryggisafrit' : 'Back up my data')}
          </span>
          <span className="sm:hidden">
            {backedUp ? (lang === 'is' ? 'Vistað!' : 'Saved!') : (lang === 'is' ? 'Afrit' : 'Backup')}
          </span>
        </button>
        )}
      </div>

      {/* Small notification the moment a setting looks wrong — caught before it reaches a customer */}
      <SettingsHealthBanner compact dismissible />

      {/* Getting-started checklist — blank-page welcome, first value in 3 steps */}
      {showGettingStarted && (
        <div className="mb-6 bg-white rounded-2xl border border-blue-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-base font-semibold text-gray-900">{lang === 'is' ? 'Byrjaðu hér' : 'Getting started'}</h2>
            <span className="ml-auto text-xs font-medium text-gray-400">{gsSteps.filter(s => s.done).length}/3</span>
          </div>
          <div className="space-y-2">
            {gsSteps.map(s => (
              <button key={s.key} onClick={() => { if (!s.done) setView(s.to); }} disabled={s.done}
                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${s.done ? 'bg-green-50 cursor-default' : 'bg-gray-50 hover:bg-blue-50'}`}>
                {s.done ? (
                  <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0"><Check className="w-3 h-3 text-white" /></span>
                ) : (
                  <Circle className="w-5 h-5 text-gray-300 flex-shrink-0" />
                )}
                <span className={`text-sm ${s.done ? 'text-gray-400 line-through' : 'text-gray-800 font-medium'}`}>{s.label}</span>
                {!s.done && <ArrowRight className="w-4 h-4 text-blue-500 ml-auto flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Gentle backup reminder */}
      {canExport && showBackupReminder && (
        <button
          onClick={backupNow}
          className="w-full flex items-center gap-3 mb-6 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-left hover:bg-amber-100 transition-colors"
        >
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-amber-900">
              {daysSinceBackup === null
                ? (lang === 'is' ? 'Þú hefur ekki tekið öryggisafrit ennþá' : "You haven't backed up your data yet")
                : (lang === 'is' ? `Síðasta afrit fyrir ${daysSinceBackup} dögum` : `Last backup was ${daysSinceBackup} days ago`)}
            </div>
            <div className="text-xs text-amber-700">
              {lang === 'is' ? 'Ýttu hér til að taka öryggisafrit núna' : 'Tap here to back up your data now'}
            </div>
          </div>
          <Download className="w-5 h-5 text-amber-600 flex-shrink-0" />
        </button>
      )}

      {canViewFinancials ? (<>
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map(card => (
          <div key={card.label} className={`bg-white rounded-xl border ${card.border} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">{card.label}</span>
              <div className={`${card.bg} rounded-lg p-2`}>
                <card.icon className={`w-4 h-4 ${card.color}`} />
              </div>
            </div>
            <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">{t('incomeVsExpenses')} — {year}</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => { const d = v / dispRate; return d >= 1000 ? `${(d/1000).toFixed(0)}k` : `${Math.round(d)}`; }} />
            <Tooltip
              formatter={(value: number) => fmtISK(value)}
              labelStyle={{ fontSize: 12 }}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey={t('income')} fill="#22c55e" radius={[3, 3, 0, 0]} />
            <Bar dataKey={t('expense')} fill="#f87171" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Recent transactions */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">{t('recentTransactions')}</h2>
          <button
            onClick={() => setView('transactions')}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            {t('all')} <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        {recent.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-gray-400 text-sm">{t('noTransactions')}</p>
            <button
              onClick={() => setView('transactions')}
              className="mt-3 text-blue-600 text-sm font-medium hover:underline"
            >
              {t('addFirst')}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recent.map(tx => (
              <div key={tx.id} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${tx.type === 'income' ? 'bg-green-400' : 'bg-red-400'}`} />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{tx.description}</p>
                    <p className="text-xs text-gray-400">{formatDate(tx.date, lang)} · {t(tx.category as never)}</p>
                  </div>
                </div>
                <div className={`text-sm font-semibold ${tx.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                  {tx.type === 'income' ? '+' : '-'}{fmtISK(getTransactionISK(tx))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </>) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500 text-sm mb-6">
          {lang === 'is' ? 'Verkefnin þín og verkefnalistinn eru hér að neðan.' : 'Your jobs and tasks are below.'}
        </div>
      )}

      {/* Upcoming tasks widget */}
      {(() => {
        const todayStr = new Date().toISOString().split('T')[0];
        const upcoming = data.tasks
          .filter(t => t.status === 'open')
          .sort((a, b) => {
            if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
            if (a.dueDate) return -1;
            if (b.dueDate) return 1;
            return 0;
          })
          .slice(0, 5);
        if (upcoming.length === 0) return null;
        return (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-blue-600" />
                {t('upcomingTasks')}
              </h2>
              <button onClick={() => setView('tasks')}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                {lang === 'is' ? 'Sjá öll' : 'See all'}<ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {upcoming.map(task => {
                const isOverdue = task.dueDate && task.dueDate < todayStr;
                const isToday = task.dueDate === todayStr;
                return (
                  <div key={task.id} className="px-4 py-2.5 flex items-center gap-3">
                    {isOverdue
                      ? <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      : <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">{task.title}</p>
                    </div>
                    {task.dueDate && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                        isOverdue ? 'bg-red-100 text-red-700' : isToday ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {isOverdue ? (lang === 'is' ? 'Útrunnið' : 'Overdue') : isToday ? (lang === 'is' ? 'Í dag' : 'Today') : task.dueDate}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
