import { useState, useRef, useEffect } from 'react';
import { Bot, Send, Trash2, Sparkles, Loader2, AlertCircle, RefreshCw, Mic, Paperclip, X, FileSpreadsheet, CheckCircle } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { ChatMessage, ApiMessage, ContentBlock, streamClaude, buildContext, buildChatSystem, generateInsights, txPool } from '../utils/ai';
import { useSpeechRecognition } from '../utils/useSpeechRecognition';
import { prepareAttachment, Attachment } from '../utils/attachment';
import { exportExcelTable } from '../utils/exports';
import { Transaction, TransactionType, Currency } from '../types';

interface ExcelReport { filename: string; sheet: string; columns: string[]; rows: (string | number)[][]; }

// A transaction the AI proposes to book (```jobboks-book``` block). The owner
// must tap "Book" to apply it — the AI proposes, the owner approves.
interface BookTx {
  date: string; description: string; type: TransactionType; category: string;
  amount: number; vatRate?: number; accountNumber?: string; interestAmount?: number;
}
function extractBook(content: string): { text: string; book: BookTx[] } {
  const m = content.match(/```jobboks-book\s*([\s\S]*?)```/);
  if (!m) return { text: content, book: [] };
  let book: BookTx[] = [];
  try {
    const p = JSON.parse(m[1].trim());
    if (Array.isArray(p?.transactions)) book = p.transactions;
  } catch { /* ignore malformed block */ }
  return { text: content.replace(m[0], '').trim(), book };
}

// A correction the AI proposes to an EXISTING transaction (```jobboks-fix```).
// `ref` is the row's 1-based position in txPool() — the #n the AI was shown.
// `was` is that row's date/amount as the AI saw it: checked before anything
// changes, so a stale ref (books edited mid-chat) can't rewrite the wrong row.
// `set` holds only the fields that change.
interface FixTx {
  ref: number;
  was?: { date?: string; amount?: number };
  set: Partial<Pick<Transaction, 'date' | 'description' | 'category' | 'type' | 'amount' | 'vatRate' | 'interestAmount'>> & { accountNumber?: string };
}
function extractFix(content: string): { text: string; fixes: FixTx[] } {
  const m = content.match(/```jobboks-fix\s*([\s\S]*?)```/);
  if (!m) return { text: content, fixes: [] };
  let fixes: FixTx[] = [];
  try {
    const p = JSON.parse(m[1].trim());
    if (Array.isArray(p?.fixes)) fixes = p.fixes.filter((f: FixTx) => f && Number.isFinite(Number(f.ref)) && f.set);
  } catch { /* ignore malformed block */ }
  return { text: content.replace(m[0], '').trim(), fixes };
}

// Pull an AI-generated ```jobboks-excel``` block out of a reply → the cleaned
// text (without the raw JSON) plus the report to offer as a download.
function extractExcel(content: string): { text: string; excel: ExcelReport | null } {
  const m = content.match(/```jobboks-excel\s*([\s\S]*?)```/);
  if (!m) return { text: content, excel: null };
  let excel: ExcelReport | null = null;
  try {
    const p = JSON.parse(m[1].trim());
    if (p && Array.isArray(p.columns) && Array.isArray(p.rows)) {
      excel = { filename: String(p.filename || 'skyrsla'), sheet: String(p.sheet || 'Skýrsla'), columns: p.columns.map(String), rows: p.rows };
    }
  } catch { /* ignore malformed block */ }
  return { text: content.replace(m[0], '').trim(), excel };
}

// Pull an AI-generated ```jobboks-remember``` block → the cleaned text plus the
// facts the AI wants to keep (`remember`) and stale ones it wants dropped
// (`forget`). Forgetting is what lets a corrected fact REPLACE an old one instead
// of piling up beside it — memory that can only grow accumulates contradictions.
function extractMemory(content: string): { text: string; remember: string[]; forget: string[] } {
  const m = content.match(/```jobboks-remember\s*([\s\S]*?)```/);
  if (!m) return { text: content, remember: [], forget: [] };
  let remember: string[] = [];
  let forget: string[] = [];
  try {
    const p = JSON.parse(m[1].trim());
    if (Array.isArray(p?.remember)) remember = p.remember.map((s: unknown) => String(s).trim()).filter(Boolean);
    if (Array.isArray(p?.forget)) forget = p.forget.map((s: unknown) => String(s).trim()).filter(Boolean);
  } catch { /* ignore malformed block */ }
  return { text: content.replace(m[0], '').trim(), remember, forget };
}

