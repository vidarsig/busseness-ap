import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, X, Lock } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Account } from '../types';

function newId() { return `ac_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }

const EMPTY: Omit<Account,'id'> = {
  number: '', name: '', nameEn: '', type: 'expense', isSystem: false, isActive: true,
};

function AccountModal({ initial, onSave, onClose }: {
  initial?: Account; onSave: (a: Account) => void; onClose: () => void;
}) {
  const { t, lang } = useApp();
  const [form, setForm] = useState<Account>(initial ?? { id: newId(), ...EMPTY });
  const set = <K extends keyof Account>(k: K, v: Account[K]) => setForm(f => ({ ...f, [k]: v }));
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';
  const types: Array<{ v: Account['type']; label: string }> = [
    { v: 'asset', label: t('accountTypeAsset') },
    { v: 'liability', label: t('accountTypeLiability') },
    { v: 'equity', label: t('accountTypeEquity') },
    { v: 'revenue', label: t('accountTypeRevenue') },
    { v: 'expense', label: t('accountTypeExpense') },
  ];
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50">
      <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{initial ? t('editAccount') : t('addAccount')}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>{t('accountNumberLabel')}</label>
              <input className={inp} value={form.number} onChange={e => set('number', e.target.value)}
                placeholder="e.g. 3100" maxLength={6} disabled={form.isSystem} />
            </div>
            <div>
              <label className={lbl}>{t('accountType')}</label>
              <select className={inp} value={form.type} onChange={e => set('type', e.target.value as Account['type'])} disabled={form.isSystem}>
                {types.map(tp => <option key={tp.v} value={tp.v}>{tp.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={lbl}>{t('accountName')} (IS)</label>
            <input className={inp} value={form.name} onChange={e => set('name', e.target.value)} required />
          </div>
          <div>
            <label className={lbl}>{t('accountName')} (EN)</label>
            <input className={inp} value={form.nameEn} onChange={e => set('nameEn', e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)}
                className="w-4 h-4 rounded" />
              <span className="text-sm text-gray-700">{t('active')}</span>
            </label>
          </div>
          {form.isSystem && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> {t('systemAccount')} — {lang === 'is' ? 'kerfislykill er ekki hægt að breyta' : 'system accounts cannot be fully edited'}
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm">{t('cancel')}</button>
            <button onClick={() => onSave(form)} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm">{t('save')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const typeColor: Record<Account['type'], string> = {
  asset: 'bg-blue-100 text-blue-700',
  liability: 'bg-red-100 text-red-700',
  equity: 'bg-purple-100 text-purple-700',
  revenue: 'bg-green-100 text-green-700',
  expense: 'bg-orange-100 text-orange-700',
};

export default function ChartOfAccounts() {
  const { data, dispatch, t, lang } = useApp();
  const [modal, setModal] = useState<{ open: boolean; acc?: Account }>({ open: false });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<Account['type'] | 'all'>('all');
  const [search, setSearch] = useState('');

  const accounts = useMemo(() =>
    data.accounts
      .filter(a => filterType === 'all' || a.type === filterType)
      .filter(a => !search || a.number.includes(search) || a.name.toLowerCase().includes(search.toLowerCase()) || a.nameEn.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.number.localeCompare(b.number)),
    [data.accounts, filterType, search]);

  function handleSave(acc: Account) {
    dispatch(data.accounts.find(a => a.id === acc.id)
      ? { type: 'UPDATE_ACCOUNT', payload: acc }
      : { type: 'ADD_ACCOUNT', payload: acc });
    setModal({ open: false });
  }

  const types: Array<{ v: Account['type'] | 'all'; label: string }> = [
    { v: 'all', label: t('all') },
    { v: 'asset', label: t('accountTypeAsset') },
    { v: 'liability', label: t('accountTypeLiability') },
    { v: 'equity', label: t('accountTypeEquity') },
    { v: 'revenue', label: t('accountTypeRevenue') },
    { v: 'expense', label: t('accountTypeExpense') },
  ];

  // Group by first digit
  const groups = useMemo(() => {
    const g: Record<string, Account[]> = {};
    accounts.forEach(a => {
      const key = a.number.charAt(0) || '?';
      if (!g[key]) g[key] = [];
      g[key].push(a);
    });
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [accounts]);

  const groupLabels: Record<string, string> = {
    '1': lang === 'is' ? 'Eignir' : 'Assets',
    '2': lang === 'is' ? 'Skuldir og eigið fé' : 'Liabilities & Equity',
    '3': lang === 'is' ? 'Tekjur' : 'Revenue',
    '4': lang === 'is' ? 'Keypt verk' : 'Cost of Goods',
    '5': lang === 'is' ? 'Laun' : 'Wages',
    '6': lang === 'is' ? 'Rekstrargjöld' : 'Operating Expenses',
    '7': lang === 'is' ? 'Afskriftir' : 'Depreciation',
    '8': lang === 'is' ? 'Fjármagnsgjöld' : 'Financial Expenses',
    '9': lang === 'is' ? 'Skattgjöld' : 'Tax',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('chartOfAccounts')}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{t('accountsInfo')}</p>
        </div>
        <button onClick={() => setModal({ open: true })}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /><span className="hidden sm:inline">{t('addAccount')}</span>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 flex flex-wrap gap-2">
        <input type="text" placeholder={t('search')} value={search} onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[140px] focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <div className="flex flex-wrap gap-1">
          {types.map(tp => (
            <button key={tp.v} onClick={() => setFilterType(tp.v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterType === tp.v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {tp.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {groups.map(([key, accs]) => (
          <div key={key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 uppercase">{key}xxx</span>
              <span className="text-sm font-semibold text-gray-700">{groupLabels[key] ?? ''}</span>
              <span className="ml-auto text-xs text-gray-400">{accs.length}</span>
            </div>
            <table className="w-full">
              <tbody className="divide-y divide-gray-50">
                {accs.map(acc => (
                  <tr key={acc.id} className={`hover:bg-gray-50/50 ${!acc.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2.5 w-16">
                      <span className="font-mono text-sm font-semibold text-gray-700">{acc.number}</span>
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="text-sm font-medium text-gray-800">{lang === 'is' ? acc.name : (acc.nameEn || acc.name)}</div>
                      {lang === 'is' && acc.nameEn && <div className="text-xs text-gray-400">{acc.nameEn}</div>}
                    </td>
                    <td className="px-2 py-2.5 hidden sm:table-cell">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColor[acc.type]}`}>
                        {t(`accountType${acc.type.charAt(0).toUpperCase() + acc.type.slice(1)}` as never)}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 hidden sm:table-cell">
                      {acc.isSystem && <span className="text-xs text-amber-600 flex items-center gap-1"><Lock className="w-3 h-3" />{t('systemAccount')}</span>}
                    </td>
                    <td className="px-4 py-2.5 w-16">
                      <div className="flex gap-1">
                        <button onClick={() => setModal({ open: true, acc })} className="text-gray-400 hover:text-blue-600 p-1 rounded">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {!acc.isSystem && (
                          <button onClick={() => setDeleteId(acc.id)} className="text-gray-400 hover:text-red-600 p-1 rounded">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {groups.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">{t('noData')}</div>
        )}
      </div>

      {modal.open && <AccountModal initial={modal.acc} onSave={handleSave} onClose={() => setModal({ open: false })} />}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold mb-2">{t('warning')}</h3>
            <p className="text-sm text-gray-600 mb-5">{t('confirmDelete')}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-gray-300 py-2 rounded-xl text-sm">{t('cancel')}</button>
              <button onClick={() => { dispatch({ type: 'DELETE_ACCOUNT', payload: deleteId }); setDeleteId(null); }} className="flex-1 bg-red-600 text-white py-2 rounded-xl text-sm">{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
