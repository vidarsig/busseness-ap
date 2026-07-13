import { useState, useRef, useMemo } from 'react';
import { Plus, Pencil, Trash2, X, Upload, Search, Users, Truck } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Customer, Supplier, Currency } from '../types';

type Tab = 'customers' | 'suppliers';

function newId(p: string) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }
function nowISO() { return new Date().toISOString(); }

// Read a CSV / Excel / text file into a rows[][] grid (first row = headers).
async function fileToRows(file: File): Promise<string[][]> {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return (XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][])
      .map(r => r.map(c => (c == null ? '' : String(c))));
  }
  const text = await file.text();
  return text.split(/\r?\n/).filter(Boolean).map(line => line.split(/[;,]/));
}

export default function Contacts() {
  const { data, dispatch, lang, cc } = useApp();
  const isIS = lang === 'is';
  const T = (is: string, en: string) => (isIS ? is : en);
  const [tab, setTab] = useState<Tab>('customers');
  const [search, setSearch] = useState('');
  const [custModal, setCustModal] = useState<{ open: boolean; item?: Customer }>({ open: false });
  const [suppModal, setSuppModal] = useState<{ open: boolean; item?: Supplier }>({ open: false });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const customers = data.customers ?? [];
  const suppliers = data.suppliers ?? [];

  const shownCustomers = useMemo(() => customers
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [customers, search]);
  const shownSuppliers = useMemo(() => suppliers
    .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [suppliers, search]);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await fileToRows(file);
      if (rows.length < 2) { alert(T('Skráin lítur út fyrir að vera tóm', 'File appears to be empty')); return; }
      const headers = rows[0].map(h => h.trim().toLowerCase());
      const now = nowISO();
      let count = 0;
      if (tab === 'customers') {
        const toAdd: Customer[] = [];
        const existing = new Set(customers.map(c => c.name.toLowerCase()));
        for (let i = 1; i < rows.length; i++) {
          const g = (k: string) => (rows[i][headers.indexOf(k)] ?? '').toString().trim();
          const name = g('name') || g('nafn') || g('customer') || g('viðskiptavinur');
          if (!name || existing.has(name.toLowerCase())) continue;
          existing.add(name.toLowerCase());
          toAdd.push({
            id: newId('cust'), name,
            kennitala: g('kennitala') || g('ssn') || g('id'),
            address: g('address') || g('heimilisfang') || g('adr'),
            postalCode: g('postalcode') || g('zip') || g('postnr'),
            city: g('city') || g('borg') || g('stadur'),
            email: g('email') || g('netfang'), phone: g('phone') || g('simi') || g('sími'),
            notes: g('notes') || g('athugasemd'), createdAt: now,
          });
          count++;
        }
        if (toAdd.length) dispatch({ type: 'ADD_CUSTOMERS', payload: toAdd });
      } else {
        const toAdd: Supplier[] = [];
        const existing = new Set(suppliers.map(s => s.name.toLowerCase()));
        for (let i = 1; i < rows.length; i++) {
          const g = (k: string) => (rows[i][headers.indexOf(k)] ?? '').toString().trim();
          const name = g('name') || g('nafn') || g('supplier') || g('birgir');
          if (!name || existing.has(name.toLowerCase())) continue;
          existing.add(name.toLowerCase());
          toAdd.push({
            id: newId('sup'), name,
            contactName: g('contact') || g('contactname') || g('tengiliður'),
            email: g('email') || g('netfang'), phone: g('phone') || g('simi') || g('sími'),
            address: g('address') || g('heimilisfang'),
            vatNumber: g('vat') || g('vatnumber') || g('vsknr') || g('kennitala'),
            currency: (g('currency') || cc.currency) as Currency,
            notes: g('notes') || g('athugasemd'), createdAt: now,
          });
          count++;
        }
        if (toAdd.length) dispatch({ type: 'ADD_SUPPLIERS', payload: toAdd });
      }
      alert(`${count} ${T('flutt inn', 'imported')}`);
    } catch {
      alert(T('Gat ekki lesið skrána', 'Could not read the file'));
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  function doDelete() {
    if (!deleteId) return;
    dispatch(tab === 'customers'
      ? { type: 'DELETE_CUSTOMER', payload: deleteId }
      : { type: 'DELETE_SUPPLIER', payload: deleteId });
    setDeleteId(null);
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">{T('Tengiliðir', 'Contacts')}</h1>
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Upload className="w-4 h-4" />{T('Innflutningur', 'Import')}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={handleImport} />
          <button onClick={() => tab === 'customers' ? setCustModal({ open: true }) : setSuppModal({ open: true })}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">{T('Bæta við', 'Add')}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4 w-fit">
        <button onClick={() => setTab('customers')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${tab === 'customers' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
          <Users className="w-4 h-4" />{T('Viðskiptavinir', 'Customers')} ({customers.length})
        </button>
        <button onClick={() => setTab('suppliers')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${tab === 'suppliers' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
          <Truck className="w-4 h-4" />{T('Birgjar', 'Suppliers')} ({suppliers.length})
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input className={`${inp} pl-9`} placeholder={T('Leita eftir nafni…', 'Search by name…')}
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Info about import columns */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 mb-4">
        <span className="font-semibold">{T('Innflutningur — Excel eða CSV, fyrsta lína = dálkaheiti:', 'Import — Excel or CSV, first row = column headers:')}</span>{' '}
        {tab === 'customers'
          ? <code className="font-mono">name, kennitala, address, postalcode, city, email, phone</code>
          : <code className="font-mono">name, contact, email, phone, address, vat, currency</code>}
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
        {(tab === 'customers' ? shownCustomers : shownSuppliers).length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">{T('Enginn tengiliður enn', 'No contacts yet')}</div>
        ) : tab === 'customers' ? shownCustomers.map(c => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-800 truncate">{c.name}</div>
              <div className="text-xs text-gray-400 truncate">
                {[c.kennitala, c.email, c.phone, [c.address, c.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button onClick={() => setCustModal({ open: true, item: c })} className="text-gray-400 hover:text-blue-600 p-1.5"><Pencil className="w-4 h-4" /></button>
            <button onClick={() => setDeleteId(c.id)} className="text-gray-400 hover:text-red-600 p-1.5"><Trash2 className="w-4 h-4" /></button>
          </div>
        )) : shownSuppliers.map(s => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-800 truncate">{s.name}</div>
              <div className="text-xs text-gray-400 truncate">
                {[s.contactName, s.email, s.phone, s.vatNumber].filter(Boolean).join(' · ')}
              </div>
            </div>
            <button onClick={() => setSuppModal({ open: true, item: s })} className="text-gray-400 hover:text-blue-600 p-1.5"><Pencil className="w-4 h-4" /></button>
            <button onClick={() => setDeleteId(s.id)} className="text-gray-400 hover:text-red-600 p-1.5"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>

      {/* Customer modal */}
      {custModal.open && <CustomerModal initial={custModal.item} onClose={() => setCustModal({ open: false })}
        onSave={(c) => { dispatch(custModal.item ? { type: 'UPDATE_CUSTOMER', payload: c } : { type: 'ADD_CUSTOMER', payload: c }); setCustModal({ open: false }); }} />}
      {/* Supplier modal */}
      {suppModal.open && <SupplierModal initial={suppModal.item} onClose={() => setSuppModal({ open: false })}
        onSave={(s) => { dispatch(suppModal.item ? { type: 'UPDATE_SUPPLIER', payload: s } : { type: 'ADD_SUPPLIER', payload: s }); setSuppModal({ open: false }); }} />}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold mb-2">{T('Eyða tengilið?', 'Delete contact?')}</h3>
            <p className="text-sm text-gray-600 mb-5">{T('Þetta er ekki hægt að afturkalla.', 'This cannot be undone.')}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-gray-300 py-2 rounded-xl text-sm">{T('Hætta við', 'Cancel')}</button>
              <button onClick={doDelete} className="flex-1 bg-red-600 text-white py-2 rounded-xl text-sm">{T('Eyða', 'Delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerModal({ initial, onSave, onClose }: { initial?: Customer; onSave: (c: Customer) => void; onClose: () => void }) {
  const { lang, cc } = useApp();
  const T = (is: string, en: string) => (lang === 'is' ? is : en);
  const [f, setF] = useState<Customer>(initial ?? { id: newId('cust'), name: '', createdAt: nowISO() });
  const set = <K extends keyof Customer>(k: K, v: Customer[K]) => setF(p => ({ ...p, [k]: v }));
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50">
      <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] overflow-y-auto p-5 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-gray-900">{initial ? T('Breyta viðskiptavini', 'Edit customer') : T('Nýr viðskiptavinur', 'New customer')}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div><label className={lbl}>{T('Nafn', 'Name')} *</label><input className={inp} value={f.name} onChange={e => set('name', e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>{cc.companyIdLabel || 'Kennitala'}</label><input className={inp} value={f.kennitala ?? ''} onChange={e => set('kennitala', e.target.value)} /></div>
          <div><label className={lbl}>{T('Sími', 'Phone')}</label><input className={inp} value={f.phone ?? ''} onChange={e => set('phone', e.target.value)} /></div>
        </div>
        <div><label className={lbl}>{T('Netfang', 'Email')}</label><input className={inp} value={f.email ?? ''} onChange={e => set('email', e.target.value)} /></div>
        <div><label className={lbl}>{T('Heimilisfang', 'Address')}</label><input className={inp} value={f.address ?? ''} onChange={e => set('address', e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>{T('Póstnúmer', 'Postal code')}</label><input className={inp} value={f.postalCode ?? ''} onChange={e => set('postalCode', e.target.value)} /></div>
          <div><label className={lbl}>{T('Staður', 'City')}</label><input className={inp} value={f.city ?? ''} onChange={e => set('city', e.target.value)} /></div>
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm">{T('Hætta við', 'Cancel')}</button>
          <button onClick={() => f.name.trim() && onSave(f)} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm">{T('Vista', 'Save')}</button>
        </div>
      </div>
    </div>
  );
}

function SupplierModal({ initial, onSave, onClose }: { initial?: Supplier; onSave: (s: Supplier) => void; onClose: () => void }) {
  const { lang, cc } = useApp();
  const T = (is: string, en: string) => (lang === 'is' ? is : en);
  const [f, setF] = useState<Supplier>(initial ?? { id: newId('sup'), name: '', currency: cc.currency as Currency, createdAt: nowISO() });
  const set = <K extends keyof Supplier>(k: K, v: Supplier[K]) => setF(p => ({ ...p, [k]: v }));
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50">
      <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] overflow-y-auto p-5 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-gray-900">{initial ? T('Breyta birgi', 'Edit supplier') : T('Nýr birgir', 'New supplier')}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div><label className={lbl}>{T('Nafn', 'Name')} *</label><input className={inp} value={f.name} onChange={e => set('name', e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl}>{T('Tengiliður', 'Contact')}</label><input className={inp} value={f.contactName ?? ''} onChange={e => set('contactName', e.target.value)} /></div>
          <div><label className={lbl}>{T('Sími', 'Phone')}</label><input className={inp} value={f.phone ?? ''} onChange={e => set('phone', e.target.value)} /></div>
        </div>
        <div><label className={lbl}>{T('Netfang', 'Email')}</label><input className={inp} value={f.email ?? ''} onChange={e => set('email', e.target.value)} /></div>
        <div><label className={lbl}>{T('Heimilisfang', 'Address')}</label><input className={inp} value={f.address ?? ''} onChange={e => set('address', e.target.value)} /></div>
        <div><label className={lbl}>{cc.vatNumberLabel || 'VSK-númer'}</label><input className={inp} value={f.vatNumber ?? ''} onChange={e => set('vatNumber', e.target.value)} /></div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm">{T('Hætta við', 'Cancel')}</button>
          <button onClick={() => f.name.trim() && onSave(f)} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm">{T('Vista', 'Save')}</button>
        </div>
      </div>
    </div>
  );
}
