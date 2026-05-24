import { useState } from 'react';
import { Plus, Pencil, Trash2, X, Zap, TrendingUp } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { CategoryRule, EXPENSE_CATEGORIES } from '../types';
import { formatDate } from '../utils/formatters';

function newId() { return `rule_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }

export function matchRule(description: string, rules: CategoryRule[]): CategoryRule | null {
  const desc = description.toLowerCase();
  const sorted = [...rules].sort((a, b) => b.pattern.length - a.pattern.length);
  return sorted.find(r => r.pattern.trim() && desc.includes(r.pattern.toLowerCase().trim())) ?? null;
}

function RuleModal({ initial, onSave, onClose }: {
  initial?: Partial<CategoryRule>; onSave: (r: CategoryRule) => void; onClose: () => void;
}) {
  const { t, lang, cc, data } = useApp();
  const [pattern, setPattern] = useState(initial?.pattern ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'adrir_rekstrargjold');
  const [type, setType] = useState<'income' | 'expense'>(initial?.type ?? 'expense');
  const [vatRate, setVatRate] = useState<number>(initial?.vatRate ?? 0);
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';
  const cats = type === 'income'
    ? ['sala_vara', 'sala_thjonustu', 'fjarmagns_tekjur', 'adrar_tekjur']
    : EXPENSE_CATEGORIES;

  function handleSave() {
    const rule: CategoryRule = {
      id: initial?.id ?? newId(),
      pattern: pattern.trim(),
      category, type, vatRate,
      useCount: initial?.useCount ?? 0,
      createdAt: initial?.createdAt ?? new Date().toISOString().split('T')[0],
      lastUsed: initial?.lastUsed,
    };
    onSave(rule);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50">
      <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-600" />
            {initial?.id ? t('editRule') : t('addRule')}
          </h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className={lbl}>{t('rulePattern')}</label>
            <input className={inp} value={pattern} onChange={e => setPattern(e.target.value)}
              placeholder={lang === 'is' ? 't.d. Orkuveita, Telia, Leiga...' : 'e.g. Rent, Phone, Power...'}
              autoFocus />
            <p className="text-xs text-gray-400 mt-1">{t('rulePattern_help')}</p>
          </div>
          <div>
            <label className={lbl}>{t('type')}</label>
            <div className="flex gap-2">
              {(['income', 'expense'] as const).map(tp => (
                <button key={tp} type="button" onClick={() => { setType(tp); setCategory(tp === 'income' ? 'sala_thjonustu' : 'adrir_rekstrargjold'); }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border ${type === tp ? tp === 'income' ? 'bg-green-500 text-white border-green-500' : 'bg-red-500 text-white border-red-500' : 'border-gray-300 text-gray-600'}`}>
                  {t(tp)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>{t('category')}</label>
              <select className={inp} value={category} onChange={e => setCategory(e.target.value)}>
                {cats.map(c => <option key={c} value={c}>{t(c as never)}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>{t('vatRate')}</label>
              <select className={inp} value={vatRate} onChange={e => setVatRate(parseFloat(e.target.value))}>
                {(cc.isUSA ? [data.settings.salesTaxRate, 0] : cc.vatRates)
                  .filter((r, i, arr) => arr.indexOf(r) === i)
                  .map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm">{t('cancel')}</button>
            <button onClick={handleSave} disabled={!pattern.trim()}
              className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm disabled:opacity-40">{t('save')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AutoRules() {
  const { data, dispatch, t, lang } = useApp();
  const [modal, setModal] = useState<{ open: boolean; rule?: CategoryRule }>({ open: false });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const rules = data.categoryRules
    .filter(r => !search || r.pattern.toLowerCase().includes(search.toLowerCase()) || r.category.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.useCount - a.useCount);

  function handleSave(rule: CategoryRule) {
    dispatch(data.categoryRules.find(r => r.id === rule.id)
      ? { type: 'UPDATE_RULE', payload: rule }
      : { type: 'ADD_RULE', payload: rule });
    setModal({ open: false });
  }

  const totalApplied = data.categoryRules.reduce((s, r) => s + r.useCount, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Zap className="w-6 h-6 text-blue-600" />
            {t('rules')}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {lang === 'is'
              ? 'Leitarorð sem flokka bankafærslur sjálfkrafa við innflutning'
              : 'Keywords that auto-categorize bank transactions on import'}
          </p>
        </div>
        <button onClick={() => setModal({ open: true })}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium">
          <Plus className="w-4 h-4" /><span className="hidden sm:inline">{t('addRule')}</span>
        </button>
      </div>

      {/* Stats */}
      {data.categoryRules.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">{lang === 'is' ? 'Reglur' : 'Rules'}</p>
            <p className="text-2xl font-bold text-blue-700">{data.categoryRules.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">{lang === 'is' ? 'Sjálfvirkt flokkað' : 'Auto-categorized'}</p>
            <p className="text-2xl font-bold text-green-700">{totalApplied}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3 hidden sm:block">
            <p className="text-xs text-gray-500">{lang === 'is' ? 'Virkustu reglan' : 'Top rule'}</p>
            <p className="text-sm font-semibold text-gray-700 truncate">
              {rules[0]?.pattern ?? '—'}
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      {data.categoryRules.length > 3 && (
        <div className="mb-4">
          <input type="text" placeholder={t('search')} value={search} onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      )}

      {/* Explainer */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-4 text-xs text-blue-700">
        <div className="flex items-start gap-2">
          <TrendingUp className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            {lang === 'is'
              ? 'Þegar þú flytur inn CSV frá bankanum, beitir forritið þessum reglum sjálfkrafa. Lengri/nákvæmari leitarorð fá forgang. Þú getur líka bætt við reglu beint frá Bankaimport-skjánum.'
              : 'When you import a CSV from your bank, these rules are applied automatically. Longer/more specific keywords take priority. You can also add rules directly from the Bank Import screen.'}
          </div>
        </div>
      </div>

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-14 text-center">
          <Zap className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 text-sm font-medium">{t('noRules')}</p>
          <p className="text-gray-400 text-xs mt-1 mb-4 max-w-xs mx-auto">
            {lang === 'is'
              ? 'Bættu við fyrstu reglunni, eða flytja inn bankagögn og smelltu á 📚 til að læra'
              : 'Add your first rule, or import bank data and click 📚 to learn'}
          </p>
          <button onClick={() => setModal({ open: true })}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {t('addRule')}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">{t('rulePattern')}</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 hidden sm:table-cell">{t('type')}</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">{t('category')}</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 hidden md:table-cell">VSK</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500">{t('useCount')}</th>
                <th className="px-3 py-2.5 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rules.map(r => (
                <tr key={r.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                      <span className="font-mono font-semibold text-gray-800">{r.pattern}</span>
                    </div>
                    {r.lastUsed && (
                      <div className="text-xs text-gray-400 mt-0.5 ml-5">
                        {lang === 'is' ? 'Síðast notað' : 'Last used'}: {formatDate(r.lastUsed, lang)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 hidden sm:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {t(r.type)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-600">{t(r.category as never)}</td>
                  <td className="px-3 py-3 text-xs text-gray-500 hidden md:table-cell">{r.vatRate}%</td>
                  <td className="px-3 py-3 text-right">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.useCount > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                      {r.useCount}×
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setModal({ open: true, rule: r })}
                        className="text-gray-400 hover:text-blue-600 p-1 rounded">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteId(r.id)}
                        className="text-gray-400 hover:text-red-600 p-1 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal.open && <RuleModal initial={modal.rule} onSave={handleSave} onClose={() => setModal({ open: false })} />}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold mb-2">{t('warning')}</h3>
            <p className="text-sm text-gray-600 mb-5">{t('confirmDelete')}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-gray-300 py-2 rounded-xl text-sm">{t('cancel')}</button>
              <button onClick={() => { dispatch({ type: 'DELETE_RULE', payload: deleteId }); setDeleteId(null); }}
                className="flex-1 bg-red-600 text-white py-2 rounded-xl text-sm">{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
