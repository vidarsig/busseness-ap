import { useState, useRef } from 'react';
import { Receipt, X, Loader2, CheckCircle, AlertCircle, Check } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Transaction, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../types';
import { scanReceipt, ScannedReceipt } from '../utils/ai';
import { prepareImage } from '../utils/image';

type ItemStatus = 'scanning' | 'matched' | 'review' | 'nomatch' | 'error' | 'attached';

interface MatchItem {
  id: string;
  filename: string;
  dataUrl: string;
  status: ItemStatus;
  receipt?: ScannedReceipt;
  candidates: Transaction[];
  selectedId: string; // '' = skip / no match
}

const DAY = 86400000;

function daysApart(a: string, b: string): number {
  const ta = new Date(a).getTime(), tb = new Date(b).getTime();
  if (isNaN(ta) || isNaN(tb)) return Infinity;
  return Math.abs(ta - tb) / DAY;
}

/** Find expense transactions whose amount equals the receipt total, closest date first. */
function findCandidates(txs: Transaction[], receipt: ScannedReceipt, excludeIds: Set<string>): Transaction[] {
  const target = Math.round(receipt.amount);
  return txs
    .filter(t => t.type === 'expense' && !t.receiptUrl && !excludeIds.has(t.id) && Math.round(t.amount) === target)
    .sort((a, b) => daysApart(a.date, receipt.date) - daysApart(b.date, receipt.date));
}

function classify(cands: Transaction[], receipt: ScannedReceipt): ItemStatus {
  if (cands.length === 0) return 'nomatch';
  // Confident only when there's a single amount match and the date is close.
  if (cands.length === 1 && daysApart(cands[0].date, receipt.date) <= 10) return 'matched';
  return 'review';
}

interface Props { onClose: () => void; }

