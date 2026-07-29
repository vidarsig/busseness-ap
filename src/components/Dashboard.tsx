import { useState, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Receipt, ArrowRight, CheckSquare,
  AlertTriangle, Circle, Download, Check, HardHat, MapPin, Camera, ClipboardCheck,
  Send, ArrowDownLeft, Search,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { filterByYear, getTransactionISK, calcVATSummary, yearOf } from '../utils/calculations';
import { invoiceTotals } from '../utils/invoiceMath';
import { formatDate } from '../utils/formatters';
import { View, UserPermissions, JobStatus, Currency } from '../types';
import SettingsHealthBanner from './SettingsHealthBanner';

interface Props { setView: (v: View) => void; perms?: UserPermissions | null; }

// Full pipeline shown on the front page (cancelled left off), in the order the
// foreman works them. Labels/colours mirror the Jobs screen so they never disagree.
const STAGES: JobStatus[] = ['survey', 'scheduled', 'active', 'paused', 'complete'];
const STAGE_META: Record<JobStatus, { is: string; en: string; dot: string; chip: string }> = {
  survey:    { is: 'Vettvangsskoðun', en: 'Site visit', dot: 'bg-purple-500', chip: 'bg-purple-100 text-purple-700' },
  scheduled: { is: 'Færslur',         en: 'Entries',    dot: 'bg-indigo-500', chip: 'bg-indigo-100 text-indigo-700' },
  active:    { is: 'Í vinnslu',       en: 'Active',     dot: 'bg-green-500',  chip: 'bg-green-100 text-green-700' },
  paused:    { is: 'Á bið',           en: 'Paused',     dot: 'bg-amber-500',  chip: 'bg-amber-100 text-amber-700' },
  complete:  { is: 'Lokið',           en: 'Complete',   dot: 'bg-blue-500',   chip: 'bg-blue-100 text-blue-700' },
  cancelled: { is: 'Hætt við',        en: 'Cancelled',  dot: 'bg-gray-400',   chip: 'bg-gray-100 text-gray-500' },
};

export default function Dashboard({ setView, perms }: Props) {
  // Workers (e.g. staff) must not see the company's financial situation.
  const canViewFinancials = !perms || perms.canViewFinancials;
  const canExport = !perms || perms.canExportData;
  const canViewJobs = !perms || perms.canViewJobs;
  const canViewInvoices = !perms || perms.canViewInvoices;
  const canApproveReports = !perms || perms.canApproveJobReports;
  const { data, t, lang, fmtISK, cc } = useApp();
  const L = (is: string, en: string) => (lang === 'is' ? is : en);
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

  // ── Field / work data for the front page ──
  const jobs = data.jobs ?? [];
  // Work sites = the live ones (planned or in progress), newest touched first.
  const sites = [...jobs]
    .filter(j => j.status === 'survey' || j.status === 'scheduled' || j.status === 'active' || j.status === 'paused')
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .slice(0, 6);
  // Reports a worker submitted, waiting for the owner/manager to approve.
  const submitted = [...jobs]
    .filter(j => j.reportStatus === 'submitted')
    .sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
  // Latest photos taken out on the jobs.
  const recentPhotos = [...(data.jobPhotos ?? [])]
    .sort((a, b) => (b.takenAt || b.createdAt || '').localeCompare(a.takenAt || a.createdAt || ''))
    .slice(0, 8);

  // ── "What's moving" flow — the daily pulse of the business ──
  const invoices = data.invoices ?? [];
  const toISK = (amt: number, cur: Currency) =>
    amt * ((data.settings.exchangeRates as unknown as Record<string, number>)[cur] ?? 1);
  const invISK = (inv: typeof invoices[number]) => toISK(invoiceTotals(inv).total, inv.currency);
  const sumISK = (arr: typeof invoices) => arr.reduce((s, i) => s + invISK(i), 0);
  const offersOut = invoices.filter(i => i.type === 'quote' && i.status === 'sent');
  const incoming = invoices.filter(i => i.type === 'invoice' && (i.status === 'sent' || i.status === 'overdue'));
  const overdue = invoices.filter(i => i.type === 'invoice' && i.status === 'overdue');
  const jobsIn = (st: JobStatus) => jobs.filter(j => j.status === st).length;

  type FlowTile = { key: string; label: string; n: number; sub?: string; Icon: typeof Send; color: string; bg: string; to: View };
  const flow: FlowTile[] = [];
  if (canViewInvoices) {
    flow.push({ key: 'offers',  label: L('Tilboð úti', 'Offers out'),   n: offersOut.length, sub: fmtISK(sumISK(offersOut)), Icon: Send,          color: 'text-violet-600', bg: 'bg-violet-50', to: 'invoices' });
    flow.push({ key: 'incoming', label: L('Að koma inn', 'Coming in'),  n: incoming.length,  sub: fmtISK(sumISK(incoming)),  Icon: ArrowDownLeft,  color: 'text-green-600',  bg: 'bg-green-50',  to: 'invoices' });
    if (overdue.length > 0)
      flow.push({ key: 'overdue', label: L('Í vanskilum', 'Overdue'),   n: overdue.length,   sub: fmtISK(sumISK(overdue)),   Icon: AlertTriangle,  color: 'text-red-600',    bg: 'bg-red-50',    to: 'invoices' });
  }
  if (canViewJobs) {
    flow.push({ key: 'survey', label: L('Skoðanir', 'Surveys'), n: jobsIn('survey'), Icon: Search,  color: 'text-purple-600', bg: 'bg-purple-50', to: 'jobs' });
    flow.push({ key: 'active', label: L('Í vinnslu', 'Active'),  n: jobsIn('active'), Icon: HardHat, color: 'text-blue-600',   bg: 'bg-blue-50',   to: 'jobs' });
  }

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

      {/* KPI cards — money glance, owner/manager only */}
      {canViewFinancials && (
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
      )}

      {/* "What's moving" — the daily pulse: offers out, money coming in, surveys, active jobs */}
      {flow.length > 0 && (
        <div className="mb-6 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{L('Í gangi núna', "What's moving")}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {flow.map(f => (
              <button key={f.key} onClick={() => setView(f.to)}
                className="rounded-xl border border-gray-100 bg-gray-50 hover:bg-gray-100 p-3 text-left transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className={`${f.bg} rounded-lg p-1.5`}>
                    <f.Icon className={`w-4 h-4 ${f.color}`} />
                  </div>
                  <span className="text-2xl font-bold text-gray-900 leading-none">{f.n}</span>
                </div>
                <div className="text-xs font-medium text-gray-700 truncate">{f.label}</div>
                {f.sub && <div className="text-[11px] text-gray-400 truncate">{f.sub}</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      {canViewJobs && (<>
        {/* Reports from workers — waiting for approval */}
        {canApproveReports && submitted.length > 0 && (
          <div className="mb-6 bg-white rounded-xl border border-amber-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-amber-100">
              <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2 min-w-0">
                <ClipboardCheck className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="truncate">{L('Skýrslur frá starfsmönnum', 'Reports from workers')}</span>
                <span className="text-xs font-normal text-amber-600 hidden sm:inline">· {L('bíður samþykktar', 'waiting for approval')}</span>
              </h2>
              <button onClick={() => setView('jobs')} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium flex-shrink-0">
                {L('Skoða', 'Review')} <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {submitted.slice(0, 5).map(job => (
                <button key={job.id} onClick={() => setView('jobs')}
                  className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-amber-50/60 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{job.name || job.number}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {job.clientName}
                      {job.submittedBy ? ` · ${L('sent af', 'by')} ${job.submittedBy}` : ''}
                      {job.submittedAt ? ` · ${formatDate(job.submittedAt.split('T')[0], lang)}` : ''}
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 flex-shrink-0">
                    {L('Samþykkja', 'Approve')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Job status — where the jobs are in the pipeline (positioning) */}
        {jobs.length > 0 && (
          <div className="mb-6 bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <HardHat className="w-4 h-4 text-blue-600" />
                {L('Staða verkefna', 'Job status')}
              </h2>
              <button onClick={() => setView('jobs')} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                {L('Öll verk', 'All jobs')} <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {STAGES.map(s => {
                const m = STAGE_META[s];
                const n = jobs.filter(j => j.status === s).length;
                return (
                  <button key={s} onClick={() => setView('jobs')}
                    className="rounded-xl border border-gray-100 bg-gray-50 hover:bg-blue-50 p-3 text-left transition-colors">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${m.dot}`} />
                      <span className="text-[11px] text-gray-500 truncate">{L(m.is, m.en)}</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">{n}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Work sites — the live jobs */}
        <div className="mb-6 bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              {L('Verkstaðir', 'Work sites')}
            </h2>
            <button onClick={() => setView('jobs')} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
              {L('Öll', 'All')} <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {sites.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-gray-400 text-sm">{L('Engin virk verk', 'No active jobs')}</p>
              <button onClick={() => setView('jobs')} className="mt-3 text-blue-600 text-sm font-medium hover:underline">
                {L('Skrá fyrsta verkið', 'Log your first job')}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {sites.map(job => {
                const m = STAGE_META[job.status];
                return (
                  <button key={job.id} onClick={() => setView('jobs')}
                    className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{job.name || job.number}</p>
                      <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                        {job.address
                          ? <><MapPin className="w-3 h-3 flex-shrink-0" />{job.address}</>
                          : (job.clientName || '—')}
                      </p>
                    </div>
                    {m && <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${m.chip}`}>{L(m.is, m.en)}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Photos from jobs */}
        {recentPhotos.length > 0 && (
          <div className="mb-6 bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Camera className="w-4 h-4 text-blue-600" />
                {L('Myndir frá verkum', 'Photos from jobs')}
              </h2>
              <button onClick={() => setView('jobs')} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                {L('Öll', 'All')} <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {recentPhotos.map(p => {
                const jn = jobs.find(j => j.id === p.jobId)?.name;
                return (
                  <button key={p.id} onClick={() => setView('jobs')}
                    className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
                    <img src={p.dataUrl} alt={p.caption || jn || 'job photo'}
                      className="w-full h-full object-cover" loading="lazy" />
                    {(p.caption || jn) && (
                      <div className="absolute inset-x-0 bottom-0 bg-black/50 px-1.5 py-0.5">
                        <p className="text-[10px] text-white truncate">{p.caption || jn}</p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </>)}

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
