import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Invoice } from '../types';
import { todayISO, formatCurrency } from '../utils/formatters';

function newId() { return `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }
function lineId() { return `ln_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }
function rowId() { return `br_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }
function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

type Kind = 'work' | 'rent' | 'custom';
interface Row { id: string; name: string; description: string; gross: string; kind: Kind; rate: number; }

// Bulk invoicing (going-forward): raise many invoices in one pass. Each row is one
// invoice; the owner enters the GROSS amount and the app EXTRACTS the VAT (net =
// gross ÷ (1+rate)), with the rate set automatically by type — Work = the standard
// rate, Rent = 0%, or a Custom rate. Numbers run sequentially off invoiceLastNumber,
// and everything is created as a DRAFT so nothing is issued/booked until reviewed.
export default function BulkInvoiceModal({ onClose }: { onClose: () => void }) {
  const { data, dispatch, lang, cc } = useApp();
  const s = data.settings;
  const workRate = cc.isUSA ? s.salesTaxRate : cc.standardRate;
  const cur = s.defaultCurrency;

  const emptyRow = (): Row => ({ id: rowId(), name: '', description: '', gross: '', kind: 'work', rate: cc.standardRate });
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [date, setDate] = useState(todayISO());
  const [dueDays, setDueDays] = useState(30);
  const [created, setCreated] = useState(0);

  const rateOf = (r: Row) => r.kind === 'rent' ? 0 : r.kind === 'work' ? workRate : r.rate;
  const grossOf = (r: Row) => parseFloat(r.gross) || 0;
  const netOf = (r: Row) => grossOf(r) / (1 + rateOf(r) / 100);
  const vatOf = (r: Row) => grossOf(r) - netOf(r);

  const valid = rows.filter(r => r.name.trim() && grossOf(r) > 0);
  const totalGross = valid.reduce((a, r) => a + grossOf(r), 0);
  const totalVat = valid.reduce((a, r) => a + vatOf(r), 0);

  const money = (n: number) => formatCurrency(Math.round(n), cur, lang);
  const setRow = (id: string, patch: Partial<Row>) => setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  const addRow = () => setRows(rs => [...rs, emptyRow()]);
  const delRow = (id: string) => setRows(rs => rs.length > 1 ? rs.filter(r => r.id !== id) : rs);

  const customerNames = Array.from(new Set((data.customers ?? []).map(c => c.name).filter(Boolean)));

  function create() {
    if (!valid.length) return;
    const defaultDesc = (r: Row) => r.kind === 'rent'
      ? (lang === 'is' ? 'Leiga' : 'Rent')
      : (lang === 'is' ? 'Verk og þjónusta' : 'Work and services');
    let seq = s.invoiceLastNumber;
    const addedNames: string[] = [];
    valid.forEach(r => {
      seq += 1;
      const rate = rateOf(r);
      const net = grossOf(r) / (1 + rate / 100);
      const existing = (data.customers ?? []).find(c => c.name.trim().toLowerCase() === r.name.trim().toLowerCase());
      const inv: Invoice = {
        id: newId(),
        type: 'invoice',
        number: `${s.invoicePrefix}${String(seq).padStart(4, '0')}`,
        date,
        dueDate: addDays(date, dueDays),
        customer: existing
          ? { name: existing.name, kennitala: existing.kennitala, address: existing.address, postalCode: existing.postalCode, city: existing.city, email: existing.email, phone: existing.phone }
          : { name: r.name.trim() },
        lines: [{ id: lineId(), description: r.description.trim() || defaultDesc(r), quantity: 1, unitPrice: net, vatRate: rate }],
        notes: '',
        status: 'draft',
        currency: cur,
        eurToIskRate: s.exchangeRates.EUR,
      };
      dispatch({ type: 'ADD_INVOICE', payload: inv });
      const key = r.name.trim().toLowerCase();
      if (!existing && !addedNames.includes(key)) {
        addedNames.push(key);
        dispatch({ type: 'ADD_CUSTOMER', payload: { id: `cust_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: r.name.trim(), createdAt: new Date().toISOString() } });
      }
    });
    dispatch({ type: 'UPDATE_SETTINGS', payload: { invoiceLastNumber: seq } });
    setCreated(valid.length);
  }

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const kindBtn = (r: Row, k: Kind, label: string) => (
    <button type="button" onClick={() => setRow(r.id, { kind: k })}
      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border ${r.kind === k ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50">
      <div className="bg-white w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-gray-900">{lang === 'is' ? 'Fjöldareikningar' : 'Bulk invoices'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5" /></button>
        </div>

        {created > 0 ? (
          <div className="p-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto text-xl">✓</div>
            <p className="text-gray-800 font-medium">
              {lang === 'is' ? `${created} reikningar búnir til sem drög.` : `${created} invoices created as drafts.`}
            </p>
            <p className="text-xs text-gray-500">
              {lang === 'is' ? 'Þeir bíða í listanum — yfirferð og sendu þegar þú vilt.' : 'They are waiting in the list — review and send when ready.'}
            </p>
            <button onClick={onClose} className="mt-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700">
              {lang === 'is' ? 'Loka' : 'Done'}
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <p className="text-xs text-gray-500">
              {lang === 'is'
                ? `Sláðu inn upphæð MEÐ ${cc.vatTerm} — forritið dregur ${cc.vatTerm} út. Hver lína verður einn reikningur (drög).`
                : `Enter the amount INCLUDING ${cc.vatTerm} — the app extracts the ${cc.vatTerm}. Each line becomes one invoice (draft).`}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{lang === 'is' ? 'Dagsetning' : 'Date'}</label>
                <input type="date" className={`${inp} w-full`} value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{lang === 'is' ? 'Gjalddagi eftir (daga)' : 'Due in (days)'}</label>
                <input type="number" min={0} className={`${inp} w-full`} value={dueDays} onChange={e => setDueDays(parseInt(e.target.value) || 0)} />
              </div>
            </div>

            <datalist id="bulk-customers">
              {customerNames.map(n => <option key={n} value={n} />)}
            </datalist>

            <div className="space-y-3">
              {rows.map((r, i) => (
                <div key={r.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                    <input list="bulk-customers" className={`${inp} flex-1`} placeholder={lang === 'is' ? 'Viðskiptavinur' : 'Customer'}
                      value={r.name} onChange={e => setRow(r.id, { name: e.target.value })} />
                    <button type="button" onClick={() => delRow(r.id)} className="text-gray-300 hover:text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <input className={`${inp} w-full`} placeholder={lang === 'is' ? 'Lýsing (valfrjáls)' : 'Description (optional)'}
                    value={r.description} onChange={e => setRow(r.id, { description: e.target.value })} />
                  <div className="flex flex-wrap items-center gap-2">
                    {kindBtn(r, 'work', lang === 'is' ? `Verk (${workRate}%)` : `Work (${workRate}%)`)}
                    {kindBtn(r, 'rent', lang === 'is' ? 'Leiga (0%)' : 'Rent (0%)')}
                    {kindBtn(r, 'custom', lang === 'is' ? 'Annað' : 'Custom')}
                    {r.kind === 'custom' && (
                      <select className={inp} value={r.rate} onChange={e => setRow(r.id, { rate: parseFloat(e.target.value) })}>
                        {(cc.isUSA ? [s.salesTaxRate, 0] : cc.vatRates).filter((v, idx, a) => a.indexOf(v) === idx).map(v => <option key={v} value={v}>{v}%</option>)}
                      </select>
                    )}
                    <div className="flex items-center gap-1 ml-auto">
                      <input type="number" inputMode="decimal" className={`${inp} w-32 text-right`} placeholder={lang === 'is' ? `Upphæð m. ${cc.vatTerm}` : `Amt incl. ${cc.vatTerm}`}
                        value={r.gross} onChange={e => setRow(r.id, { gross: e.target.value })} />
                    </div>
                  </div>
                  {grossOf(r) > 0 && (
                    <p className="text-xs text-gray-500 text-right">
                      {lang === 'is' ? 'Nettó' : 'Net'} {money(netOf(r))} · {cc.vatTerm} {money(vatOf(r))}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <button type="button" onClick={addRow} className="flex items-center gap-1.5 text-sm text-blue-600 font-medium hover:text-blue-700">
              <Plus className="w-4 h-4" /> {lang === 'is' ? 'Bæta við línu' : 'Add row'}
            </button>

            <div className="bg-gray-50 rounded-xl p-3 text-sm flex items-center justify-between">
              <span className="text-gray-600">
                {valid.length} {lang === 'is' ? 'reikningar' : 'invoices'} · {cc.vatTerm} {money(totalVat)}
              </span>
              <span className="font-semibold text-gray-900">{money(totalGross)}</span>
            </div>

            <div className="flex gap-3 pt-1 pb-2">
              <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-xl text-sm font-medium hover:bg-gray-50">
                {lang === 'is' ? 'Hætta við' : 'Cancel'}
              </button>
              <button type="button" onClick={create} disabled={!valid.length}
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300">
                {lang === 'is' ? `Búa til ${valid.length} reikninga` : `Create ${valid.length} invoices`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
