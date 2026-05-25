import { useState, useRef } from 'react';
import { Plus, Pencil, Trash2, X, Package, AlertTriangle, TrendingDown, TrendingUp, Upload, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { StockItem, StockMovement, Currency } from '../types';
import { isStockLimitReached } from '../utils/planLimits';
import PlanLimitModal from './PlanLimitModal';

function newId() { return `stk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }
function mvId()  { return `smv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }
function nowISO() { return new Date().toISOString(); }
function todayISO() { return new Date().toISOString().slice(0, 10); }

const UNITS = ['pcs', 'kg', 'g', 'm', 'm²', 'm³', 'L', 'box', 'pallet', 'bag', 'roll', 'set'];
const CATEGORIES = ['Building materials', 'Electrical', 'Plumbing', 'Tools', 'Safety', 'Finishing', 'Mechanical', 'Other'];

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const sel = inp;

const emptyItem = (): Partial<StockItem> => ({
  sku: '', name: '', description: '', category: 'Building materials',
  unit: 'pcs', qtyOnHand: 0, qtyReserved: 0, reorderPoint: 5,
  costPrice: 0, sellPrice: 0, currency: 'ISK', vatRate: 24,
  supplierName: '', supplierCode: '', location: '',
});

interface MovementFormState {
  open: boolean;
  itemId: string;
  type: StockMovement['type'];
  qty: string;
  reference: string;
  note: string;
  date: string;
}

export default function Stock() {
  const { data, dispatch, lang, cc, fmt } = useApp();
  const items = data.stockItems ?? [];
  const movements = data.stockMovements ?? [];

  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; item?: Partial<StockItem> }>({ open: false });
  const [limitModal, setLimitModal] = useState(false);
  const [mv, setMv] = useState<MovementFormState>({ open: false, itemId: '', type: 'in', qty: '', reference: '', note: '', date: todayISO() });

  function openAddItem() {
    if (isStockLimitReached(data)) { setLimitModal(true); return; }
    setModal({ open: true, item: emptyItem() });
  }
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isIS = lang === 'is';

  // ── Filter ──────────────────────────────────────────────────
  const filtered = items.filter(it => {
    if (search && !it.name.toLowerCase().includes(search.toLowerCase()) && !it.sku.toLowerCase().includes(search.toLowerCase())) return false;
    if (catFilter && it.category !== catFilter) return false;
    if (lowOnly && it.qtyOnHand > it.reorderPoint) return false;
    return true;
  });

  const lowCount = items.filter(it => it.qtyOnHand <= it.reorderPoint).length;
  const totalValue = items.reduce((s, it) => s + it.qtyOnHand * it.costPrice, 0);

  // ── Save item ───────────────────────────────────────────────
  function saveItem() {
    const f = modal.item!;
    if (!f.name?.trim()) return;
    const now = nowISO();
    if (f.id) {
      dispatch({ type: 'UPDATE_STOCK_ITEM', payload: { ...f, updatedAt: now } as StockItem });
    } else {
      dispatch({ type: 'ADD_STOCK_ITEM', payload: { ...f, id: newId(), createdAt: now, updatedAt: now, qtyOnHand: Number(f.qtyOnHand ?? 0), qtyReserved: 0 } as StockItem });
    }
    setModal({ open: false });
  }

  function deleteItem(id: string) {
    if (confirm(isIS ? 'Eyða þessum hlut?' : 'Delete this item?')) dispatch({ type: 'DELETE_STOCK_ITEM', payload: id });
  }

  // ── Movement ────────────────────────────────────────────────
  function saveMovement() {
    const qty = parseFloat(mv.qty);
    if (!qty || qty <= 0) return;
    const now = nowISO();
    dispatch({ type: 'ADD_STOCK_MOVEMENT', payload: { id: mvId(), itemId: mv.itemId, date: mv.date, type: mv.type, qty, reference: mv.reference, note: mv.note, createdAt: now } });
    setMv(v => ({ ...v, open: false, qty: '', reference: '', note: '' }));
  }

  // ── CSV import from supplier ─────────────────────────────────
  function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const text = evt.target?.result as string;
      const lines = text.split('\n').filter(Boolean);
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const now = nowISO();
      let count = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        const get = (key: string) => cols[headers.indexOf(key)]?.trim() ?? '';
        const name = get('name') || get('description') || get('item');
        if (!name) continue;
        const existing = items.find(it => it.sku === get('sku') || it.sku === get('code'));
        if (existing) {
          // update price only
          dispatch({ type: 'UPDATE_STOCK_ITEM', payload: { ...existing, costPrice: parseFloat(get('price') || get('cost') || String(existing.costPrice)), updatedAt: now } });
        } else {
          dispatch({ type: 'ADD_STOCK_ITEM', payload: {
            id: newId(), sku: get('sku') || get('code') || `SUP-${i}`,
            name, description: get('description'), category: get('category') || 'Other',
            unit: get('unit') || 'pcs', qtyOnHand: parseFloat(get('qty') || '0'),
            qtyReserved: 0, reorderPoint: parseFloat(get('reorder') || '5'),
            costPrice: parseFloat(get('price') || get('cost') || '0'),
            sellPrice: parseFloat(get('sell') || get('saleprice') || '0'),
            currency: (get('currency') || cc.currency) as Currency, vatRate: parseFloat(get('vat') || String(cc.standardRate)),
            supplierName: get('supplier'), supplierCode: get('suppliercode'),
            location: get('location'), createdAt: now, updatedAt: now,
          } });
        }
        count++;
      }
      alert(isIS ? `${count} hlutir fluttir inn` : `${count} items imported`);
      setImportOpen(false);
      if (fileRef.current) fileRef.current.value = '';
    };
    reader.readAsText(file);
  }

  const itemHistory = historyId ? movements.filter(m => m.itemId === historyId).sort((a, b) => b.date.localeCompare(a.date)) : [];

  const mvLabel = (type: StockMovement['type']) => ({ in: isIS ? 'Inn' : 'In', out: isIS ? 'Út' : 'Out', adjust: isIS ? 'Leiðrétting' : 'Adjust', return: isIS ? 'Skil' : 'Return' }[type]);
  const mvColor = (type: StockMovement['type']) => ({ in: 'text-green-600', out: 'text-red-500', adjust: 'text-blue-500', return: 'text-amber-500' }[type]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isIS ? 'Birgðir' : 'Stock & Inventory'}</h1>
          <p className="text-sm text-gray-500">{isIS ? 'Hlutir, birgðastaða og birgjaskrá' : 'Items, stock levels and supplier catalogue'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Upload className="w-4 h-4" />{isIS ? 'Innflutningur' : 'Import CSV'}
          </button>
          <button onClick={openAddItem} className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" />{isIS ? 'Bæta við hlut' : 'Add item'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">{isIS ? 'Hlutir samtals' : 'Total items'}</div>
          <div className="text-2xl font-bold text-gray-900">{items.length}</div>
        </div>
        <div className={`bg-white rounded-xl border p-4 ${lowCount > 0 ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            {lowCount > 0 && <AlertTriangle className="w-3 h-3 text-amber-500" />}
            {isIS ? 'Lágar birgðir' : 'Low stock'}
          </div>
          <div className={`text-2xl font-bold ${lowCount > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{lowCount}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 col-span-2 sm:col-span-1">
          <div className="text-xs text-gray-500 mb-1">{isIS ? 'Heildarvirði' : 'Stock value'}</div>
          <div className="text-xl font-bold text-gray-900">{fmt(totalValue)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={isIS ? 'Leita...' : 'Search...'} className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="">{isIS ? 'Allir flokkar' : 'All categories'}</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={() => setLowOnly(v => !v)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border font-medium transition-colors ${lowOnly ? 'bg-amber-50 border-amber-400 text-amber-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          <AlertTriangle className="w-4 h-4" />{isIS ? 'Lágar birgðir' : 'Low stock'}
        </button>
      </div>

      {/* Item list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{isIS ? 'Engir hlutir fundust' : 'No items found'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">{isIS ? 'Nafn' : 'Item'}</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">SKU</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">{isIS ? 'Magn' : 'Qty'}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 hidden md:table-cell">{isIS ? 'Kostnaðarverð' : 'Cost'}</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 hidden md:table-cell">{isIS ? 'Virði' : 'Value'}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(it => {
                  const isLow = it.qtyOnHand <= it.reorderPoint;
                  return (
                    <>
                      <tr key={it.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 flex items-center gap-1.5">
                            {isLow && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                            {it.name}
                          </div>
                          <div className="text-xs text-gray-400">{it.category} · {it.unit}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 hidden sm:table-cell font-mono text-xs">{it.sku}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold ${isLow ? 'text-amber-600' : 'text-gray-900'}`}>{it.qtyOnHand}</span>
                          <span className="text-xs text-gray-400 ml-1">{it.unit}</span>
                          {isLow && <div className="text-xs text-amber-500">min {it.reorderPoint}</div>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 hidden md:table-cell">{fmt(it.costPrice)}</td>
                        <td className="px-4 py-3 text-right font-medium text-gray-800 hidden md:table-cell">{fmt(it.qtyOnHand * it.costPrice)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button title={isIS ? 'Færsla inn' : 'Stock in'} onClick={() => setMv({ open: true, itemId: it.id, type: 'in', qty: '', reference: '', note: '', date: todayISO() })} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600">
                              <TrendingUp className="w-4 h-4" />
                            </button>
                            <button title={isIS ? 'Færsla út' : 'Stock out'} onClick={() => setMv({ open: true, itemId: it.id, type: 'out', qty: '', reference: '', note: '', date: todayISO() })} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500">
                              <TrendingDown className="w-4 h-4" />
                            </button>
                            <button title={isIS ? 'Saga' : 'History'} onClick={() => setHistoryId(historyId === it.id ? null : it.id)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500">
                              {historyId === it.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                            <button onClick={() => setModal({ open: true, item: { ...it } })} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => deleteItem(it.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {historyId === it.id && (
                        <tr key={`hist-${it.id}`}>
                          <td colSpan={6} className="bg-gray-50 px-4 py-3">
                            <p className="text-xs font-semibold text-gray-500 mb-2">{isIS ? 'Hreyfingasaga' : 'Movement history'}</p>
                            {itemHistory.length === 0 ? (
                              <p className="text-xs text-gray-400">{isIS ? 'Engar hreyfingar' : 'No movements yet'}</p>
                            ) : (
                              <div className="space-y-1">
                                {itemHistory.map(m => (
                                  <div key={m.id} className="flex items-center gap-3 text-xs">
                                    <span className="text-gray-400 w-20">{m.date}</span>
                                    <span className={`font-semibold ${mvColor(m.type)} w-14`}>{mvLabel(m.type)}</span>
                                    <span className="font-medium text-gray-800">{m.type === 'out' ? '-' : '+'}{m.qty} {it.unit}</span>
                                    {m.reference && <span className="text-gray-400">{m.reference}</span>}
                                    {m.note && <span className="text-gray-400 italic">{m.note}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add/Edit Item Modal ──────────────────────────────── */}
      {modal.open && modal.item && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full md:max-w-xl md:rounded-2xl rounded-t-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
              <h2 className="font-semibold text-gray-900">{modal.item.id ? (isIS ? 'Breyta hlut' : 'Edit item') : (isIS ? 'Nýr hlutur' : 'New item')}</h2>
              <button onClick={() => setModal({ open: false })}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS ? 'Nafn' : 'Item name'} *</label>
                  <input className={inp} value={modal.item.name ?? ''} onChange={e => setModal(m => ({ ...m, item: { ...m.item!, name: e.target.value } }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">SKU / {isIS ? 'Vörukóði' : 'Item code'}</label>
                  <input className={inp} value={modal.item.sku ?? ''} onChange={e => setModal(m => ({ ...m, item: { ...m.item!, sku: e.target.value } }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS ? 'Flokkur' : 'Category'}</label>
                  <select className={sel} value={modal.item.category ?? ''} onChange={e => setModal(m => ({ ...m, item: { ...m.item!, category: e.target.value } }))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS ? 'Eining' : 'Unit'}</label>
                  <select className={sel} value={modal.item.unit ?? 'pcs'} onChange={e => setModal(m => ({ ...m, item: { ...m.item!, unit: e.target.value } }))}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS ? 'Magn á lager' : 'Qty on hand'}</label>
                  <input type="number" min="0" step="0.01" className={inp} value={modal.item.qtyOnHand ?? 0} onChange={e => setModal(m => ({ ...m, item: { ...m.item!, qtyOnHand: parseFloat(e.target.value) || 0 } }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS ? 'Endurpöntunarmörk' : 'Reorder point'}</label>
                  <input type="number" min="0" step="1" className={inp} value={modal.item.reorderPoint ?? 5} onChange={e => setModal(m => ({ ...m, item: { ...m.item!, reorderPoint: parseFloat(e.target.value) || 0 } }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS ? 'Kostnaðarverð (án VSK)' : 'Cost price (excl. VAT)'}</label>
                  <input type="number" min="0" step="0.01" className={inp} value={modal.item.costPrice ?? 0} onChange={e => setModal(m => ({ ...m, item: { ...m.item!, costPrice: parseFloat(e.target.value) || 0 } }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS ? 'Söluverð (án VSK)' : 'Sell price (excl. VAT)'}</label>
                  <input type="number" min="0" step="0.01" className={inp} value={modal.item.sellPrice ?? 0} onChange={e => setModal(m => ({ ...m, item: { ...m.item!, sellPrice: parseFloat(e.target.value) || 0 } }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">VSK %</label>
                  <select className={sel} value={modal.item.vatRate ?? cc.standardRate} onChange={e => setModal(m => ({ ...m, item: { ...m.item!, vatRate: parseFloat(e.target.value) } }))}>
                    {(cc.vatRates.length ? cc.vatRates : [24, 11, 0]).map(r => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS ? 'Staðsetning / hillupláss' : 'Location / shelf'}</label>
                  <input className={inp} value={modal.item.location ?? ''} onChange={e => setModal(m => ({ ...m, item: { ...m.item!, location: e.target.value } }))} placeholder="A-12" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS ? 'Birgir' : 'Supplier name'}</label>
                  <input className={inp} value={modal.item.supplierName ?? ''} onChange={e => setModal(m => ({ ...m, item: { ...m.item!, supplierName: e.target.value } }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS ? 'Birgjakóði' : 'Supplier code'}</label>
                  <input className={inp} value={modal.item.supplierCode ?? ''} onChange={e => setModal(m => ({ ...m, item: { ...m.item!, supplierCode: e.target.value } }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS ? 'Lýsing' : 'Description'}</label>
                  <input className={inp} value={modal.item.description ?? ''} onChange={e => setModal(m => ({ ...m, item: { ...m.item!, description: e.target.value } }))} />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setModal({ open: false })} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm">{isIS ? 'Hætta við' : 'Cancel'}</button>
                <button onClick={saveItem} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700">{isIS ? 'Vista' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Movement Modal ───────────────────────────────────── */}
      {mv.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full md:max-w-sm md:rounded-2xl rounded-t-2xl shadow-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-gray-900">{isIS ? 'Birgðafærsla' : 'Stock movement'}</h2>
              <button onClick={() => setMv(v => ({ ...v, open: false }))}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                {(['in', 'out', 'adjust', 'return'] as const).map(tp => (
                  <button key={tp} onClick={() => setMv(v => ({ ...v, type: tp }))} className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${mv.type === tp ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    {mvLabel(tp)}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{isIS ? 'Dagsetning' : 'Date'}</label>
                <input type="date" className={inp} value={mv.date} onChange={e => setMv(v => ({ ...v, date: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{isIS ? 'Magn' : 'Quantity'}</label>
                <input type="number" min="0" step="0.01" className={inp} value={mv.qty} onChange={e => setMv(v => ({ ...v, qty: e.target.value }))} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{isIS ? 'Tilvísun (pöntunarnr. o.fl.)' : 'Reference (PO, job no…)'}</label>
                <input className={inp} value={mv.reference} onChange={e => setMv(v => ({ ...v, reference: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{isIS ? 'Athugasemd' : 'Note'}</label>
                <input className={inp} value={mv.note} onChange={e => setMv(v => ({ ...v, note: e.target.value }))} />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setMv(v => ({ ...v, open: false }))} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm">{isIS ? 'Hætta við' : 'Cancel'}</button>
                <button onClick={saveMovement} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700">{isIS ? 'Vista' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CSV Import Modal ─────────────────────────────────── */}
      {importOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl shadow-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-gray-900">{isIS ? 'Innflutningur frá birgi' : 'Import from supplier'}</h2>
              <button onClick={() => setImportOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 space-y-1">
                <p className="font-semibold">{isIS ? 'CSV dálkar (dæmi):' : 'Expected CSV columns (example):'}</p>
                <code className="block font-mono">name, sku, category, unit, price, qty, reorder, supplier, currency, vat</code>
                <p>{isIS ? 'Ef hlutur er til (sama SKU) uppfærist aðeins verð.' : 'If item already exists (same SKU), only price is updated.'}</p>
              </div>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-blue-300 rounded-xl p-8 cursor-pointer hover:bg-blue-50 transition-colors">
                <Upload className="w-8 h-8 text-blue-400 mb-2" />
                <span className="text-sm font-medium text-gray-700">{isIS ? 'Velja CSV skrá' : 'Choose CSV file'}</span>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={handleCSV} />
              </label>
              <button onClick={() => setImportOpen(false)} className="w-full border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm">{isIS ? 'Hætta við' : 'Cancel'}</button>
            </div>
          </div>
        </div>
      )}
      <PlanLimitModal
        open={limitModal} onClose={() => setLimitModal(false)}
        limitText="You've reached 20 stock items on the Free plan."
        limitTextIs="Þú hefur náð 20 birgðahlutum á Free plani."
      />
    </div>
  );
}
