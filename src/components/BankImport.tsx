import { useState, useRef } from 'react';
import { Upload, Check, X, AlertCircle, Zap, BookOpen, Bot, Loader2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Transaction, EXPENSE_CATEGORIES, INCOME_CATEGORIES, CategoryRule } from '../types';
import { categorizeBatch } from '../utils/ai';
import { matchRule } from './AutoRules';
import { todayISO } from '../utils/formatters';

function newId() { return `tx_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }

type BankFormat = 'arion' | 'islandsbanki' | 'landsbankinn' | 'generic';

interface ParsedRow {
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  reference?: string;
}

function parseCsv(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/);
  return lines.map(line => {
    const result: string[] = [];
    let inQuote = false, cur = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if ((ch === ',' || ch === ';') && !inQuote) { result.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur.trim());
    return result;
  });
}

function parseDate(raw: string): string {
  if (raw == null || raw === '') return todayISO();
  // Strip quotes/whitespace only — keep the . / - separators (Arion uses dots).
  const cleaned = String(raw).replace(/['"]/g, '').trim();
  // yyyy-mm-dd / yyyy.mm.dd / yyyy/mm/dd  (ISO-ish, year first)
  const iso = cleaned.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
  // dd.mm.yyyy / dd/mm/yyyy / dd-mm-yyyy  (day first — Icelandic banks)
  const dd = cleaned.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dd) {
    const y = dd[3].length === 2 ? `20${dd[3]}` : dd[3];
    return `${y}-${dd[2].padStart(2,'0')}-${dd[1].padStart(2,'0')}`;
  }
  // Excel serial date (days since 1899-12-30) — safety net if a cell comes raw.
  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    const serial = parseFloat(cleaned);
    if (serial > 59 && serial < 200000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
  }
  // Last resort: let the engine try.
  const p = new Date(cleaned);
  if (!isNaN(p.getTime())) return p.toISOString().split('T')[0];
  return todayISO();
}

// Robust amount parser: handles "-1,100.00" (US) and "1.100,00" (EU) and plain
// numbers. The rightmost of '.' / ',' is treated as the decimal separator.
function parseAmount(raw: string): number {
  if (raw == null) return 0;
  let s = String(raw).trim();
  if (!s) return 0;
  const neg = /-/.test(s) || /\(/.test(s);          // minus or accounting parens
  s = s.replace(/[^0-9.,]/g, '');
  if (!s) return 0;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  const decSep = lastDot > lastComma ? '.' : (lastComma > -1 ? ',' : '');
  if (decSep) {
    const thouSep = decSep === '.' ? ',' : '.';
    s = s.split(thouSep).join('');                   // strip thousands separators
    if (decSep === ',') s = s.replace(',', '.');
  }
  const n = parseFloat(s) || 0;
  return neg ? -Math.abs(n) : n;
}

// Find the header row (the one starting with the date column) and return the
// data rows after it. Arion exports have a few metadata rows on top.
function dataAfterHeader(rows: string[][]): string[][] {
  const h = rows.findIndex(r => {
    const c = String(r[0] ?? '').toLowerCase().trim();
    return c === 'dagsetning' || c === 'date';
  });
  const start = h >= 0 ? h + 1 : 1;                  // fall back to skipping one header row
  return rows.slice(start).filter(r => r.length >= 2 && String(r[0] ?? '').trim());
}

function parseBank(rows: string[][], format: BankFormat): ParsedRow[] {
  const dataRows = dataAfterHeader(rows);
  switch (format) {
    case 'arion':
      // Real Arion export columns:
      // 0 Dagsetning | 1 Upphæð | 2 Mynt | 3 Skýring | 4 Seðilnúmer | 5 Tilvísun | 6 Texti | … | 13 Nafn
      return dataRows.map(r => {
        const amt = parseAmount(r[1] ?? '');
        const desc = (r[3] || r[13] || r[6] || '').toString().trim();
        return { date: parseDate(r[0] ?? ''), description: desc, reference: (r[5] || r[4] || '').toString().trim(), amount: Math.abs(amt), type: (amt >= 0 ? 'income' : 'expense') as 'income' | 'expense' };
      }).filter(r => r.amount > 0);
    case 'islandsbanki':
      return dataRows.map(r => {
        const credit = parseAmount(r[3] ?? '');
        const debit = parseAmount(r[4] ?? '');
        const amt = credit > 0 ? credit : -debit;
        return { date: parseDate(r[0] ?? ''), description: r[1] ?? '', reference: r[2] ?? '', amount: Math.abs(amt), type: (amt >= 0 ? 'income' : 'expense') as 'income' | 'expense' };
      }).filter(r => r.amount > 0);
    case 'landsbankinn':
      return dataRows.map(r => {
        const amt = parseAmount(r[2] ?? '');
        return { date: parseDate(r[0] ?? ''), description: r[1] ?? '', amount: Math.abs(amt), type: (amt >= 0 ? 'income' : 'expense') as 'income' | 'expense' };
      }).filter(r => r.amount > 0);
    case 'generic':
    default:
      return dataRows.map(r => {
        const amt = parseAmount(r[2] ?? r[1] ?? '');
        return { date: parseDate(r[0] ?? ''), description: r[1] ?? '', amount: Math.abs(amt), type: (amt >= 0 ? 'income' : 'expense') as 'income' | 'expense' };
      }).filter(r => r.amount > 0);
  }
}

interface ImportRow extends ParsedRow {
  selected: boolean;
  category: string;
  vatRate: number;
  matchedRule?: string; // rule id that matched
  learnOpen?: boolean;  // show inline learn panel
}

export default function BankImport() {
  const { data, dispatch, t, lang, cc } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [format, setFormat] = useState<BankFormat>('arion');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState('');
  const [learnPattern, setLearnPattern] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  function applyRulesToRows(parsed: ReturnType<typeof parseBank>): ImportRow[] {
    const rules = data.categoryRules;
    return parsed.map(p => {
      const matched = matchRule(p.description, rules);
      return {
        ...p,
        selected: true,
        category: matched ? matched.category : (p.type === 'income' ? 'sala_thjonustu' : 'adrir_rekstrargjold'),
        vatRate: matched ? matched.vatRate : 0,
        type: matched ? matched.type : p.type,
        matchedRule: matched?.id,
      };
    });
  }

  async function aiCategorizeAll() {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const allCategories = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES] as string[];
      const results = await categorizeBatch(
        rows.map(r => ({ description: r.description, amount: r.amount, detectedType: r.type })),
        allCategories,
        cc.isUSA ? [data.settings.salesTaxRate, 0] : cc.vatRates,
      );
      setRows(prev => prev.map((r, i) => {
        const suggestion = results[i];
        if (!suggestion) return r;
        const validCat = allCategories.includes(suggestion.category) ? suggestion.category : r.category;
        const validVat = (cc.isUSA ? [data.settings.salesTaxRate, 0] : cc.vatRates).includes(suggestion.vatRate) ? suggestion.vatRate : r.vatRate;
        return { ...r, type: suggestion.type, category: validCat, vatRate: validVat, matchedRule: undefined };
      }));
    } catch { /* ignore errors, leave rows as-is */ }
    setAiLoading(false);
  }

  function handleParsedGrid(raw: string[][]) {
    if (raw.length < 2) { setError(lang === 'is' ? 'Skráin lítur út fyrir að vera tóm' : 'File appears to be empty'); return; }
    const parsed = parseBank(raw, format);
    if (parsed.length === 0) { setError(lang === 'is' ? 'Engar færslur fundust — prófaðu annað snið' : 'No rows parsed — try a different format'); return; }
    setRows(applyRulesToRows(parsed));
    setDone(0);
  }

  function processFile(file: File) {
    setError('');
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        if (isExcel) {
          const XLSX = await import('xlsx'); // lazy-loaded: keeps app startup small
          const wb = XLSX.read(ev.target?.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' });
          handleParsedGrid(raw as string[][]);
        } else {
          const raw = parseCsv(ev.target?.result as string);
          handleParsedGrid(raw);
        }
      } catch { setError(lang === 'is' ? 'Villa við lestur skrárinnar' : 'Error reading file'); }
    };
    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file, 'UTF-8');
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function saveRule(row: ImportRow, pattern: string) {
    if (!pattern.trim()) return;
    const existing = data.categoryRules.find(r => r.pattern.toLowerCase() === pattern.toLowerCase().trim());
    if (existing) {
      dispatch({ type: 'UPDATE_RULE', payload: { ...existing, category: row.category, type: row.type, vatRate: row.vatRate } });
    } else {
      const rule: CategoryRule = {
        id: `rule_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        pattern: pattern.trim(), category: row.category, type: row.type,
        vatRate: row.vatRate, useCount: 0,
        createdAt: new Date().toISOString().split('T')[0],
      };
      dispatch({ type: 'ADD_RULE', payload: rule });
    }
    setRows(prev => prev.map(r => r === row ? { ...r, learnOpen: false } : r));
  }

  function handleImport() {
    setImporting(true);
    const selected = rows.filter(r => r.selected);
    const rate = data.settings.exchangeRates.EUR;
    const ruleHits: Record<string, number> = {};

    // De-duplicate against existing transactions (and within this batch) using a
    // date|amount|description key, so re-importing an overlapping file is safe.
    const seen = new Set(data.transactions.map(tx => `${tx.date}|${Math.round(tx.amount)}|${tx.description}`));
    const newTxs: Transaction[] = [];
    selected.forEach(r => {
      const key = `${r.date}|${Math.round(r.amount)}|${r.description}`;
      if (seen.has(key)) return;
      seen.add(key);
      newTxs.push({
        id: newId(), date: r.date, description: r.description,
        category: r.category, type: r.type, amount: r.amount,
        currency: 'ISK', eurToIskRate: rate, vatRate: r.vatRate,
        reference: r.reference,
      });
      if (r.matchedRule) ruleHits[r.matchedRule] = (ruleHits[r.matchedRule] ?? 0) + 1;
    });

    if (newTxs.length > 0) dispatch({ type: 'ADD_TRANSACTIONS', payload: newTxs });
    // bump use counts for matched rules
    Object.entries(ruleHits).forEach(([ruleId, count]) => {
      const rule = data.categoryRules.find(r => r.id === ruleId);
      if (rule) dispatch({ type: 'UPDATE_RULE', payload: { ...rule, useCount: rule.useCount + count, lastUsed: new Date().toISOString().split('T')[0] } });
    });
    setDone(newTxs.length);
    setRows([]);
    setImporting(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  const inp = 'border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500';
  const selectedCount = rows.filter(r => r.selected).length;
  const RENDER_LIMIT = 300; // avoid freezing the page on huge historical imports
  const visibleRows = rows.slice(0, RENDER_LIMIT);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('bankimport')}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{lang === 'is' ? 'Flytja inn Excel eða CSV frá íslensku bönkum' : 'Import Excel or CSV from Icelandic banks'}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">{lang === 'is' ? '1. Veldu snið og skrá' : '1. Select format and file'}</h2>
        <div className="flex flex-wrap gap-3 mb-4">
          {(['arion', 'islandsbanki', 'landsbankinn', 'generic'] as BankFormat[]).map(f => (
            <button key={f} type="button" onClick={() => setFormat(f)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${format === f ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
              {f === 'arion' ? 'Arion' : f === 'islandsbanki' ? 'Íslandsbanki' : f === 'landsbankinn' ? 'Landsbankinn' : (lang === 'is' ? 'Almennt' : 'Generic')}
            </button>
          ))}
        </div>

        <label
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={e => { e.preventDefault(); setDragging(false); }}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${
            dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'
          }`}>
          <Upload className={`w-8 h-8 mb-2 ${dragging ? 'text-blue-500' : 'text-gray-400'}`} />
          <span className="text-sm font-medium text-gray-600">
            {dragging
              ? (lang === 'is' ? 'Slepptu skránni hér' : 'Drop the file here')
              : (lang === 'is' ? 'Dragðu skrá hingað eða smelltu til að velja' : 'Drag a file here or click to select')}
          </span>
          <span className="text-xs text-gray-400 mt-1">.xlsx · .xls · .csv · .txt</span>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={handleFile} />
        </label>

        {error && (
          <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}
        {done > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
            <Check className="w-4 h-4 flex-shrink-0" />{done} {lang === 'is' ? 'færslur fluttar inn' : 'transactions imported'}
          </div>
        )}

        <div className="mt-3 bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
          <p className="font-semibold">{lang === 'is' ? 'Dálkareglur (Excel eða CSV):' : 'Column rules (Excel or CSV):'}</p>
          <p>Arion: Dagsetning, Upphæð, Mynt, Skýring … (Excel-útflutningur úr netbanka)</p>
          <p>Íslandsbanki: Dagsetning, Lýsing, Tilvísun, Innborgun, Útborgun</p>
          <p>Landsbankinn: Dagsetning, Lýsing, Upphæð</p>
          <p>{lang === 'is' ? 'Almennt' : 'Generic'}: Dagsetning, Lýsing, Upphæð</p>
          <p className="text-gray-400 pt-1">{lang === 'is' ? 'Fyrirsagnarlínur efst eru hunsaðar sjálfkrafa.' : 'Header/metadata rows at the top are skipped automatically.'}</p>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">{lang === 'is' ? '2. Yfirfarðu og veldu' : '2. Review and select'}</h2>
              <p className="text-xs text-gray-500">{selectedCount}/{rows.length} {lang === 'is' ? 'valdar' : 'selected'}</p>
            </div>
            <div className="flex gap-2 items-center">
              {data.settings.anthropicKey && (
                <button onClick={aiCategorizeAll} disabled={aiLoading}
                  className="flex items-center gap-1.5 text-xs border border-purple-300 bg-purple-50 text-purple-700 px-2.5 py-1.5 rounded-lg hover:bg-purple-100 disabled:opacity-50 font-medium">
                  {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                  {aiLoading ? (lang === 'is' ? 'AI flokkar...' : 'AI categorizing...') : (lang === 'is' ? 'AI Flokkun' : 'AI Categorize')}
                </button>
              )}
              <button onClick={() => setRows(r => r.map(row => ({ ...row, selected: true })))}
                className="text-xs text-blue-600 hover:underline">{lang === 'is' ? 'Velja allt' : 'Select all'}</button>
              <span className="text-gray-300">|</span>
              <button onClick={() => setRows(r => r.map(row => ({ ...row, selected: false })))}
                className="text-xs text-gray-500 hover:underline">{lang === 'is' ? 'Hætta við allt' : 'Deselect all'}</button>
            </div>
          </div>
          {/* Auto-match summary */}
          {rows.filter(r => r.matchedRule).length > 0 && (
            <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2 text-xs text-blue-700">
              <Zap className="w-3.5 h-3.5 flex-shrink-0" />
              {rows.filter(r => r.matchedRule).length} {lang === 'is' ? 'færslur flokkaðar sjálfvirkt með reglum' : 'transactions auto-categorized by rules'}
            </div>
          )}
          {/* Large-import notice: only the first rows are shown, but all are imported */}
          {rows.length > RENDER_LIMIT && (
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2 text-xs text-amber-800">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {lang === 'is'
                ? `Sýni fyrstu ${RENDER_LIMIT} af ${rows.length} færslum — allar valdar færslur verða fluttar inn.`
                : `Showing the first ${RENDER_LIMIT} of ${rows.length} rows — all selected rows will still be imported.`}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-2 py-2 text-left text-gray-500">{t('date')}</th>
                  <th className="px-2 py-2 text-left text-gray-500">{t('description')}</th>
                  <th className="px-2 py-2 text-right text-gray-500">{lang === 'is' ? 'Upphæð' : 'Amount'}</th>
                  <th className="px-2 py-2 text-left text-gray-500">{t('type')}</th>
                  <th className="px-2 py-2 text-left text-gray-500">{t('category')}</th>
                  <th className="px-2 py-2 text-left text-gray-500">VSK%</th>
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibleRows.map((row, i) => (
                  <>
                    <tr key={i} className={`${!row.selected ? 'opacity-40' : ''} hover:bg-gray-50/50`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={row.selected}
                          onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, selected: e.target.checked } : r))}
                          className="w-4 h-4 rounded" />
                      </td>
                      <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{row.date}</td>
                      <td className="px-2 py-2 max-w-[180px]">
                        <div className="truncate text-gray-800">{row.description}</div>
                        {row.matchedRule && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Zap className="w-2.5 h-2.5 text-blue-500" />
                            <span className="text-blue-500 font-medium">{lang === 'is' ? 'Sjálfvirkt' : 'Auto'}</span>
                          </div>
                        )}
                      </td>
                      <td className={`px-2 py-2 text-right font-mono font-semibold ${row.type === 'income' ? 'text-green-700' : 'text-red-700'}`}>
                        {row.type === 'income' ? '+' : '-'}{Math.round(row.amount).toLocaleString()}
                      </td>
                      <td className="px-2 py-2">
                        <select value={row.type} className={inp}
                          onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, type: e.target.value as 'income' | 'expense', category: e.target.value === 'income' ? 'sala_thjonustu' : 'adrir_rekstrargjold', matchedRule: undefined } : r))}>
                          <option value="income">{t('income')}</option>
                          <option value="expense">{t('expense')}</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <select value={row.category} className={inp}
                          onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, category: e.target.value, matchedRule: undefined } : r))}>
                          {(row.type === 'income'
                            ? ['sala_vara','sala_thjonustu','fjarmagns_tekjur','adrar_tekjur']
                            : EXPENSE_CATEGORIES
                          ).map(c => <option key={c} value={c}>{t(c as never)}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <select value={row.vatRate} className={inp}
                          onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, vatRate: parseFloat(e.target.value) } : r))}>
                          {(cc.isUSA ? [data.settings.salesTaxRate, 0] : cc.vatRates)
                            .filter((r, i, arr) => arr.indexOf(r) === i)
                            .map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <button
                          title={lang === 'is' ? 'Vista sem reglu' : 'Save as rule'}
                          onClick={() => {
                            const keyword = row.description.split(/\s+/).slice(0, 2).join(' ');
                            setLearnPattern(keyword);
                            setRows(prev => prev.map((r, j) => j === i ? { ...r, learnOpen: !r.learnOpen } : r));
                          }}
                          className={`p-1 rounded hover:text-blue-600 ${row.learnOpen ? 'text-blue-600' : 'text-gray-400'}`}>
                          <BookOpen className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                    {row.learnOpen && (
                      <tr key={`learn-${i}`} className="bg-blue-50">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Zap className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                            <span className="text-xs font-medium text-blue-800">
                              {lang === 'is' ? 'Vista sem sjálfvirka reglu:' : 'Save as auto-rule:'}
                            </span>
                            <input
                              className="flex-1 border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white max-w-[200px]"
                              value={learnPattern}
                              onChange={e => setLearnPattern(e.target.value)}
                              placeholder={lang === 'is' ? 'Leitarorð...' : 'Keyword...'}
                              autoFocus
                            />
                            <button
                              onClick={() => saveRule(row, learnPattern)}
                              disabled={!learnPattern.trim()}
                              className="bg-blue-600 text-white px-3 py-1 rounded text-xs disabled:opacity-40 font-medium">
                              {lang === 'is' ? 'Vista' : 'Save'}
                            </button>
                            <button
                              onClick={() => setRows(prev => prev.map((r, j) => j === i ? { ...r, learnOpen: false } : r))}
                              className="text-gray-400 hover:text-gray-600 p-1">
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-xs text-blue-600 ml-1">→ {t(row.category as never)} ({row.vatRate}%)</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <button onClick={() => { setRows([]); if (fileRef.current) fileRef.current.value = ''; }}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <X className="w-4 h-4" />{lang === 'is' ? 'Hætta við' : 'Cancel'}
            </button>
            <button onClick={handleImport} disabled={selectedCount === 0 || importing}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40">
              <Check className="w-4 h-4" />
              {lang === 'is' ? `Flytja inn ${selectedCount} færslur` : `Import ${selectedCount} transactions`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
