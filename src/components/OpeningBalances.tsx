import { useState } from 'react';
import { Landmark, Plus, Trash2, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Transaction, Invoice } from '../types';
import { todayISO } from '../utils/formatters';
import NumberInput from './NumberInput';

interface OpenInvoice {
  id: string;
  number: string;
  customer: string;
  amount: number;   // total still owed, incl. VAT
  date: string;
  dueDate: string;
}

function uid(p: string) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

// Migration Stage 2 — opening balances at a mid-year switch to Jobboks:
//  • opening cash/bank balance → one non-profit "transfer" entry, so the starting
//    cash is on the books without distorting profit,
//  • unpaid customer invoices (receivables) → real 'sent' invoices, so money owed
//    from before the switch is still tracked and collectable.
// Nothing is saved until the owner reviews and taps Apply.
export default function OpeningBalances() {
  const { data, dispatch, lang } = useApp();
  const is = lang === 'is';
  const [open, setOpen] = useState(false);
  const [switchDate, setSwitchDate] = useState(todayISO());
  const [cash, setCash] = useState(0);
  const [invoices, setInvoices] = useState<OpenInvoice[]>([]);
  const [savedMsg, setSavedMsg] = useState('');

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  function addRow() {
    setInvoices(v => [...v, { id: uid('ob'), number: '', customer: '', amount: 0, date: switchDate, dueDate: switchDate }]);
  }
  function setRow(id: string, patch: Partial<OpenInvoice>) {
    setInvoices(v => v.map(r => r.id === id ? { ...r, ...patch } : r));
  }
  function removeRow(id: string) {
    setInvoices(v => v.filter(r => r.id !== id));
  }

  function apply() {
    const cur = data.settings.defaultCurrency;
    const rate = data.settings.exchangeRates.EUR;
    let cashCount = 0;
    let invCount = 0;

    if (cash > 0) {
      const tx: Transaction = {
        id: uid('tx'),
        date: switchDate,
        description: is ? 'Stofnstaða við flutning' : 'Opening balance (migration)',
        category: 'ekki_rekstur',
        type: 'transfer',
        amount: cash,
        currency: cur,
        eurToIskRate: rate,
        vatRate: 0,
      };
      dispatch({ type: 'ADD_TRANSACTION', payload: tx });
      cashCount = 1;
    }

    invoices.filter(r => r.customer.trim() && r.amount > 0).forEach((r, i) => {
      const inv: Invoice = {
        id: uid('inv'),
        number: r.number.trim() || `OB-${i + 1}`,
        type: 'invoice',
        date: r.date,
        dueDate: r.dueDate,
        customer: { name: r.customer.trim(), kennitala: '', address: '', postalCode: '', city: '', email: '', phone: '' },
        lines: [{
          id: uid('il'),
          description: is ? 'Eldri ógreiddur reikningur (flutningur)' : 'Outstanding invoice (migration)',
          quantity: 1,
          unitPrice: r.amount,
          vatRate: 0, // amount is the total owed; VAT was accounted in the old system
        }],
        status: 'sent',
        currency: cur,
        eurToIskRate: rate,
      };
      dispatch({ type: 'ADD_INVOICE', payload: inv });
      invCount++;
    });

    if (cashCount === 0 && invCount === 0) {
      setSavedMsg(is ? 'Ekkert til að flytja inn — sláðu inn stofnstöðu eða reikning.' : 'Nothing to bring in — enter a balance or an invoice.');
      return;
    }
    setCash(0);
    setInvoices([]);
    setSavedMsg(is
      ? `Flutt inn: ${cashCount ? 'stofnstaða' : ''}${cashCount && invCount ? ' + ' : ''}${invCount ? `${invCount} reikningur/-ar` : ''}.`
      : `Imported: ${cashCount ? 'opening cash' : ''}${cashCount && invCount ? ' + ' : ''}${invCount ? `${invCount} invoice(s)` : ''}.`);
    setTimeout(() => setSavedMsg(''), 6000);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 px-4 py-3 text-left">
        <Landmark className="w-5 h-5 text-blue-600 flex-shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-gray-800">{is ? 'Stofnstöður (flutningur)' : 'Opening balances (migration)'}</div>
          <div className="text-xs text-gray-500">{is ? 'Þegar þú skiptir yfir á miðju ári — reiðufé + ógreiddir reikningar' : 'When you switch mid-year — starting cash + unpaid invoices'}</div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
          <div className="flex flex-wrap gap-4">
            <label className="text-sm">
              <span className="block text-xs text-gray-500 mb-1">{is ? 'Dagsetning flutnings' : 'Switch-over date'}</span>
              <input type="date" value={switchDate} onChange={e => setSwitchDate(e.target.value)} className={inp} />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-gray-500 mb-1">{is ? `Stofnstaða reiðufjár (${data.settings.defaultCurrency})` : `Opening cash balance (${data.settings.defaultCurrency})`}</span>
              <NumberInput value={cash} onValue={setCash} className={`${inp} w-40 text-right`} />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">{is ? 'Ógreiddir reikningar (skuld viðskiptavina)' : 'Unpaid invoices (money owed to you)'}</span>
              <button onClick={addRow} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                <Plus className="w-3.5 h-3.5" /> {is ? 'Bæta við' : 'Add'}
              </button>
            </div>
            {invoices.length === 0 && (
              <p className="text-xs text-gray-400">{is ? 'Engir — bættu við ef viðskiptavinir skulda þér frá fyrra kerfi.' : 'None — add any invoices customers still owe you from your old system.'}</p>
            )}
            <div className="space-y-2">
              {invoices.map(r => (
                <div key={r.id} className="flex flex-wrap items-end gap-2 bg-gray-50 rounded-lg p-2">
                  <label className="text-xs">
                    <span className="block text-gray-500 mb-0.5">{is ? 'Nr.' : 'No.'}</span>
                    <input value={r.number} onChange={e => setRow(r.id, { number: e.target.value })} placeholder="—" className={`${inp} w-20`} />
                  </label>
                  <label className="text-xs flex-1 min-w-[140px]">
                    <span className="block text-gray-500 mb-0.5">{is ? 'Viðskiptavinur' : 'Customer'}</span>
                    <input value={r.customer} onChange={e => setRow(r.id, { customer: e.target.value })} className={`${inp} w-full`} />
                  </label>
                  <label className="text-xs">
                    <span className="block text-gray-500 mb-0.5">{is ? 'Upphæð' : 'Amount'}</span>
                    <NumberInput value={r.amount} onValue={n => setRow(r.id, { amount: n })} className={`${inp} w-28 text-right`} />
                  </label>
                  <label className="text-xs">
                    <span className="block text-gray-500 mb-0.5">{is ? 'Gjalddagi' : 'Due'}</span>
                    <input type="date" value={r.dueDate} onChange={e => setRow(r.id, { dueDate: e.target.value })} className={inp} />
                  </label>
                  <button onClick={() => removeRow(r.id)} className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={apply} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold">
              <Check className="w-4 h-4" /> {is ? 'Flytja inn stofnstöður' : 'Import opening balances'}
            </button>
            {savedMsg && <span className="text-sm text-green-700">{savedMsg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