export default function ReceiptMatcher({ onClose }: Props) {
  const { data, dispatch, lang, cc } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MatchItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [attachedCount, setAttachedCount] = useState<number | null>(null);

  const t = (is: string, en: string) => (lang === 'is' ? is : en);
  const allCategories = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES] as string[];
  const vatRates = cc.isUSA ? [data.settings.salesTaxRate, 0] : cc.vatRates;

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const images = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (images.length === 0) return;
    setBusy(true);
    setAttachedCount(null);
    setProgress({ done: 0, total: images.length });

    // Reserve transactions already chosen (in this batch) so two receipts never
    // land on the same transaction.
    const used = new Set<string>(items.filter(i => i.selectedId).map(i => i.selectedId));
    const startIndex = items.length;

    // Seed placeholder rows so the user sees progress immediately.
    setItems(prev => [
      ...prev,
      ...images.map((f, k) => ({
        id: `rc_${Date.now()}_${startIndex + k}`,
        filename: f.name,
        dataUrl: '',
        status: 'scanning' as ItemStatus,
        candidates: [],
        selectedId: '',
      })),
    ]);

    for (let k = 0; k < images.length; k++) {
      try {
        const { dataUrl, base64, mediaType } = await prepareImage(images[k]);
        const receipt = await scanReceipt(base64, mediaType, allCategories, vatRates, lang);
        const cands = findCandidates(data.transactions, receipt, used);
        const status = classify(cands, receipt);
        const selectedId = status === 'nomatch' ? '' : cands[0].id;
        if (selectedId) used.add(selectedId);
        setItems(prev => prev.map((it, idx) =>
          idx === startIndex + k ? { ...it, dataUrl, receipt, candidates: cands, status, selectedId } : it));
      } catch {
        setItems(prev => prev.map((it, idx) =>
          idx === startIndex + k ? { ...it, status: 'error' } : it));
      }
      setProgress(p => ({ ...p, done: p.done + 1 }));
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  function setSelected(itemId: string, txId: string) {
    setItems(prev => prev.map(it => it.id === itemId
      ? { ...it, selectedId: txId, status: txId ? (it.status === 'nomatch' ? 'review' : it.status) : 'nomatch' }
      : it));
  }

  function attachAll() {
    let n = 0;
    items.forEach(item => {
      if (!item.selectedId || item.status === 'attached' || !item.dataUrl) return;
      const tx = data.transactions.find(t2 => t2.id === item.selectedId);
      if (tx && !tx.receiptUrl) {
        dispatch({ type: 'UPDATE_TRANSACTION', payload: { ...tx, receiptUrl: item.dataUrl } });
        n++;
      }
    });
    setAttachedCount(n);
    setItems(prev => prev.map(it => (it.selectedId ? { ...it, status: 'attached' } : it)));
  }

  const readyToAttach = items.filter(i => i.selectedId && i.status !== 'attached').length;
  const inp = 'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500';

  function txLabel(tx: Transaction): string {
    const cat = t(tx.category, tx.category);
    return `${tx.date} · ${Math.round(tx.amount).toLocaleString()} · ${tx.description || cat}`.slice(0, 70);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
      <div className="bg-white w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-600" />
            <h2 className="font-semibold text-gray-900">{t('Tengja kvittanir sjálfvirkt', 'Auto-match receipts')}</h2>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs text-gray-500">
            {t('Veldu margar kvittana­myndir. AI les upphæð og dagsetningu og finnur réttu færsluna. Þú staðfestir þær sem eru óvissar.',
               'Pick many receipt photos. The AI reads the amount and date and finds the matching transaction. You confirm any it is unsure about.')}
          </p>

          {/* Upload */}
          <label className="flex items-center justify-center gap-3 border-2 border-dashed border-blue-300 bg-blue-50 hover:bg-blue-100 rounded-xl p-4 cursor-pointer transition-colors">
            <Receipt className="w-6 h-6 text-blue-600 flex-shrink-0" />
            <div>
              <div className="text-sm font-semibold text-blue-800">{t('Veldu kvittana­myndir', 'Choose receipt photos')}</div>
              <div className="text-xs text-blue-500">{t('Þú getur valið margar í einu', 'You can select many at once')}</div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only"
              disabled={busy} onChange={e => handleFiles(e.target.files)} />
          </label>

          {/* Progress */}
          {busy && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin flex-shrink-0" />
              <span className="text-sm text-blue-700">
                {t('AI les kvittanir', 'AI reading receipts')} — {progress.done}/{progress.total}
              </span>
            </div>
          )}

          {/* Results */}
          {items.length > 0 && (
            <div className="space-y-2">
              {items.map(item => (
                <div key={item.id} className={`flex gap-3 items-center border rounded-xl p-2 ${
                  item.status === 'attached' ? 'border-green-200 bg-green-50/50'
                  : item.status === 'review' ? 'border-amber-200 bg-amber-50/50'
                  : item.status === 'nomatch' || item.status === 'error' ? 'border-red-200 bg-red-50/40'
                  : 'border-gray-200'}`}>
                  {/* Thumb */}
                  <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {item.dataUrl
                      ? <img src={item.dataUrl} alt="" className="w-full h-full object-cover" />
                      : <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* What the AI read */}
                    {item.receipt && (
                      <div className="text-xs text-gray-500 truncate">
                        {item.receipt.vendor || item.filename} · {Math.round(item.receipt.amount).toLocaleString()} · {item.receipt.date}
                      </div>
                    )}
                    {/* Match picker */}
                    {item.status === 'scanning' && <div className="text-xs text-gray-400">{t('Les…', 'Reading…')}</div>}
                    {item.status === 'error' && <div className="text-xs text-red-600">{t('Gat ekki lesið myndina', 'Could not read this image')}</div>}
                    {(item.status === 'matched' || item.status === 'review' || item.status === 'nomatch' || item.status === 'attached') && item.receipt && (
                      item.candidates.length > 0 || item.selectedId ? (
                        <select className={inp} value={item.selectedId} disabled={item.status === 'attached'}
                          onChange={e => setSelected(item.id, e.target.value)}>
                          <option value="">{t('— Sleppa (engin færsla) —', '— Skip (no transaction) —')}</option>
                          {item.candidates.map(c => (
                            <option key={c.id} value={c.id}>{txLabel(c)}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="text-xs text-red-600">{t('Engin færsla með sömu upphæð', 'No transaction with this amount')}</div>
                      )
                    )}
                  </div>

                  {/* Status badge */}
                  <div className="flex-shrink-0">
                    {item.status === 'matched' && <span title={t('Fundið','Matched')}><Check className="w-4 h-4 text-green-600" /></span>}
                    {item.status === 'review' && <span title={t('Skoða','Check this')}><AlertCircle className="w-4 h-4 text-amber-500" /></span>}
                    {(item.status === 'nomatch' || item.status === 'error') && <span title={t('Engin samsvörun','No match')}><X className="w-4 h-4 text-red-400" /></span>}
                    {item.status === 'attached' && <CheckCircle className="w-4 h-4 text-green-600" />}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Success */}
          {attachedCount !== null && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <span className="text-sm font-medium text-green-700">
                {attachedCount} {t('kvittanir tengdar við færslur', 'receipts attached to transactions')}
              </span>
            </div>
          )}

          {/* Actions */}
          {items.length > 0 && (
            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-xl text-sm">
                {t('Loka', 'Close')}
              </button>
              <button onClick={attachAll} disabled={busy || readyToAttach === 0}
                className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
                {t('Tengja', 'Attach')} {readyToAttach > 0 ? `(${readyToAttach})` : ''}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
