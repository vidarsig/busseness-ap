import { useState, useRef } from 'react';
import { Camera, X, Loader2, CheckCircle, AlertCircle, RotateCcw } from 'lucide-react';
import SearchableSelect from './SearchableSelect';
import { useApp } from '../contexts/AppContext';
import { Transaction, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../types';
import { scanReceipt, ScannedReceipt } from '../utils/ai';
import { todayISO } from '../utils/formatters';
import { daysApart, findReceiptCandidates, LIKELY_SAME_PAYMENT_DAYS } from '../utils/receiptMatch';

function newId() { return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

// Also returns the whole data URL, not just the base64 payload: attaching the
// photo to an existing transaction needs something storable, and the preview's
// blob: URL dies with the page.
function resizeImage(file: File, maxWidth = 1200): Promise<{ base64: string; mediaType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg', dataUrl });
    };
    img.onerror = reject;
    img.src = url;
  });
}

interface Props { onClose: () => void; }

export default function ReceiptScanner({ onClose }: Props) {
  const { data, dispatch, lang, cc } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ScannedReceipt | null>(null);
  const [form, setForm] = useState<Partial<Transaction>>({});
  const [saved, setSaved] = useState(false);
  // The scanned photo, storable — used when attaching to an existing entry.
  const [dataUrl, setDataUrl] = useState('');
  // Which existing entry the owner picked as "same payment", and whether they
  // waved the warning away to book a genuinely separate one.
  const [dupChoice, setDupChoice] = useState('');
  const [dupDismissed, setDupDismissed] = useState(false);
  const [attached, setAttached] = useState(false);

  const allCategories = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES] as string[];
  const vatRates = cc.isUSA ? [data.settings.salesTaxRate, 0] : cc.vatRates;

  async function handleImage(file: File) {
    setError('');
    setResult(null);
    setSaved(false);
    setDupChoice('');
    setDupDismissed(false);
    setAttached(false);
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setScanning(true);
    try {
      const { base64, mediaType, dataUrl: url } = await resizeImage(file);
      setDataUrl(url);
      const scanned = await scanReceipt(base64, mediaType, allCategories, vatRates, lang);
      setResult(scanned);
      setForm({
        id: newId(),
        date: scanned.date || todayISO(),
        description: scanned.vendor ? `${scanned.vendor}${scanned.description ? ` — ${scanned.description}` : ''}` : scanned.description,
        amount: scanned.amount,
        category: allCategories.includes(scanned.category) ? scanned.category : (scanned.type === 'income' ? 'sala_thjonustu' : 'adrir_rekstrargjold'),
        vatRate: vatRates.includes(scanned.vatRate) ? scanned.vatRate : vatRates[0],
        type: scanned.type,
        currency: data.settings.defaultCurrency,
        eurToIskRate: data.settings.exchangeRates.EUR,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : (lang === 'is' ? 'Villa við greiningu' : 'Analysis failed'));
    }
    setScanning(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleImage(file);
  }

  // Entries that could be this same payment. Matched on amount + nearby date,
  // never on description: the bank writes the terminal name and the receipt
  // lists the goods, so the same purchase reads as two unrelated lines. Without
  // this the scanner booked a second copy of an already-imported payment every
  // time, which is exactly how the books ended up double-counted.
  const dupes = form.amount && form.type !== 'income'
    ? findReceiptCandidates(data.transactions, { amount: Number(form.amount), date: form.date ?? '' })
        .filter(t => daysApart(t.date, form.date ?? '') <= LIKELY_SAME_PAYMENT_DAYS)
    : [];
  const dupTarget = dupes.find(t => t.id === dupChoice) ?? dupes[0];
  const showDupWarning = dupes.length > 0 && !dupDismissed;

  // "Same payment" → keep the entry that is already in the books and hang the
  // photo on it. Nothing is created, so the totals don't move.
  function attachToExisting() {
    if (!dupTarget) return;
    dispatch({ type: 'UPDATE_TRANSACTION', payload: { ...dupTarget, receiptUrl: dataUrl } });
    setAttached(true);
    setSaved(true);
    setTimeout(onClose, 1400);
  }

  function saveTransaction() {
    if (!form.description || !form.amount) return;
    dispatch({ type: 'ADD_TRANSACTION', payload: { ...form, receiptUrl: dataUrl } as Transaction });
    setSaved(true);
    setTimeout(onClose, 1200);
  }

  function reset() {
    setPreview(null);
    setResult(null);
    setError('');
    setSaved(false);
    setDupChoice('');
    setDupDismissed(false);
    setAttached(false);
    setDataUrl('');
    setForm({});
    if (fileRef.current) fileRef.current.value = '';
    if (cameraRef.current) cameraRef.current.value = '';
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end md:items-center justify-center z-50">
      <div className="bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-600" />
            <h2 className="font-semibold text-gray-900">
              {lang === 'is' ? 'Skanna kvittun' : 'Scan Receipt'}
            </h2>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Camera / upload trigger */}
          {!preview && (
            <div className="space-y-3">
              {/* Camera button */}
              <label className="flex items-center justify-center gap-3 border-2 border-blue-300 bg-blue-50 hover:bg-blue-100 rounded-xl p-4 cursor-pointer transition-colors">
                <Camera className="w-6 h-6 text-blue-600 flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-blue-800">
                    {lang === 'is' ? 'Taka mynd með myndavél' : 'Take photo with camera'}
                  </div>
                  <div className="text-xs text-blue-500">
                    {lang === 'is' ? 'Opnar myndavélina' : 'Opens your camera directly'}
                  </div>
                </div>
                <input ref={cameraRef} type="file" accept="image/*" capture="environment"
                  className="sr-only" onChange={handleFileChange} />
              </label>
              {/* Gallery / file button */}
              <label className="flex items-center justify-center gap-3 border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 rounded-xl p-4 cursor-pointer transition-colors">
                <svg className="w-6 h-6 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                <div>
                  <div className="text-sm font-semibold text-gray-700">
                    {lang === 'is' ? 'Velja mynd úr safni' : 'Choose from gallery / files'}
                  </div>
                  <div className="text-xs text-gray-400">
                    {lang === 'is' ? 'JPG, PNG, PDF' : 'JPG, PNG, PDF'}
                  </div>
                </div>
                <input ref={fileRef} type="file" accept="image/*,application/pdf"
                  className="sr-only" onChange={handleFileChange} />
              </label>
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="relative">
              <img src={preview} alt="Receipt" className="w-full rounded-xl object-contain max-h-64 bg-gray-100" />
              {!scanning && !saved && (
                <button onClick={reset}
                  className="absolute top-2 right-2 bg-white rounded-full p-1.5 shadow border border-gray-200 hover:bg-gray-50">
                  <RotateCcw className="w-4 h-4 text-gray-600" />
                </button>
              )}
            </div>
          )}

          {/* Scanning indicator */}
          {scanning && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin flex-shrink-0" />
              <span className="text-sm text-blue-700">
                {lang === 'is' ? 'AI er að lesa kvittunina...' : 'AI is reading the receipt...'}
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          {/* Already in the books? Ask before booking a second copy. */}
          {result && !scanning && !saved && showDupWarning && dupTarget && (
            <div className="border-2 border-amber-300 bg-amber-50 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-900">
                  <div className="font-semibold">
                    {lang === 'is' ? 'Þessi greiðsla er líklega þegar í bókunum' : 'This payment is probably already in the books'}
                  </div>
                  <div className="mt-1">
                    {lang === 'is' ? 'Þú átt þegar færslu upp á ' : 'You already have an entry of '}
                    <strong>{Number(dupTarget.amount).toLocaleString('is-IS')}</strong>
                    {lang === 'is' ? ' frá ' : ' from '}<strong>{dupTarget.date}</strong> — {dupTarget.description}
                  </div>
                </div>
              </div>

              {/* More than one entry matches: let the owner say which. */}
              {dupes.length > 1 && (
                <select className={inp} value={dupTarget.id} onChange={e => setDupChoice(e.target.value)}>
                  {dupes.map(t => (
                    <option key={t.id} value={t.id}>{t.date} · {t.description}</option>
                  ))}
                </select>
              )}

              <div className="space-y-2">
                <button onClick={attachToExisting}
                  className="w-full bg-amber-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-amber-700">
                  {lang === 'is' ? 'Já — hengdu myndina á þessa færslu' : 'Yes — attach the photo to that entry'}
                </button>
                <button onClick={() => setDupDismissed(true)}
                  className="w-full border border-amber-300 text-amber-800 py-2.5 rounded-xl text-sm">
                  {lang === 'is' ? 'Nei — þetta er önnur greiðsla' : 'No — this is a separate payment'}
                </button>
              </div>
              <p className="text-xs text-amber-700">
                {lang === 'is'
                  ? 'Að hengja myndina á breytir engum upphæðum. Að búa til nýja færslu tvítelur greiðsluna.'
                  : 'Attaching the photo changes no amounts. Creating a new entry double-counts the payment.'}
              </p>
            </div>
          )}

          {/* Extracted form */}
          {result && !scanning && !saved && !showDupWarning && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase">
                {lang === 'is' ? 'Niðurstöður — breyttu ef þörf er á' : 'Extracted data — edit if needed'}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{lang === 'is' ? 'Dagsetning' : 'Date'}</label>
                  <input type="date" className={inp} value={form.date ?? ''} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{lang === 'is' ? 'Upphæð' : 'Amount'}</label>
                  <input type="number" className={inp} value={form.amount ?? ''} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} min={0} step="1" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{lang === 'is' ? 'Lýsing' : 'Description'}</label>
                <input className={inp} value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{lang === 'is' ? 'Tegund' : 'Type'}</label>
                  <select className={inp} value={form.type ?? 'expense'} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'income' | 'expense' }))}>
                    <option value="expense">{lang === 'is' ? 'Útgjöld' : 'Expense'}</option>
                    <option value="income">{lang === 'is' ? 'Tekjur' : 'Income'}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{cc.vatTerm}%</label>
                  <select className={inp} value={form.vatRate ?? 0} onChange={e => setForm(f => ({ ...f, vatRate: parseFloat(e.target.value) }))}>
                    {vatRates.filter((r, i, a) => a.indexOf(r) === i).map(r => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{lang === 'is' ? 'Flokkur' : 'Category'}</label>
                {/* One searchable list instead of two optgroups — the group each
                    category belongs to is kept as the small line under its name. */}
                <SearchableSelect className={inp} value={form.category ?? ''}
                  onChange={v => setForm(f => ({ ...f, category: v }))}
                  options={[
                    ...INCOME_CATEGORIES.map(c => ({ value: c, label: c, hint: lang === 'is' ? 'Tekjur' : 'Income' })),
                    ...EXPENSE_CATEGORIES.map(c => ({ value: c, label: c, hint: lang === 'is' ? 'Útgjöld' : 'Expenses' })),
                  ]} />
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={reset} className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-xl text-sm">
                  {lang === 'is' ? 'Skanna aftur' : 'Scan again'}
                </button>
                <button onClick={saveTransaction}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-blue-700">
                  {lang === 'is' ? 'Vista færslu' : 'Save transaction'}
                </button>
              </div>
            </div>
          )}

          {/* Success */}
          {saved && (
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-4">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <span className="text-sm font-medium text-green-700">
                {attached
                  ? (lang === 'is' ? 'Mynd hengd á færsluna — engin ný færsla búin til.' : 'Photo attached to the existing entry — nothing new created.')
                  : (lang === 'is' ? 'Færsla vistuð!' : 'Transaction saved!')}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
