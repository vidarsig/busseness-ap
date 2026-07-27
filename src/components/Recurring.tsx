import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Play, RefreshCw } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { RecurringTransaction, Currency, INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../types';
import { formatISK, formatDate, todayISO } from '../utils/formatters';

function newId() { return `rec_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }
function txId() { return `tx_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }

const EMPTY: Omit<RecurringTransaction,'id'> = {
  description: '', category: 'husaleiga', type: 'expense',
  amount: 0, currency: 'ISK', vatRate: 24,
  frequency: 'monthly', dayOfMonth: 1,
  startDate: todayISO(), isActive: true,
};

function RecurringModal({ initial, onSave, onClose }: {
  initial?: RecurringTransaction; onSave: (r: RecurringTransaction) => void; onClose: () => void;
}) {
  const { t, cc, data } = useApp();
  const [form, setForm] = useState<RecurringTransaction>(initial ?? { id: newId(), ...EMPTY });
  const set = <K extends keyof RecurringTransaction>(k: K, v: RecurringTransaction[K]) => setForm(f => ({ ...f, [k]: v }));
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';
  const cats = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50">
      <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl shadow-xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{initial ? t('editRecurring') : t('addRecurring')}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className={lbl}>{t('type')}</label>
            <div className="flex gap-2">
              {(['income','expense'] as const).map(tp => (
                <button key={tp} type="button" onClick={() => { set('type', tp); set('category', tp === 'income' ? 'sala_thjonustu' : 'husaleiga'); }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border ${form.type === tp ? tp === 'income' ? 'bg-green-500 text-white border-green-500' : 'bg-red-500 text-white border-red-500' : 'border-gray-300 text-gray-600'}`}>
                  {t(tp)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={lbl}>{t('description')}</label>
            <input className={inp} value={form.description} onChange={e => set('description', e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>{t('category')}</label>
              <select className={inp} value={form.category} onChange={e => set('category', e.target.value)}>
                {cats.map(c => <option key={c} value={c}>{t(c as never)}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>{t('frequency')}</label>
              <select className={inp} value={form.frequency} onChange={e => set('frequency', e.target.value as RecurringTransaction['frequency'])}>
                <option value="monthly">{t('monthly')}</option>
                <option value="quarterly">{t('quarterly')}</option>
                <option value="annually">{t('annually')}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>{t('currency')}</label>
              <select className={inp} value={form.currency} onChange={e => set('currency', e.target.value as Currency)}>
                <option value="ISK">ISK</option><option value="EUR">EUR</option>
                <option value="USD">USD</option><option value="GBP">GBP</option><option value="DKK">DKK</option>
              </select>
            </div>
            <div>
              <label className={lbl}>{cc.isUSA ? `Amount excl. ${cc.vatTerm}` : t('amountExVat')} ({form.currency})</label>
              <input type="number" className={inp} value={form.amount || ''} onChange={e => set('amount', parseFloat(e.target.value)||0)} min={0} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>{cc.isUSA ? `${cc.vatTerm} Rate` : t('vatRate')}</label>
              <select className={inp} value={form.vatRate} onChange={e => set('vatRate', parseFloat(e.target.value))}>
                {(cc.isUSA ? [data.settings.salesTaxRate, 0] : cc.vatRates)
                  .filter((r, i, arr) => arr.indexOf(r) === i)
                  .map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>{t('dayOfMonth')}</label>
              <input type="number" className={inp} value={form.dayOfMonth} onChange={e => set('dayOfMonth', parseInt(e.target.value)||1)} min={1} max={28} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>{t('startDate')}</label>
              <input type="date" className={inp} value={form.startDate} onChange={e => set('startDate', e.target.value)} />
            </div>
            <div>
              <label className={lbl}>{t('endDate')} ({t('optional')})</label>
              <input type="date" className={inp} value={form.endDate || ''} onChange={e => set('endDate', e.target.value || undefined)} />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} className="w-4 h-4 rounded" />
            <span className="text-sm">{t('isActive')}</span>
          </label>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm">{t('cancel')}</button>
            <button onClick={() => onSave(form)} className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm">{t('save')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Format a Date as YYYY-MM-DD from its LOCAL parts. Using toISOString() here would
// serialize in UTC, so at a positive UTC offset (the owner is on Kenya time, UTC+3)
// local midnight rolls back to the previous day — which both dated every generated
// entry a day early AND made "Generate now" re-create the last period forever
// (lastGenerated stored one day behind the cursor). Local parts keep them aligned.
function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shouldGenerate(rec: RecurringTransaction, today: Date): string[] {
  const dates: string[] = [];
  const start = new Date(rec.startDate + 'T00:00:00');
  const last = rec.lastGenerated ? new Date(rec.lastGenerated + 'T00:00:00') : null;
  const end = rec.endDate ? new Date(rec.endDate + 'T00:00:00') : null;

  let cursor = new Date(start);
  cursor.setDate(rec.dayOfMonth);
  if (cursor < start) {
    if (rec.frequency === 'monthly') cursor.setMonth(cursor.getMonth() + 1);
    else if (rec.frequency === 'quarterly') cursor.setMonth(cursor.getMonth() + 3);
    else cursor.setFullYear(cursor.getFullYear() + 1);
  }

  let safety = 0;
  while (cursor <= today && safety < 60) {
    safety++;
    if (end && cursor > end) break;
    const ds = ymdLocal(cursor);
    if (!last || cursor > last) dates.push(ds);
    if (rec.frequency === 'monthly') cursor.setMonth(cursor.getMonth() + 1);
    else if (rec.frequency === 'quarterly') cursor.setMonth(cursor.getMonth() + 3);
    else cursor.setFullYear(cursor.getFullYear() + 1);
  }
  return dates;
}

export default function Recurring() {
  const { data, dispatch, t, lang } = useApp();
  const [modal, setModal] = useState<{ open: boolean; rec?: RecurringTransaction }>({ open: false });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function handleSave(rec: RecurringTransaction) {
    dispatch(data.recurringTransactions.find(r => r.id === rec.id)
      ? { type: 'UPDATE_RECURRING', payload: rec }
      : { type: 'ADD_RECURRING', payload: rec });
    setModal({ open: false });
  }

  function generate(rec: RecurringTransaction) {
    const today = new Date();
    const dates = shouldGenerate(rec, today);
    if (dates.length === 0) { alert(lang === 'is' ? 'Engar nýjar færslur til að búa til' : 'No new transactions to generate'); return; }
    const rate = data.settings.exchangeRates[rec.currency as 'EUR'] ?? 1;
    dates.forEach(date => {
      dispatch({ type: 'ADD_TRANSACTION', payload: {
        id: txId(), date, description: rec.description,
        category: rec.category, type: rec.type,
        amount: rec.amount, currency: rec.currency,
        eurToIskRate: rate, vatRate: rec.vatRate,
      }});
    });
    dispatch({ type: 'UPDATE_RECURRING', payload: { ...rec, lastGenerated: dates[dates.length - 1] } });
    alert(`${dates.length} ${t('generated')}!`);
  }

  const freqLabel = { monthly: t('monthly'), quarterly: t('quarterly'), annually: t('annually') };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('recurringTransactions')}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{lang === 'is' ? 'Sjálfvirkt búnar til á tilgreindu tímabili' : 'Automatically generated on a set schedule'}</p>
        </div>
        <button onClick={() => setModal({ open: true })}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">{t('addRecurring')}</span>
        </button>
      </div>

      {data.recurringTransactions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">{t('noRecurring')}</div>
      ) : (
        <div className="space-y-2">
          {data.recurringTransactions.map(rec => {
            const pending = shouldGenerate(rec, new Date()).length;
            return (
              <div key={rec.id} className={`bg-white rounded-xl border p-4 ${!rec.isActive ? 'opacity-60 border-gray-200' : pending > 0 ? 'border-orange-200' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <RefreshCw className={`w-4 h-4 flex-shrink-0 ${rec.isActive ? 'text-blue-500' : 'text-gray-300'}`} />
                    <div>
                      <p className="font-medium text-gray-800">{rec.description}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${rec.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{t(rec.type)}</span>
                        <span className="text-xs text-gray-500">{freqLabel[rec.frequency]} · {t('dayOfMonth')}: {rec.dayOfMonth}</span>
                        {rec.lastGenerated && <span className="text-xs text-gray-400">{t('lastGenerated')}: {formatDate(rec.lastGenerated, lang)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`font-semibold ${rec.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                      {formatISK(rec.amount * (1 + rec.vatRate/100) * (rec.currency === 'ISK' ? 1 : (data.settings.exchangeRates[rec.currency as 'EUR'] ?? 1)), lang)}
                    </div>
                    {pending > 0 && <div className="text-xs text-orange-500 font-medium">{pending} {lang === 'is' ? 'í bið' : 'pending'}</div>}
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50 flex-wrap">
                  <button onClick={() => generate(rec)} disabled={!rec.isActive}
                    className="flex items-center gap-1 text-xs text-green-600 border border-green-200 bg-green-50 px-2.5 py-1.5 rounded-lg hover:bg-green-100 disabled:opacity-40">
                    <Play className="w-3.5 h-3.5" /> {t('generateNow')}
                  </button>
                  <button onClick={() => setModal({ open: true, rec })}
                    className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50">
                    <Pencil className="w-3.5 h-3.5" /> {t('edit')}
                  </button>
                  <button onClick={() => setDeleteId(rec.id)}
                    className="flex items-center gap-1 text-xs text-red-500 border border-red-100 bg-red-50 px-2.5 py-1.5 rounded-lg">
                    <Trash2 className="w-3.5 h-3.5" /> {t('delete')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal.open && <RecurringModal initial={modal.rec} onSave={handleSave} onClose={() => setModal({ open: false })} />}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold mb-2">{t('warning')}</h3>
            <p className="text-sm text-gray-600 mb-5">{t('confirmDelete')}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-gray-300 py-2 rounded-xl text-sm">{t('cancel')}</button>
              <button onClick={() => { dispatch({ type: 'DELETE_RECURRING', payload: deleteId }); setDeleteId(null); }} className="flex-1 bg-red-600 text-white py-2 rounded-xl text-sm">{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