// Apply a remember/forget update to the Memory text: first drop any bullet that
// contains a `forget` phrase (case-insensitive), then append new facts, skipping
// ones already present. Returns the new text and which lines were removed (for
// the confirmation shown to the owner).
function updateMemory(existing: string, notes: string[], forget: string[]): { text: string; removed: string[] } {
  const removed: string[] = [];
  let lines = (existing ?? '').split('\n');
  if (forget.length) {
    const phrases = forget.map(f => f.toLowerCase());
    lines = lines.filter(line => {
      const hit = line.trim() && phrases.some(p => p && line.toLowerCase().includes(p));
      if (hit) removed.push(line.replace(/^-\s*/, '').trim());
      return !hit;
    });
  }
  const cur = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const have = cur.toLowerCase();
  const additions = notes.filter(n => n && !have.includes(n.toLowerCase()));
  const text = additions.length
    ? (cur ? `${cur}\n${additions.map(n => `- ${n}`).join('\n')}` : additions.map(n => `- ${n}`).join('\n'))
    : cur;
  return { text, removed };
}

function renderMarkdown(text: string): string {
  return text
    .replace(/^## (.+)$/gm, '<h3 class="text-base font-bold text-gray-900 mt-4 mb-1">$1</h3>')
    .replace(/^### (.+)$/gm, '<h4 class="text-sm font-bold text-gray-800 mt-3 mb-1">$1</h4>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br/>');
}

export default function AIAssistant() {
  const { data, t, lang, dispatch } = useApp();
  const [tab, setTab] = useState<'chat' | 'insights' | 'memory'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>(() => data.aiChat ?? []);

  // The year the AI is working on. One year at a time: it then gets EVERY row of
  // that year rather than a newest-first sweep that quietly drops the oldest.
  const yearsWithData = [...new Set(data.transactions.map(tx => new Date(tx.date).getFullYear()))]
    .sort((a, b) => b - a);
  const [aiYear, setAiYear] = useState<number | null>(() =>
    yearsWithData.includes(data.settings.fiscalYear) ? data.settings.fiscalYear : yearsWithData[0] ?? null);
  // Follow the app's working year: when the owner switches the fiscal year in the
  // main app, the AI re-scopes to it too, so it always sees the year being worked
  // on (not a stale year it defaulted to). Without this the AI screen kept its own
  // year and read the wrong rows — e.g. still on 2026 while the owner worked in 2020.
  // The owner can still override for the session via the year dropdown below.
  useEffect(() => {
    if (yearsWithData.includes(data.settings.fiscalYear)) setAiYear(data.settings.fiscalYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.settings.fiscalYear]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [insights, setInsights] = useState('');
  const [insightsLoading, setInsightsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Files attached to the next message (e.g. the greiðslutöflur for the loans).
  // Multiple so all loans can be sent together and compared in one question.
  // Handles spreadsheets/CSV/text, photos of documents, and PDFs.
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attaching, setAttaching] = useState(false);

  async function pickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError('');
    setAttaching(true);
    const parsed: Attachment[] = [];
    let failed = 0;
    for (const file of Array.from(files)) {
      try { parsed.push(await prepareAttachment(file)); }
      catch { failed++; }
    }
    if (parsed.length) setAttachments(prev => [...prev, ...parsed]);
    if (failed) setError(lang === 'is'
      ? `Gat ekki lesið ${failed} skrá(r). Prófaðu Excel, PDF, mynd, CSV eða texta.`
      : `Could not read ${failed} file(s). Try Excel, PDF, image, CSV or text.`);
    setAttaching(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  // Voice input: tap mic, talk, words stream into the box.
  const { listening, supported: micSupported, error: micError, start: startMic, stop: stopMic } = useSpeechRecognition(lang);
  const voiceBaseRef = useRef('');
  const voiceFinalRef = useRef('');

  function toggleMic() {
    if (loading) return;
    if (listening) { stopMic(); return; }
    voiceBaseRef.current = input ? input.trimEnd() + ' ' : '';
    voiceFinalRef.current = '';
    startMic((text, isFinal) => {
      if (isFinal) {
        voiceFinalRef.current += text;
        setInput(voiceBaseRef.current + voiceFinalRef.current);
      } else {
        setInput(voiceBaseRef.current + voiceFinalRef.current + text);
      }
      inputRef.current?.focus();
    });
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Remember the conversation long-term in the synced data (follows the user
  // across devices). Save once a reply finishes streaming, keeping the most
  // recent 100 messages so the blob can't grow without bound.
  useEffect(() => {
    if (loading) return;
    // Drop `api` (raw spreadsheet text, base64 photos) — those stay in memory for
    // this session only. Saving them would grow the synced blob by megabytes.
    dispatch({
      type: 'SET_AI_CHAT',
      payload: messages.slice(-100).map(({ role, content }) => ({ role, content })),
    });
  }, [messages, loading, dispatch]);

  async function sendMessage() {
    if ((!input.trim() && attachments.length === 0) || loading) return;
    if (listening) stopMic();

    // What the user sees in the thread: their text plus a small chip per file
    // (not the raw contents). What we send the AI: the actual file data —
    // spreadsheets/CSV as text, photos as image blocks, PDFs as document blocks.
    const chips = attachments.map(a => `📎 ${a.name}`).join('\n');
    const shown = (chips ? chips + '\n' : '') + input.trim();

    const textFiles = attachments.filter((a): a is Extract<Attachment, { kind: 'text' }> => a.kind === 'text');
    const mediaFiles = attachments.filter(a => a.kind !== 'text');
    // If the user picked a year for a big file, send that year's rows — a whole
    // year beats a random slice of seven. Always tell the AI when data is missing.
    const filesText = textFiles
      .map(a => {
        const slice = a.year ? a.years?.find(y => y.year === a.year) : undefined;
        const body = slice ? slice.text : a.text;
        const label = slice ? `"${a.name}" — year ${slice.year} only` : `"${a.name}"`;
        const warn = (slice ? slice.tooBig : a.truncated)
          ? '\nWARNING: this file was too big and part of it was NOT sent. Say so plainly. Never invent, guess at, or summarise rows you cannot see.'
          : '';
        return `Attached file ${label} (a table, e.g. a bank statement or payment schedule):${warn}\n"""\n${body}\n"""`;
      })
      .join('\n\n');

    let apiContent: string | ContentBlock[];
    if (mediaFiles.length > 0) {
      const blocks: ContentBlock[] = [];
      if (filesText) blocks.push({ type: 'text', text: filesText });
      for (const a of attachments) {
        if (a.kind === 'image') blocks.push({ type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.base64 } });
        else if (a.kind === 'pdf') blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.base64 } });
      }
      blocks.push({ type: 'text', text: input.trim() || (lang === 'is' ? 'Skoðaðu meðfylgjandi skjöl og hjálpaðu mér.' : 'Please review the attached document(s) and help me.') });
      apiContent = blocks;
    } else {
      apiContent = (filesText ? filesText + '\n\nUse the file(s) above to answer.\n\n' : '') + input.trim();
    }

    const userMsg: ChatMessage = { role: 'user', content: shown, api: apiContent };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setAttachments([]);
    setError('');
    setLoading(true);

    // Send every earlier turn with its files still attached — otherwise a bank
    // statement uploaded three messages ago is invisible and the AI starts guessing.
    const allMessages: ApiMessage[] = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.api ?? m.content,
    }));
    let assistantText = '';

    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      await streamClaude(
        buildChatSystem(data, lang, aiYear ?? undefined),
        allMessages,
        chunk => {
          assistantText += chunk;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'assistant', content: assistantText };
            return updated;
          });
        },
        'claude-sonnet-4-6',
        true, // allow live web lookup for tax rules/rates/deadlines
      );
      // If the AI chose to remember or correct something, update the long-term Memory.
      const { remember, forget } = extractMemory(assistantText);
      if (remember.length || forget.length) {
        dispatch({ type: 'SET_AI_MEMORY', payload: updateMemory(data.aiMemory ?? '', remember, forget).text });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('aiError'));
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  async function doGenerateInsights() {
    if (insightsLoading) return;
    setInsights('');
    setInsightsLoading(true);
    setError('');
    const context = buildContext(data, lang);
    let text = '';
    try {
      await generateInsights(context, lang, chunk => {
        text += chunk;
        setInsights(text);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('aiError'));
    } finally {
      setInsightsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  // The owner approved the AI's proposed entries → book them straight into Jobboks.
  // Then rewrite the message so the block can't be booked twice (persists in aiChat).
  function approveBook(msgIndex: number, book: BookTx[]) {
    for (const b of book) {
      const accountId = b.accountNumber
        ? data.accounts.find(a => a.number === String(b.accountNumber))?.id
        : undefined;
      const tx: Transaction = {
        id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: b.date,
        description: b.description,
        category: b.category,
        type: b.type,
        amount: Number(b.amount) || 0,
        currency: (data.settings.defaultCurrency || 'ISK') as Currency,
        eurToIskRate: 1,
        vatRate: Number(b.vatRate) || 0,
        ...(accountId ? { accountId } : {}),
        ...(b.interestAmount ? { interestAmount: Number(b.interestAmount) } : {}),
      };
      dispatch({ type: 'ADD_TRANSACTION', payload: tx });
    }
    const done = lang === 'is' ? `✅ Bókað í Jobboks: ${book.length} færsla(r)` : `✅ Booked into Jobboks: ${book.length} entr${book.length === 1 ? 'y' : 'ies'}`;
    setMessages(prev => prev.map((m, idx) =>
      idx === msgIndex ? { ...m, content: m.content.replace(/```jobboks-book\s*[\s\S]*?```/, `\n${done}`) } : m));
  }

  // Point a proposed fix back at the real transaction. Returns null when the ref
  // no longer lines up — the books can change mid-chat (a Book, an import, an
  // edit in the Transactions screen), which shifts every row's position. Checking
  // the AI's remembered date/amount means a stale ref is refused, never applied
  // to whatever row happens to sit at that number now.
  // Returns the row to change, or why it can't be changed. A fix naming a key
  // that isn't in the chart of accounts is refused rather than applied without
  // it — the key IS the change in most fixes, so silently dropping it would tell
  // the owner "fixed" while leaving the entry exactly as wrong as before.
  function resolveFix(f: FixTx): { tx: Transaction } | { tx: null; why: string } {
    const stale = lang === 'is'
      ? `Færsla #${f.ref} fannst ekki lengur — sleppt. Spurðu aftur svo AI-ið sjái nýju stöðuna.`
      : `Entry #${f.ref} no longer matches — skipped. Ask again so the AI sees the current books.`;
    const tx = txPool(data.transactions, aiYear ?? undefined)[Number(f.ref) - 1];
    if (!tx) return { tx: null, why: stale };
    if (f.was?.date && f.was.date !== tx.date) return { tx: null, why: stale };
    if (f.was?.amount != null && Math.round(Number(f.was.amount)) !== Math.round(tx.amount)) return { tx: null, why: stale };
    if (f.set.accountNumber && !data.accounts.some(a => a.number === String(f.set.accountNumber))) {
      return { tx: null, why: lang === 'is'
        ? `Lykill ${f.set.accountNumber} er ekki til í lyklaskránni — sleppt. Búðu hann til fyrst, eða veldu lykil sem er til.`
        : `Key ${f.set.accountNumber} is not in the chart of accounts — skipped. Create it first, or pick an existing key.` };
    }
    return { tx };
  }

  // The owner approved the AI's proposed corrections → write them into the books.
  // Every fix is resolved against the SAME pre-fix snapshot, so one fix changing a
  // date can't shift the row another fix in the batch points at.
  function applyFix(msgIndex: number, fixes: FixTx[]) {
    let applied = 0;
    let skipped = 0;
    for (const f of fixes) {
      const { tx } = resolveFix(f);
      if (!tx) { skipped++; continue; }
      const s = f.set;
      const accountId = s.accountNumber
        ? data.accounts.find(a => a.number === String(s.accountNumber))?.id
        : undefined;
      dispatch({
        type: 'UPDATE_TRANSACTION',
        payload: {
          ...tx,
          ...(s.date ? { date: s.date } : {}),
          ...(s.description ? { description: s.description } : {}),
          ...(s.category ? { category: s.category } : {}),
          ...(s.type ? { type: s.type } : {}),
          ...(s.amount != null ? { amount: Number(s.amount) || 0 } : {}),
          ...(s.vatRate != null ? { vatRate: Number(s.vatRate) || 0 } : {}),
          ...(s.interestAmount != null ? { interestAmount: Number(s.interestAmount) || 0 } : {}),
          ...(accountId ? { accountId } : {}),
        },
      });
      applied++;
    }
    const done = lang === 'is'
      ? `✅ Lagað í Jobboks: ${applied} færsla(r)${skipped ? ` — ${skipped} sleppt, fannst ekki lengur` : ''}`
      : `✅ Fixed in Jobboks: ${applied} entr${applied === 1 ? 'y' : 'ies'}${skipped ? ` — ${skipped} skipped, no longer matched` : ''}`;
    setMessages(prev => prev.map((m, idx) =>
      idx === msgIndex ? { ...m, content: m.content.replace(/```jobboks-fix\s*[\s\S]*?```/, `\n${done}`) } : m));
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Bot className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('ai')}</h1>
          {/* Which year the AI is looking at — always visible, so it is never a
              mystery whether an answer covers the year being worked on. */}
          {yearsWithData.length > 0 && (
            <select
              value={aiYear ?? 'all'}
              onChange={e => setAiYear(e.target.value === 'all' ? null : Number(e.target.value))}
              className="text-sm font-semibold bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-2 py-1"
              title={lang === 'is' ? 'Árið sem gervigreindin vinnur með' : 'The year the AI is working on'}
            >
              {yearsWithData.map(y => <option key={y} value={y}>{y}</option>)}
              <option value="all">{lang === 'is' ? 'Öll ár (yfirlit)' : 'All years (summary)'}</option>
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
            <button onClick={() => setTab('chat')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'chat' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {t('aiChat')}
            </button>
            <button onClick={() => setTab('insights')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'insights' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" />{t('aiInsights')}</span>
            </button>
            <button onClick={() => setTab('memory')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'memory' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {lang === 'is' ? 'Minni' : 'Memory'}
            </button>
          </div>
          {tab === 'chat' && messages.length > 0 && (
            <button onClick={() => { setMessages([]); setError(''); }}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 py-1.5 rounded-lg">
              <Trash2 className="w-3.5 h-3.5" /> {t('aiClear')}
            </button>
          )}
        </div>
      </div>

      {/* Chat Tab */}
      {tab === 'chat' && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-4 pb-2">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <Bot className="w-12 h-12 text-blue-200 mx-auto mb-3" />
                <p className="text-gray-500 text-sm font-medium">
                  {lang === 'is' ? 'Hvernig get ég hjálpað þér í dag?' : 'How can I help you today?'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  {(lang === 'is' ? [
                    'Hvernig líður rekstrinum?',
                    'Hverjar eru stærstu útgjaldirnar?',
                    'Eru einhverjar ógreiddar reikningar?',
                    'Skrifaðu lýsingu á reikning fyrir vefsíðugerð',
                  ] : [
                    'How is the business doing?',
                    'What are my biggest expenses?',
                    'Any overdue invoices?',
                    'Draft an invoice description for web design',
                  ]).map(suggestion => (
                    <button key={suggestion}
                      onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                      className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-full hover:bg-blue-100">
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mr-2 mt-1">
                    <Bot className="w-4 h-4 text-blue-600" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm'
                }`}>
                  {msg.role === 'assistant' && msg.content === '' && loading ? (
                    <div className="flex items-center gap-2 text-gray-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span className="text-xs">{lang === 'is' ? 'Hugsa...' : 'Thinking...'}</span>
                    </div>
                  ) : msg.role === 'assistant' ? (
                    (() => {
                      const { text: afterExcel, excel } = extractExcel(msg.content);
                      const { text: afterMem, remember, forget } = extractMemory(afterExcel);
                      const { text: afterBook, book } = extractBook(afterMem);
                      const { text, fixes } = extractFix(afterBook);
                      return (
                        <>
                          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
                          {excel && (
                            <button onClick={() => exportExcelTable(excel.filename, excel.sheet, excel.columns, excel.rows)}
                              className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700">
                              <FileSpreadsheet className="w-4 h-4" />
                              {lang === 'is' ? `Sækja Excel (${excel.rows.length} línur)` : `Download Excel (${excel.rows.length} rows)`}
                            </button>
                          )}
                          {(remember.length > 0 || forget.length > 0) && (
                            <div className="mt-3 flex items-start gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
                              <Sparkles className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                              <span>
                                {remember.length > 0 && <>{lang === 'is' ? 'Vistað í minni' : 'Saved to memory'}: {remember.join('; ')}</>}
                                {remember.length > 0 && forget.length > 0 && ' · '}
                                {forget.length > 0 && <>{lang === 'is' ? 'Leiðrétt (fjarlægt)' : 'Corrected (removed)'}: {forget.join('; ')}</>}
                              </span>
                            </div>
                          )}
                          {book.length > 0 && (
                            <div className="mt-3 border border-blue-200 rounded-lg overflow-hidden">
                              <div className="bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                                {lang === 'is' ? 'Tillaga að bókun — samþykktu til að bóka' : 'Proposed entries — approve to book'}
                              </div>
                              <div className="divide-y divide-gray-100">
                                {book.map((b, bi) => (
                                  <div key={bi} className="px-3 py-1.5 text-xs flex justify-between gap-3">
                                    <span className="text-gray-700">{b.date} · {b.description} <span className="text-gray-400">({b.category}{b.accountNumber ? ` → ${b.accountNumber}` : ''})</span></span>
                                    <span className={`font-mono flex-shrink-0 ${b.type === 'income' ? 'text-green-600' : 'text-gray-700'}`}>
                                      {b.type === 'income' ? '+' : b.type === 'transfer' ? '±' : '−'}{Number(b.amount).toLocaleString('is-IS')}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <button onClick={() => approveBook(i, book)}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                                <CheckCircle className="w-4 h-4" />
                                {lang === 'is' ? `Bóka ${book.length} færslu(r) í Jobboks` : `Book ${book.length} entr${book.length === 1 ? 'y' : 'ies'} into Jobboks`}
                              </button>
                            </div>
                          )}
                          {fixes.length > 0 && (() => {
                            // Show the real CURRENT row next to what it becomes, so the
                            // owner approves a change they can actually see. A fix whose
                            // ref no longer resolves is shown greyed out and is skipped.
                            const rows = fixes.map(f => ({ f, ...resolveFix(f) }));
                            const ok = rows.filter(r => r.tx).length;
                            return (
                              <div className="mt-3 border border-amber-200 rounded-lg overflow-hidden">
                                <div className="bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
                                  {lang === 'is' ? 'Tillaga að leiðréttingu — samþykktu til að laga' : 'Proposed corrections — approve to fix'}
                                </div>
                                <div className="divide-y divide-gray-100">
                                  {rows.map((r, fi) => { const { f, tx } = r; return (
                                    <div key={fi} className="px-3 py-1.5 text-xs">
                                      {tx ? (() => {
                                        // The key is the whole point of most fixes, so show it on
                                        // both lines — "enginn" when the entry has none yet.
                                        const wasKey = data.accounts.find(a => a.id === tx.accountId)?.number
                                          ?? (lang === 'is' ? 'enginn lykill' : 'no key');
                                        const nowKey = f.set.accountNumber ?? wasKey;
                                        return (
                                          <>
                                            <div className="text-gray-500 line-through">
                                              {tx.date} · {tx.description} · {tx.category} · {tx.amount.toLocaleString('is-IS')} · {wasKey}
                                            </div>
                                            <div className="text-gray-900 font-medium">
                                              {f.set.date ?? tx.date} · {f.set.description ?? tx.description} · {f.set.category ?? tx.category} · {(f.set.amount ?? tx.amount).toLocaleString('is-IS')} · {nowKey}
                                            </div>
                                          </>
                                        );
                                      })() : (
                                        <div className="text-gray-400">{r.why}</div>
                                      )}
                                    </div>
                                  ); })}
                                </div>
                                <button onClick={() => applyFix(i, fixes)} disabled={ok === 0}
                                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:bg-gray-300">
                                  <CheckCircle className="w-4 h-4" />
                                  {lang === 'is' ? `Laga ${ok} færslu(r) í Jobboks` : `Fix ${ok} entr${ok === 1 ? 'y' : 'ies'} in Jobboks`}
                                </button>
                              </div>
                            );
                          })()}
                        </>
                      );
                    })()
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 pt-3 border-t border-gray-100">
            {/* Attachment chips (one per file — e.g. the greiðslutöflur) */}
            {(attachments.length > 0 || attaching) && (
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {attachments.map((a, idx) => (
                  <div key={idx} className="flex flex-col gap-2 text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-2 max-w-full">
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate max-w-[160px]">{a.name}</span>
                      {a.kind === 'text' && a.year && <span className="font-medium">· {a.year}</span>}
                      {a.kind === 'text' && a.truncated && !a.year && (
                        <span className="text-blue-400">{lang === 'is' ? '(of stórt)' : '(too big)'}</span>
                      )}
                      <button onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} className="text-blue-400 hover:text-blue-700 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                    </div>
                    {/* Big statement covering many years — one tap picks the year to work on. */}
                    {a.kind === 'text' && a.years && a.years.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-blue-500">
                          {lang === 'is' ? 'Of stórt — veldu ár:' : 'Too big — pick a year:'}
                        </span>
                        {a.years.map(y => (
                          <button
                            key={y.year}
                            onClick={() => setAttachments(prev => prev.map((p, i) =>
                              i === idx && p.kind === 'text'
                                ? { ...p, year: p.year === y.year ? undefined : y.year }
                                : p))}
                            className={`px-2 py-1 rounded-md border ${a.year === y.year
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-white border-blue-200 text-blue-700 hover:border-blue-400'}`}
                            title={`${y.rows} ${lang === 'is' ? 'færslur' : 'rows'}`}
                          >
                            {y.year}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {attaching && (
                  <div className="flex items-center gap-2 text-xs bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />{lang === 'is' ? 'Les skrá…' : 'Reading file…'}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 items-end">
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt,.tsv,.pdf,image/*" multiple className="sr-only"
                onChange={e => pickFiles(e.target.files)} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={loading || attaching}
                title={lang === 'is' ? 'Hlaða upp skrám — Excel, PDF eða myndir (má velja margar)' : 'Upload files — Excel, PDF or photos (you can pick several)'}
                aria-label={lang === 'is' ? 'Hlaða upp skrám' : 'Upload files'}
                className="flex-shrink-0 p-3 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <Paperclip className="w-5 h-5" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={listening ? (lang === 'is' ? 'Ég er að hlusta…' : 'Listening…') : t('aiPlaceholder')}
                rows={1}
                className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                style={{ minHeight: '48px', maxHeight: '120px' }}
              />
              {micSupported && (
                <button
                  onClick={toggleMic}
                  disabled={loading}
                  aria-label={listening ? (lang === 'is' ? 'Stöðva upptöku' : 'Stop recording') : (lang === 'is' ? 'Tala' : 'Speak')}
                  className={`flex-shrink-0 p-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    listening
                      ? 'bg-red-500 text-white animate-pulse hover:bg-red-600'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  <Mic className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={sendMessage}
                disabled={(!input.trim() && attachments.length === 0) || loading}
                className="flex-shrink-0 bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
            {micError && (
              <p className="text-[11px] text-red-500 mt-1.5 text-center">{micError}</p>
            )}
            <p className="text-[10px] text-gray-400 mt-1.5 text-center">
              {listening
                ? (lang === 'is' ? '🎤 Talaðu núna · ýttu aftur á hljóðnemann til að stöðva' : '🎤 Speak now · tap the mic again to stop')
                : micSupported
                  ? (lang === 'is' ? 'Ýttu á hljóðnemann til að tala · Enter til að senda' : 'Tap the mic to talk · Enter to send')
                  : (lang === 'is' ? 'Enter til að senda · Shift+Enter fyrir nýja línu' : 'Enter to send · Shift+Enter for new line')}
            </p>
          </div>
        </div>
      )}

      {/* Insights Tab */}
      {tab === 'insights' && (
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={doGenerateInsights}
              disabled={insightsLoading}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {insightsLoading
                ? <><Loader2 className="w-4 h-4 animate-spin" />{lang === 'is' ? 'Greinir...' : 'Analyzing...'}</>
                : <><Sparkles className="w-4 h-4" />{t('aiGenerate')}</>
              }
            </button>
            {insights && !insightsLoading && (
              <button onClick={doGenerateInsights}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-xl">
                <RefreshCw className="w-3.5 h-3.5" /> {lang === 'is' ? 'Endurgera' : 'Regenerate'}
              </button>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          {!insights && !insightsLoading && (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <Sparkles className="w-10 h-10 text-blue-200 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">
                {lang === 'is'
                  ? 'Smelltu á "Greina gögn" til að fá ítarlega fjárhagsgreiningu byggða á raunverulegum gögnum þínum.'
                  : 'Click "Generate Analysis" to get a detailed financial analysis based on your actual data.'}
              </p>
            </div>
          )}

          {(insights || insightsLoading) && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              {insightsLoading && !insights && (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {lang === 'is' ? 'AI er að greina gögn þín...' : 'AI is analyzing your data...'}
                </div>
              )}
              {insights && (
                <div
                  className="prose prose-sm max-w-none text-gray-800 text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(insights) }}
                />
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'memory' && (
        <div className="flex-1 overflow-y-auto">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">{lang === 'is' ? 'Hvað á gervigreindin alltaf að muna?' : 'What should the AI always remember?'}</h3>
            <p className="text-xs text-gray-500 mb-3">
              {lang === 'is'
                ? 'Skrifaðu staðreyndir um fyrirtækið sem gervigreindin á að muna í hverju spjalli — t.d. reglur, viðskiptavini, óskir. Vistast sjálfkrafa og fylgir þér milli tækja.'
                : 'Write facts about your business the AI should recall in every chat — e.g. rules, key customers, preferences. Saved automatically and synced across your devices.'}
            </p>
            <textarea
              value={data.aiMemory ?? ''}
              onChange={e => dispatch({ type: 'SET_AI_MEMORY', payload: e.target.value })}
              rows={12}
              placeholder={lang === 'is' ? 'T.d. „Reikningar fara alltaf í tölvupósti, ekki prentað.“  „Aðalviðskiptavinur er Efra Skrið ehf.“' : 'e.g. "Always email invoices, never print."  "Main client is Efra Skrið ehf."'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-gray-400 mt-2">{lang === 'is' ? 'Gervigreindin les þetta í hvert skipti sem þú spjallar. Vistast sjálfkrafa.' : 'The AI reads this every time you chat. Saved automatically.'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
