import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Printer, X, CheckCircle, Send, PlusCircle, MinusCircle, Mail, FileText, ArrowRightLeft, RotateCcw, Lock } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Invoice, InvoiceLine, Currency } from '../types';
import { formatISK, formatCurrency, formatDate, todayISO } from '../utils/formatters';
import { exportPDF } from '../utils/exports';
import { isInvoiceLimitReached } from '../utils/planLimits';
import PlanLimitModal from './PlanLimitModal';

function newId() { return `inv_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }
function lineId() { return `ln_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const statusColor: Record<Invoice['status'], string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
};

function InvoiceModal({ initial, defaultType = 'invoice', onSave, onClose }: {
  initial?: Invoice; defaultType?: 'invoice' | 'quote'; onSave: (inv: Invoice) => void; onClose: () => void;
}) {
  const { data, t, cc, lang } = useApp();
  const nextInvNum = `${data.settings.invoicePrefix}${String(data.settings.invoiceLastNumber + 1).padStart(4, '0')}`;
  const nextQuoteNum = `T${String(data.settings.quoteLastNumber + 1).padStart(4, '0')}`;

  const [form, setForm] = useState<Invoice>(initial ?? {
    id: newId(),
    type: defaultType,
    number: defaultType === 'quote' ? nextQuoteNum : nextInvNum,
    date: todayISO(),
    dueDate: addDays(todayISO(), defaultType === 'quote' ? 14 : 30),
    customer: { name: '', kennitala: '', address: '', postalCode: '', city: '', email: '', phone: '' },
    lines: [{ id: lineId(), description: '', quantity: 1, unitPrice: 0, vatRate: cc.standardRate }],
    notes: '',
    status: 'draft',
    currency: data.settings.defaultCurrency,
    eurToIskRate: data.settings.exchangeRates.EUR,
  });

  const setCust = <K extends keyof Invoice['customer']>(k: K, v: Invoice['customer'][K]) =>
    setForm(f => ({ ...f, customer: { ...f.customer, [k]: v } }));
  const setLine = (id: string, k: keyof InvoiceLine, v: unknown) =>
    setForm(f => ({ ...f, lines: f.lines.map(l => l.id === id ? { ...l, [k]: v } : l) }));
  const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, { id: lineId(), description: '', quantity: 1, unitPrice: 0, vatRate: cc.standardRate }] }));
  const removeLine = (id: string) => setForm(f => ({ ...f, lines: f.lines.filter(l => l.id !== id) }));

  function toggleType() {
    const newType = form.type === 'invoice' ? 'quote' : 'invoice';
    setForm(f => ({
      ...f,
      type: newType,
      number: newType === 'quote' ? nextQuoteNum : nextInvNum,
      dueDate: addDays(form.date, newType === 'quote' ? 14 : 30),
    }));
  }

  const totals = useMemo(() => {
    let subtotal = 0, vatTotal = 0;
    form.lines.forEach(l => {
      const base = l.quantity * l.unitPrice;
      subtotal += base;
      vatTotal += base * (l.vatRate / 100);
    });
    return { subtotal, vatTotal, total: subtotal + vatTotal };
  }, [form.lines]);

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const isQuote = form.type === 'quote';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50">
      <div className="bg-white w-full md:max-w-3xl md:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-gray-900">
              {initial ? (isQuote ? t('editQuote') : t('editInvoice')) : (isQuote ? t('addQuote') : t('addInvoice'))}
            </h2>
            {!initial && (
              <button onClick={toggleType}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-medium transition-colors
                  ${isQuote ? 'border-purple-300 bg-purple-50 text-purple-700' : 'border-blue-300 bg-blue-50 text-blue-700'}`}>
                <ArrowRightLeft className="w-3 h-3" />
                {isQuote ? t('quote') : t('invoice')}
              </button>
            )}
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isQuote ? t('quoteNumber') : t('invoiceNumber')}
              </label>
              <input className={`${inp} w-full bg-gray-100 text-gray-500 cursor-not-allowed`} value={form.number} readOnly title={lang === 'is' ? 'Númer er sjálfvirkt (stilltu í Stillingum)' : 'Number is assigned automatically (set in Settings)'} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('invoiceDate')}</label>
              <input type="date" className={`${inp} w-full`} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isQuote ? t('validUntil') : t('dueDate')}
              </label>
              <input type="date" className={`${inp} w-full`} value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('currency')}</label>
              <select className={`${inp} w-full`} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value as Currency }))}>
                {(['ISK','EUR','USD','GBP','DKK','NOK','SEK','AUD','CAD','NZD'] as Currency[]).map(c =>
                  <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Customer */}
          <div className="border border-gray-200 rounded-xl p-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-3">{t('customer')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('customerName')} *</label>
                <input className={`${inp} w-full`} value={form.customer.name} onChange={e => setCust('name', e.target.value)} required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('customerKennitala')}</label>
                <input className={`${inp} w-full`} value={form.customer.kennitala ?? ''} onChange={e => setCust('kennitala', e.target.value)} placeholder={cc.companyIdLabel} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('customerEmail')}</label>
                <input type="email" className={`${inp} w-full`} value={form.customer.email ?? ''} onChange={e => setCust('email', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t('customerAddress')}</label>
                <input className={`${inp} w-full`} value={form.customer.address ?? ''} onChange={e => setCust('address', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('postalCode')}</label>
                  <input className={`${inp} w-full`} value={form.customer.postalCode ?? ''} onChange={e => setCust('postalCode', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('city')}</label>
                  <input className={`${inp} w-full`} value={form.customer.city ?? ''} onChange={e => setCust('city', e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-gray-500 uppercase">{t('invoiceLines')}</h3>
            </div>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-xs text-gray-500 text-left">{t('description')}</th>
                    <th className="px-2 py-2 text-xs text-gray-500 text-right w-16">{t('quantity')}</th>
                    <th className="px-2 py-2 text-xs text-gray-500 text-right w-24">{t('unitPrice')}</th>
                    <th className="px-2 py-2 text-xs text-gray-500 text-right w-16">{cc.vatTerm}%</th>
                    <th className="px-2 py-2 text-xs text-gray-500 text-right w-24">{t('lineTotal')}</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {form.lines.map(line => (
                    <tr key={line.id}>
                      <td className="px-2 py-1.5">
                        <input className="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          value={line.description} onChange={e => setLine(line.id, 'description', e.target.value)} placeholder={t('description')} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                          value={line.quantity} onChange={e => setLine(line.id, 'quantity', parseFloat(e.target.value) || 0)} min={0} step="0.01" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                          value={line.unitPrice} onChange={e => setLine(line.id, 'unitPrice', parseFloat(e.target.value) || 0)} min={0} step="1" />
                      </td>
                      <td className="px-2 py-1.5">
                        <select className="w-full border border-gray-200 rounded px-1 py-1 text-xs focus:outline-none"
                          value={line.vatRate} onChange={e => setLine(line.id, 'vatRate', parseFloat(e.target.value))}>
                          {(cc.isUSA ? [data.settings.salesTaxRate, 0] : cc.vatRates)
                            .filter((r, i, arr) => arr.indexOf(r) === i)
                            .map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-right text-sm font-mono">
                        {formatCurrency(line.quantity * line.unitPrice * (1 + line.vatRate/100), form.currency)}
                      </td>
                      <td className="px-1">
                        <button onClick={() => removeLine(line.id)} className="text-gray-300 hover:text-red-500 p-0.5">
                          <MinusCircle className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-3 py-2 border-t border-gray-100">
                <button onClick={addLine} className="flex items-center gap-1 text-blue-600 text-xs hover:text-blue-700">
                  <PlusCircle className="w-3.5 h-3.5" /> {t('addLine')}
                </button>
              </div>
            </div>

            {/* Totals */}
            <div className="mt-3 bg-gray-50 rounded-xl p-3 text-sm space-y-1.5 max-w-xs ml-auto">
              <div className="flex justify-between text-gray-600">
                <span>{t('subtotal')}</span>
                <span className="font-mono">{formatCurrency(totals.subtotal, form.currency)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>{cc.vatTerm}</span>
                <span className="font-mono">{formatCurrency(totals.vatTotal, form.currency)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1.5">
                <span>{t('invoiceTotal')}</span>
                <span className="font-mono">{formatCurrency(totals.total, form.currency)}</span>
              </div>
              {form.currency !== 'ISK' && (
                <div className="flex justify-between text-blue-600 text-xs">
                  <span>ISK</span>
                  <span className="font-mono">{formatISK(totals.total * (data.settings.exchangeRates[form.currency as 'EUR'] ?? 1))}</span>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('invoiceNotes')}</label>
            <textarea className={`${inp} w-full`} rows={2} value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-xl text-sm">{t('cancel')}</button>
            <button onClick={() => onSave(form)} className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm font-medium">{t('save')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrintableInvoice({ inv }: { inv: Invoice }) {
  const { data, t, lang, cc } = useApp();
  const co = data.settings.company;
  const isQuote = inv.type === 'quote';
  const totals = inv.lines.reduce((acc, l) => {
    const base = l.quantity * l.unitPrice;
    const vat = base * (l.vatRate / 100);
    return { subtotal: acc.subtotal + base, vat: acc.vat + vat };
  }, { subtotal: 0, vat: 0 });

  return (
    <div className="print-only p-8 max-w-2xl mx-auto font-sans">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-bold">{co.name || t('appName')}</h1>
          {co.kennitala && <p className="text-sm text-gray-600">{cc.companyIdLabel}: {co.kennitala}</p>}
          {co.address && <p className="text-sm text-gray-600">{co.address}, {co.postalCode} {co.city}</p>}
          {co.vskNumber && <p className="text-sm text-gray-600">{cc.vatNumberLabel}: {co.vskNumber}</p>}
        </div>
        <div className="text-right">
          <h2 className="text-xl font-bold text-blue-900">{isQuote ? t('quote') : t('invoice')}</h2>
          <p className="font-mono font-bold">{inv.number}</p>
          <p className="text-sm">{t('invoiceDate')}: {formatDate(inv.date, lang)}</p>
          <p className="text-sm">{isQuote ? t('validUntil') : t('dueDate')}: {formatDate(inv.dueDate, lang)}</p>
        </div>
      </div>
      <div className="border border-gray-200 rounded p-4 mb-6">
        <p className="text-xs font-bold uppercase text-gray-500 mb-1">{t('customer')}</p>
        <p className="font-semibold">{inv.customer.name}</p>
        {inv.customer.kennitala && <p className="text-sm">{cc.companyIdLabel}: {inv.customer.kennitala}</p>}
        {inv.customer.address && <p className="text-sm">{inv.customer.address}{inv.customer.postalCode ? `, ${inv.customer.postalCode}` : ''} {inv.customer.city}</p>}
        {inv.customer.email && <p className="text-sm">{inv.customer.email}</p>}
      </div>
      <table className="w-full mb-6 text-sm">
        <thead><tr className="border-b-2 border-gray-800">
          <th className="text-left py-2">{t('description')}</th>
          <th className="text-right py-2 w-16">{t('quantity')}</th>
          <th className="text-right py-2 w-24">{t('unitPrice')}</th>
          <th className="text-right py-2 w-16">{cc.vatTerm}%</th>
          <th className="text-right py-2 w-28">{t('lineTotal')}</th>
        </tr></thead>
        <tbody>
          {inv.lines.map(l => (
            <tr key={l.id} className="border-b border-gray-100">
              <td className="py-2">{l.description}</td>
              <td className="py-2 text-right">{l.quantity}</td>
              <td className="py-2 text-right font-mono">{formatCurrency(l.unitPrice, inv.currency)}</td>
              <td className="py-2 text-right">{l.vatRate}%</td>
              <td className="py-2 text-right font-mono">{formatCurrency(l.quantity * l.unitPrice * (1 + l.vatRate/100), inv.currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={4} className="text-right py-2 font-semibold">{t('subtotal')}</td><td className="text-right py-2 font-mono">{formatCurrency(totals.subtotal, inv.currency)}</td></tr>
          <tr><td colSpan={4} className="text-right py-2">{cc.vatTerm}</td><td className="text-right py-2 font-mono">{formatCurrency(totals.vat, inv.currency)}</td></tr>
          <tr className="border-t-2 border-gray-800"><td colSpan={4} className="text-right py-2 font-bold text-lg">{t('invoiceTotal')}</td><td className="text-right py-2 font-bold font-mono text-lg">{formatCurrency(totals.subtotal + totals.vat, inv.currency)}</td></tr>
        </tfoot>
      </table>
      {co.bankAccount && !isQuote && <p className="text-sm text-gray-600">{lang==='is'?'Bankareikningur':'Bank account'}: {co.bankAccount}</p>}
      {inv.notes && <p className="text-sm text-gray-600 mt-2">{inv.notes}</p>}
    </div>
  );
}

function emailInvoice(inv: Invoice, companyName: string, lang: string) {
  const isQuote = inv.type === 'quote';
  const to = inv.customer.email ?? '';
  const total = inv.lines.reduce((s, l) => s + l.quantity * l.unitPrice * (1 + l.vatRate / 100), 0);
  const totalStr = formatCurrency(total, inv.currency);
  const dateLabel = isQuote
    ? (lang === 'is' ? 'Gildir til' : 'Valid until')
    : (lang === 'is' ? 'Gjalddagi' : 'Due date');
  const subject = isQuote
    ? `${lang === 'is' ? 'Tilboð' : 'Quote'} ${inv.number} — ${companyName}`
    : `${lang === 'is' ? 'Reikningur' : 'Invoice'} ${inv.number} — ${companyName}`;
  const body = [
    `${lang === 'is' ? 'Kæri' : 'Dear'} ${inv.customer.name},`,
    '',
    isQuote
      ? (lang === 'is' ? `Við sendum ykkur tilboð nr. ${inv.number}.` : `Please find attached quote number ${inv.number}.`)
      : (lang === 'is' ? `Við sendum ykkur reikning nr. ${inv.number}.` : `Please find attached invoice number ${inv.number}.`),
    '',
    ...inv.lines.map(l => `  ${l.description}  ×${l.quantity}  ${formatCurrency(l.unitPrice, inv.currency)}`),
    '',
    `${lang === 'is' ? 'Heildarupphæð' : 'Total'}: ${totalStr}`,
    `${dateLabel}: ${inv.dueDate}`,
    '',
    lang === 'is' ? 'Með kveðju,' : 'Kind regards,',
    companyName,
  ].join('\n');

  const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = url;
}

export default function Invoices() {
  const { data, dispatch, t, lang, cc } = useApp();
  const [modal, setModal] = useState<{ open: boolean; inv?: Invoice; defaultType?: 'invoice' | 'quote' }>({ open: false });
  const [limitModal, setLimitModal] = useState(false);
  const [printInv, setPrintInv] = useState<Invoice | null>(null);

  function openAddModal(defaultType: 'invoice' | 'quote') {
    if (isInvoiceLimitReached(data)) { setLimitModal(true); return; }
    setModal({ open: true, defaultType });
  }
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [docType, setDocType] = useState<'all' | 'invoice' | 'quote'>('all');
  const [filterStatus, setFilterStatus] = useState<Invoice['status'] | 'all'>('all');
  const [statementCustomer, setStatementCustomer] = useState<string>('');

  const filtered = data.invoices
    .filter(i => docType === 'all' || i.type === docType)
    .filter(i => filterStatus === 'all' || i.status === filterStatus)
    .sort((a, b) => b.date.localeCompare(a.date));

  // ── Customer statement ──
  const invTotal = (inv: Invoice) => inv.lines.reduce((s, l) => s + l.quantity * l.unitPrice * (1 + l.vatRate / 100), 0);
  const toISK = (amt: number, cur: Currency) => amt * ((data.settings.exchangeRates[cur as 'EUR'] ?? 1));
  const customerNames = Array.from(
    new Set(data.invoices.filter(i => i.type === 'invoice' && i.customer.name).map(i => i.customer.name))
  ).sort((a, b) => a.localeCompare(b));
  const statementInvoices = statementCustomer
    ? data.invoices
        .filter(i => i.type === 'invoice' && i.customer.name === statementCustomer)
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const stTotals = statementInvoices.reduce((acc, inv) => {
    const tISK = toISK(invTotal(inv), inv.currency);
    acc.invoiced += tISK;
    if (inv.status === 'paid') acc.paid += tISK;
    else acc.outstanding += tISK;
    return acc;
  }, { invoiced: 0, paid: 0, outstanding: 0 });

  function exportStatementPDF() {
    if (!statementCustomer) return;
    const cols = [
      { header: t('invoiceNumber'), key: 'number', width: 22 },
      { header: t('invoiceDate'), key: 'date', width: 24 },
      { header: t('dueDate'), key: 'dueDate', width: 24 },
      { header: t('status'), key: 'status', width: 20 },
      { header: t('invoiceTotal'), key: 'total', width: 26 },
      { header: lang === 'is' ? 'Ógreitt' : 'Outstanding', key: 'outstanding', width: 26 },
    ];
    const rows: Record<string, string | number>[] = statementInvoices.map(inv => {
      const tot = invTotal(inv);
      return {
        number: inv.number,
        date: formatDate(inv.date, lang),
        dueDate: formatDate(inv.dueDate, lang),
        status: t(inv.status),
        total: formatCurrency(tot, inv.currency),
        outstanding: inv.status === 'paid' ? '—' : formatCurrency(tot, inv.currency),
      };
    });
    rows.push({
      number: '', date: '', dueDate: '',
      status: lang === 'is' ? 'Staða (ISK)' : 'Balance (ISK)',
      total: formatISK(stTotals.invoiced, lang),
      outstanding: formatISK(stTotals.outstanding, lang),
    });
    const title = lang === 'is' ? 'Viðskiptamannayfirlit' : 'Customer statement';
    exportPDF(title, statementCustomer, cols, rows, `statement_${statementCustomer.replace(/\s+/g, '_')}.pdf`);
  }

  function emailStatement() {
    if (!statementCustomer) return;
    const cust = statementInvoices[0]?.customer;
    const to = cust?.email ?? '';
    const company = data.settings.company.name || '';
    const subject = `${lang === 'is' ? 'Viðskiptamannayfirlit' : 'Customer statement'} — ${company}`;
    const body = [
      `${lang === 'is' ? 'Kæri' : 'Dear'} ${statementCustomer},`,
      '',
      lang === 'is' ? 'Yfirlit yfir reikninga:' : 'Statement of your invoices:',
      '',
      ...statementInvoices.map(inv => {
        const tot = formatCurrency(invTotal(inv), inv.currency);
        const paid = inv.status === 'paid' ? (lang === 'is' ? 'greitt' : 'paid') : (lang === 'is' ? 'ógreitt' : 'outstanding');
        return `  ${inv.number}  ${formatDate(inv.date, lang)}  ${tot}  (${paid})`;
      }),
      '',
      `${lang === 'is' ? 'Heildarupphæð' : 'Total invoiced'}: ${formatISK(stTotals.invoiced, lang)}`,
      `${lang === 'is' ? 'Greitt' : 'Paid'}: ${formatISK(stTotals.paid, lang)}`,
      `${lang === 'is' ? 'Ógreidd staða' : 'Outstanding balance'}: ${formatISK(stTotals.outstanding, lang)}`,
      '',
      lang === 'is' ? 'Með kveðju,' : 'Kind regards,',
      company,
    ].join('\n');
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function handleSave(inv: Invoice) {
    const isNew = !data.invoices.find(i => i.id === inv.id);
    dispatch(isNew ? { type: 'ADD_INVOICE', payload: inv } : { type: 'UPDATE_INVOICE', payload: inv });
    if (isNew) {
      if (inv.type === 'quote') {
        dispatch({ type: 'UPDATE_SETTINGS', payload: { quoteLastNumber: data.settings.quoteLastNumber + 1 } });
      } else {
        dispatch({ type: 'UPDATE_SETTINGS', payload: { invoiceLastNumber: data.settings.invoiceLastNumber + 1 } });
      }
    }
    setModal({ open: false });
  }

  function convertToInvoice(quote: Invoice) {
    const newNum = `${data.settings.invoicePrefix}${String(data.settings.invoiceLastNumber + 1).padStart(4, '0')}`;
    const invoice: Invoice = {
      ...quote,
      id: newId(),
      type: 'invoice',
      number: newNum,
      date: todayISO(),
      dueDate: addDays(todayISO(), 30),
      status: 'draft',
    };
    dispatch({ type: 'ADD_INVOICE', payload: invoice });
    dispatch({ type: 'UPDATE_SETTINGS', payload: { invoiceLastNumber: data.settings.invoiceLastNumber + 1 } });
  }

  // Issued invoices are locked. A correction is made via a credit note
  // (kreditreikningur): a new sequential document with negated amounts
  // referencing the original — the original is never edited or deleted.
  function createCreditNote(inv: Invoice) {
    const newNum = `${data.settings.invoicePrefix}${String(data.settings.invoiceLastNumber + 1).padStart(4, '0')}`;
    const credit: Invoice = {
      ...inv,
      id: newId(),
      type: 'invoice',
      number: newNum,
      creditNoteOf: inv.number,
      date: todayISO(),
      dueDate: todayISO(),
      status: 'draft',
      lines: inv.lines.map(l => ({ ...l, id: lineId(), unitPrice: -Math.abs(l.unitPrice) })),
      notes: `${lang === 'is' ? 'Kreditreikningur vegna reiknings' : 'Credit note for invoice'} ${inv.number}`,
    };
    dispatch({ type: 'ADD_INVOICE', payload: credit });
    dispatch({ type: 'UPDATE_SETTINGS', payload: { invoiceLastNumber: data.settings.invoiceLastNumber + 1 } });
  }

  function markPaid(inv: Invoice) {
    dispatch({ type: 'UPDATE_INVOICE', payload: { ...inv, status: 'paid' } });
    // Book income net of VAT, split per VAT rate so mixed-rate invoices
    // allocate correctly on the VAT return (one transaction per rate).
    const netByRate: Record<number, number> = {};
    inv.lines.forEach(l => {
      const rate = l.vatRate;
      netByRate[rate] = (netByRate[rate] ?? 0) + l.quantity * l.unitPrice;
    });
    Object.entries(netByRate).forEach(([rateStr, net]) => {
      const rate = Number(rateStr);
      const id = `tx_inv_${inv.id}_${rateStr}`;
      if (data.transactions.find(tx2 => tx2.id === id)) return;
      dispatch({ type: 'ADD_TRANSACTION', payload: {
        id, date: todayISO(),
        description: `${t('invoice')} ${inv.number} — ${inv.customer.name}`,
        category: 'sala_thjonustu', type: 'income' as const,
        amount: net, currency: inv.currency, eurToIskRate: inv.eurToIskRate,
        vatRate: rate, reference: inv.number,
      }});
    });
  }

  function exportInvoicePDF(inv: Invoice) {
    const isQuote = inv.type === 'quote';
    const cols = [
      { header: t('description'), key: 'description', width: 50 },
      { header: t('quantity'), key: 'quantity', width: 14 },
      { header: t('unitPrice'), key: 'unitPrice', width: 22 },
      { header: `${cc.vatTerm}%`, key: 'vatRate', width: 14 },
      { header: t('lineTotal'), key: 'lineTotal', width: 22 },
    ];
    const rows = inv.lines.map(l => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: formatCurrency(l.unitPrice, inv.currency),
      vatRate: `${l.vatRate}%`,
      lineTotal: formatCurrency(l.quantity * l.unitPrice * (1 + l.vatRate / 100), inv.currency),
    }));
    const total = inv.lines.reduce((s, l) => s + l.quantity * l.unitPrice * (1 + l.vatRate / 100), 0);
    rows.push({ description: t('invoiceTotal'), quantity: '' as unknown as number, unitPrice: '', vatRate: '', lineTotal: formatCurrency(total, inv.currency) });
    const title = `${isQuote ? t('quote') : t('invoice')} ${inv.number}`;
    exportPDF(title, inv.customer.name, cols, rows, `${inv.number}.pdf`);
  }

  const docTabs: Array<{ v: 'all' | 'invoice' | 'quote'; label: string }> = [
    { v: 'all', label: t('allDocuments') },
    { v: 'invoice', label: t('invoices') },
    { v: 'quote', label: t('quotes') },
  ];
  const statuses: Array<{ v: Invoice['status'] | 'all'; label: string }> = [
    { v: 'all', label: t('all') },
    { v: 'draft', label: t('draft') },
    { v: 'sent', label: t('sent') },
    { v: 'paid', label: t('paid') },
    { v: 'overdue', label: t('overdue') },
  ];

  const unpaidTotal = data.invoices
    .filter(i => i.type === 'invoice' && (i.status === 'sent' || i.status === 'overdue'))
    .reduce((s, i) => s + i.lines.reduce((ls, l) => ls + l.quantity * l.unitPrice * (1 + l.vatRate/100), 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('invoices')}</h1>
          {unpaidTotal > 0 && (
            <p className="text-xs text-orange-600 mt-0.5">{t('unpaidInvoices')}: {formatISK(unpaidTotal, lang)}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => openAddModal('quote')}
            className="flex items-center gap-1.5 border border-purple-300 text-purple-700 bg-purple-50 px-3 py-2 rounded-lg text-sm font-medium hover:bg-purple-100">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">{t('addQuote')}</span>
          </button>
          <button onClick={() => openAddModal('invoice')}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">{t('addInvoice')}</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-3 flex gap-2 flex-wrap">
        {docTabs.map(s => (
          <button key={s.v} onClick={() => setDocType(s.v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${docType === s.v ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s.label}
          </button>
        ))}
        <div className="w-px bg-gray-200 mx-1" />
        {statuses.map(s => (
          <button key={s.v} onClick={() => setFilterStatus(s.v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === s.v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s.label}
          </button>
        ))}
        <div className="w-px bg-gray-200 mx-1" />
        <select
          value={statementCustomer}
          onChange={e => setStatementCustomer(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 border-0 focus:ring-2 focus:ring-blue-500 max-w-[180px]">
          <option value="">{lang === 'is' ? 'Viðskiptamannayfirlit…' : 'Customer statement…'}</option>
          {customerNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      {statementCustomer ? (
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-5">
          {/* Statement header */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{statementCustomer}</h2>
              <p className="text-xs text-gray-400">{lang === 'is' ? 'Viðskiptamannayfirlit' : 'Customer statement'}</p>
            </div>
            <button onClick={() => setStatementCustomer('')}
              className="text-xs text-gray-500 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50">
              {lang === 'is' ? 'Til baka' : 'Back to list'}
            </button>
          </div>

          {/* Totals summary */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-gray-400">{lang === 'is' ? 'Reikningsfært' : 'Invoiced'}</p>
              <p className="font-bold text-gray-800 text-sm mt-0.5">{formatISK(stTotals.invoiced, lang)}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-green-600">{lang === 'is' ? 'Greitt' : 'Paid'}</p>
              <p className="font-bold text-green-700 text-sm mt-0.5">{formatISK(stTotals.paid, lang)}</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-orange-600">{lang === 'is' ? 'Ógreitt' : 'Outstanding'}</p>
              <p className="font-bold text-orange-700 text-sm mt-0.5">{formatISK(stTotals.outstanding, lang)}</p>
            </div>
          </div>

          {/* Invoice rows */}
          {statementInvoices.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">{t('noInvoices')}</p>
          ) : (
            <div className="divide-y divide-gray-100 border-y border-gray-100">
              {statementInvoices.map(inv => {
                const tot = invTotal(inv);
                return (
                  <div key={inv.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-gray-800 text-sm">{inv.number}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor[inv.status]}`}>{t(inv.status)}</span>
                      </div>
                      <p className="text-xs text-gray-400">{formatDate(inv.date, lang)} · {t('dueDate')}: {formatDate(inv.dueDate, lang)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-semibold text-gray-900 text-sm">{formatCurrency(tot, inv.currency, lang)}</div>
                      {inv.status !== 'paid' && (
                        <div className="text-[11px] text-orange-600">{lang === 'is' ? 'ógreitt' : 'outstanding'}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Statement actions */}
          {statementInvoices.length > 0 && (
            <div className="flex gap-2 mt-4 flex-wrap">
              <button onClick={emailStatement}
                className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50">
                <Mail className="w-3.5 h-3.5" /> {lang === 'is' ? 'Senda í tölvupósti' : 'Email statement'}
              </button>
              <button onClick={exportStatementPDF}
                className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50">
                <FileText className="w-3.5 h-3.5" /> PDF
              </button>
            </div>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">
          {docType === 'quote' ? t('noQuotes') : t('noInvoices')}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(inv => {
            const isQuote = inv.type === 'quote';
            const total = inv.lines.reduce((s, l) => s + l.quantity * l.unitPrice * (1 + l.vatRate/100), 0);
            // Issued invoices (anything past draft) are locked from edit/delete.
            const locked = !isQuote && inv.status !== 'draft';
            return (
              <div key={inv.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isQuote ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {isQuote ? t('quote') : t('invoice')}
                      </span>
                      <span className="font-mono font-semibold text-gray-800">{inv.number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[inv.status]}`}>{t(inv.status)}</span>
                      {inv.creditNoteOf && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-rose-100 text-rose-700">
                          {lang === 'is' ? `Kredit · ${inv.creditNoteOf}` : `Credit · ${inv.creditNoteOf}`}
                        </span>
                      )}
                      {locked && (
                        <span className="flex items-center gap-1 text-[10px] text-gray-400" title={lang === 'is' ? 'Útgefinn reikningur — læstur' : 'Issued invoice — locked'}>
                          <Lock className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-gray-700 mt-0.5">{inv.customer.name}</p>
                    <p className="text-xs text-gray-400">
                      {formatDate(inv.date, lang)} · {isQuote ? t('validUntil') : t('dueDate')}: {formatDate(inv.dueDate, lang)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-gray-900">{formatCurrency(total, inv.currency, lang)}</div>
                    {inv.currency !== 'ISK' && (
                      <div className="text-xs text-gray-400">{formatISK(total * (data.settings.exchangeRates[inv.currency as 'EUR'] ?? 1), lang)}</div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50 flex-wrap">
                  {/* Quote: convert to invoice */}
                  {isQuote && (
                    <button onClick={() => convertToInvoice(inv)}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 border border-blue-200 bg-blue-50 px-2.5 py-1.5 rounded-lg">
                      <ArrowRightLeft className="w-3.5 h-3.5" /> {t('convertToInvoice')}
                    </button>
                  )}
                  {/* Invoice: mark as paid */}
                  {!isQuote && inv.status !== 'paid' && (
                    <button onClick={() => markPaid(inv)}
                      className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 border border-green-200 bg-green-50 px-2.5 py-1.5 rounded-lg">
                      <CheckCircle className="w-3.5 h-3.5" /> {t('markAsPaid')}
                    </button>
                  )}
                  {inv.status === 'draft' && (
                    <button onClick={() => dispatch({ type: 'UPDATE_INVOICE', payload: { ...inv, status: 'sent' } })}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 border border-blue-200 bg-blue-50 px-2.5 py-1.5 rounded-lg">
                      <Send className="w-3.5 h-3.5" /> {t('markAsSent')}
                    </button>
                  )}
                  {/* Email */}
                  {inv.customer.email && (
                    <button onClick={() => emailInvoice(inv, data.settings.company.name || '', lang)}
                      className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50">
                      <Mail className="w-3.5 h-3.5" /> {isQuote ? t('emailQuote') : t('emailInvoice')}
                    </button>
                  )}
                  {/* PDF */}
                  <button onClick={() => exportInvoicePDF(inv)}
                    className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50">
                    <FileText className="w-3.5 h-3.5" /> PDF
                  </button>
                  {/* Print */}
                  <button onClick={() => { setPrintInv(inv); setTimeout(() => window.print(), 100); }}
                    className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50">
                    <Printer className="w-3.5 h-3.5" /> {t('printInvoice')}
                  </button>
                  {/* Edit / delete only before an invoice is issued (drafts + quotes) */}
                  {!locked && (
                    <button onClick={() => setModal({ open: true, inv })}
                      className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50">
                      <Pencil className="w-3.5 h-3.5" /> {t('edit')}
                    </button>
                  )}
                  {!locked && (
                    <button onClick={() => setDeleteId(inv.id)}
                      className="flex items-center gap-1 text-xs text-red-500 border border-red-100 bg-red-50 px-2.5 py-1.5 rounded-lg hover:bg-red-100">
                      <Trash2 className="w-3.5 h-3.5" /> {t('delete')}
                    </button>
                  )}
                  {/* Issued invoice: correct via credit note (not a credit note itself) */}
                  {locked && !inv.creditNoteOf && (
                    <button onClick={() => createCreditNote(inv)}
                      className="flex items-center gap-1 text-xs text-rose-600 border border-rose-200 bg-rose-50 px-2.5 py-1.5 rounded-lg hover:bg-rose-100">
                      <RotateCcw className="w-3.5 h-3.5" /> {lang === 'is' ? 'Kreditreikningur' : 'Credit note'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal.open && (
        <InvoiceModal
          initial={modal.inv}
          defaultType={modal.defaultType ?? 'invoice'}
          onSave={handleSave}
          onClose={() => setModal({ open: false })}
        />
      )}
      {printInv && <PrintableInvoice inv={printInv} />}
      <PlanLimitModal
        open={limitModal} onClose={() => setLimitModal(false)}
        limitText="You've reached 5 invoices this month on the Free plan."
        limitTextIs="Þú hefur náð 5 reikningum þennan mánuð á Free plani."
      />
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold mb-2">{t('deleteInvoice')}</h3>
            <p className="text-sm text-gray-600 mb-5">{t('confirmDelete')}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-gray-300 py-2 rounded-xl text-sm">{t('cancel')}</button>
              <button onClick={() => { dispatch({ type: 'DELETE_INVOICE', payload: deleteId }); setDeleteId(null); }} className="flex-1 bg-red-600 text-white py-2 rounded-xl text-sm">{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
