import { useState, useRef, useEffect } from 'react';
import { Bot, Send, Trash2, Sparkles, Loader2, AlertCircle, RefreshCw, Mic, Paperclip, X, FileSpreadsheet, CheckCircle } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { ChatMessage, ApiMessage, ContentBlock, streamClaude, buildContext, buildChatSystem, generateInsights, txPool } from '../utils/ai';
import { useSpeechRecognition } from '../utils/useSpeechRecognition';
import { prepareAttachment, Attachment } from '../utils/attachment';
import { exportExcelTable } from '../utils/exports';
import { yearOf } from '../utils/calculations';
import { Transaction, TransactionType, Currency, Invoice, Job, JobStatus, CategoryRule, View } from '../types';
import { getAttention } from '../utils/attention';
import { COUNTRY_CONFIGS, findCaProvince } from '../data/countries';

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

// A standing categorisation rule the AI proposes (```jobboks-rule``` block): teach the
// app to auto-categorise every future matching transaction (e.g. "anything from Shell
// is fuel"). The owner taps "Create rule" — the AI proposes, the owner approves.
interface RuleProposal { pattern: string; category: string; type: TransactionType; vatRate?: number }
function extractRule(content: string): { text: string; rules: RuleProposal[] } {
  const m = content.match(/```jobboks-rule\s*([\s\S]*?)```/);
  if (!m) return { text: content, rules: [] };
  let rules: RuleProposal[] = [];
  try {
    const p = JSON.parse(m[1].trim());
    if (Array.isArray(p?.rules)) rules = p.rules;
  } catch { /* ignore malformed block */ }
  return { text: content.replace(m[0], '').trim(), rules };
}

// A contact the AI proposes to save (```jobboks-contact``` block): a customer (for
// invoicing) or a supplier. The owner taps "Add contact" — the AI proposes, owner approves.
interface ContactProposal {
  kind?: 'customer' | 'supplier';
  name: string; email?: string; phone?: string; address?: string; city?: string;
  postalCode?: string; kennitala?: string; vatNumber?: string; contactName?: string;
}
function extractContact(content: string): { text: string; contacts: ContactProposal[] } {
  const m = content.match(/```jobboks-contact\s*([\s\S]*?)```/);
  if (!m) return { text: content, contacts: [] };
  let contacts: ContactProposal[] = [];
  try {
    const p = JSON.parse(m[1].trim());
    if (Array.isArray(p?.contacts)) contacts = p.contacts;
  } catch { /* ignore malformed block */ }
  return { text: content.replace(m[0], '').trim(), contacts };
}

// A status change to an EXISTING invoice the AI proposes (```jobboks-invoice-status```):
// mark paid or sent. The owner taps to apply — the AI proposes, the owner approves.
interface InvoiceStatusUpdate { number: string; status: 'paid' | 'sent' }
function extractInvoiceStatus(content: string): { text: string; updates: InvoiceStatusUpdate[] } {
  const m = content.match(/```jobboks-invoice-status\s*([\s\S]*?)```/);
  if (!m) return { text: content, updates: [] };
  let updates: InvoiceStatusUpdate[] = [];
  try {
    const p = JSON.parse(m[1].trim());
    if (Array.isArray(p?.updates)) updates = p.updates;
  } catch { /* ignore malformed block */ }
  return { text: content.replace(m[0], '').trim(), updates };
}

// A request to connect ONLINE PAYMENTS (```jobboks-stripe``` block): the owner taps
// "Connect Stripe" and the app sends them to Stripe's OWN secure page to enter their
// bank/business details. The AI never sees or handles a banking detail — it only
// opens the door. No data payload: the block just signals the intent to connect.
function extractStripe(content: string): { text: string; connect: boolean } {
  const m = content.match(/```jobboks-stripe\s*([\s\S]*?)```/);
  if (!m) return { text: content, connect: false };
  let connect = false;
  try { connect = JSON.parse(m[1].trim())?.connect === true; } catch { /* ignore malformed block */ }
  return { text: content.replace(m[0], '').trim(), connect };
}

// The business setup the AI proposes for a new user (```jobboks-setup``` block):
// country + (US) state/rate + company name. The owner taps "Set up" to apply — the
// AI directs, the owner confirms. This is the "it set itself up for me" moment.
interface SetupProposal {
  country?: string;      // 2-letter code the app supports (US, IS, CA, GB, …)
  state?: string;        // US state code, e.g. "CO"
  salesTaxRate?: number; // US only
  province?: string;     // Canada province/territory name or code, e.g. "Ontario" / "ON"
  companyName?: string;
}
function extractSetup(content: string): { text: string; setup: SetupProposal | null } {
  const m = content.match(/```jobboks-setup\s*([\s\S]*?)```/);
  if (!m) return { text: content, setup: null };
  let setup: SetupProposal | null = null;
  try { const p = JSON.parse(m[1].trim()); if (p && typeof p === 'object') setup = p; } catch { /* ignore malformed block */ }
  return { text: content.replace(m[0], '').trim(), setup };
}

// An invoice the AI drafts (```jobboks-invoice``` block): the owner enters the GROSS
// amount and it's created as a DRAFT on one tap (net = gross ÷ (1+rate)). The AI
// directs, the owner confirms — nothing is issued until they tap.
interface InvoiceProposal { customer: string; description?: string; amount: number; vatRate?: number; }
function extractInvoice(content: string): { text: string; invoices: InvoiceProposal[] } {
  const m = content.match(/```jobboks-invoice(?!-)\s*([\s\S]*?)```/);
  if (!m) return { text: content, invoices: [] };
  let invoices: InvoiceProposal[] = [];
  try { const p = JSON.parse(m[1].trim()); if (Array.isArray(p?.invoices)) invoices = p.invoices; } catch { /* ignore malformed block */ }
  return { text: content.replace(m[0], '').trim(), invoices };
}

// An ESTIMATE the AI drafts from a spoken/typed site-visit description
// (```jobboks-quote``` block): the "just talk and the estimate writes itself"
// moment. Each thing the contractor mentions (materials, labour, …) becomes its
// own line; the app extracts the tax from each GROSS line amount. Created as a
// DRAFT quote (number T####) on one tap — the AI drafts, the owner reviews/sends.
interface QuoteLine { description?: string; amount: number; vatRate?: number }
interface QuoteProposal { customer: string; address?: string; validDays?: number; description?: string; amount?: number; vatRate?: number; lines?: QuoteLine[] }
function extractQuote(content: string): { text: string; quotes: QuoteProposal[] } {
  const m = content.match(/```jobboks-quote\s*([\s\S]*?)```/);
  if (!m) return { text: content, quotes: [] };
  let quotes: QuoteProposal[] = [];
  try { const p = JSON.parse(m[1].trim()); if (Array.isArray(p?.quotes)) quotes = p.quotes; } catch { /* ignore malformed block */ }
  return { text: content.replace(m[0], '').trim(), quotes };
}

// A job / site-visit the AI logs from a sentence (```jobboks-job``` block). Default
// status is 'survey' (the site-visit-first pipeline). The owner taps "Create job".
interface JobProposal { name: string; client?: string; address?: string; status?: string; quotedAmount?: number; description?: string; }
function extractJob(content: string): { text: string; jobs: JobProposal[] } {
  const m = content.match(/```jobboks-job\s*([\s\S]*?)```/);
  if (!m) return { text: content, jobs: [] };
  let jobs: JobProposal[] = [];
  try { const p = JSON.parse(m[1].trim()); if (Array.isArray(p?.jobs)) jobs = p.jobs; } catch { /* ignore malformed block */ }
  return { text: content.replace(m[0], '').trim(), jobs };
}

// A settings change the AI proposes (```jobboks-settings``` block). Only a safe
// whitelist of user-facing settings can be changed (never API keys, Supabase, plan,
// or permissions — those are handled by applySettings, which ignores anything else).
// The owner taps "Apply" — the AI guides + does it, the owner confirms.
type SettingsSet = Record<string, string | number | boolean>;
function extractSettings(content: string): { text: string; settings: SettingsSet | null } {
  const m = content.match(/```jobboks-settings\s*([\s\S]*?)```/);
  if (!m) return { text: content, settings: null };
  let settings: SettingsSet | null = null;
  try { const p = JSON.parse(m[1].trim()); if (p && typeof p.set === 'object' && p.set) settings = p.set; } catch { /* ignore malformed block */ }
  return { text: content.replace(m[0], '').trim(), settings };
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
// A correction the AI proposes by DESCRIPTION MATCH instead of by row ref. This
// is what makes "fix every X across ALL years" work: the AI only knows the
// counterparty NAME (it can't hold every year's rows, and refs are year-scoped),
// so it says "match this name → this change" and the APP finds every matching
// row across the whole dataset itself. No year switching, nothing dropped.
interface MatchFix {
  desc: string;                 // description to match (exact by default)
  contains?: boolean;           // true = substring match instead of exact
  type?: Transaction['type'];   // optional: only rows of this type
  year?: number;                // optional: only this year (else all years)
  date?: string;                // optional: only this exact date (YYYY-MM-DD)
  set: FixTx['set'];
}
// Case- and accent-insensitive fold, so a match term like "kronan"/"vordur"
// catches the accented "Krónan"/"Vörður" the bank export mixes in. NFD splits an
// accented letter into base + combining mark; we strip the marks and lowercase.
const foldAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/æ/g, 'ae').replace(/ø/g, 'o');
// Expand a SHARED-set fix block into individual FixTx. `refs` all get the same
// `set`; `amts` (optional, parallel to refs) keeps the stale-ref amount guard.
function sharedFixes(set: unknown, refs: unknown, amts?: unknown): FixTx[] {
  const rs = Array.isArray(refs) ? refs : [];
  const as = Array.isArray(amts) ? amts : [];
  return rs
    .map((r, i): FixTx => ({
      ref: Number(r),
      set: set as FixTx['set'],
      was: as[i] != null ? { amount: Number(as[i]) } : undefined,
    }))
    .filter(f => Number.isFinite(f.ref) && f.set && typeof f.set === 'object');
}
// Parse a ```jobboks-fix``` JSON body. Shapes accepted:
//   verbose:  {"fixes":[{"ref":12,"was":{...},"set":{...}}, ...]}
//   compact:  {"set":{...shared...},"refs":[12,13,...],"amts":[42000,...]}
//   match:    {"match":{"desc":"...","type"?,"year"?,"contains"?},"set":{...}}
//             (or {"matches":[ ...same... ]})
// The compact shape exists because the verbose one repeats date+amount on EVERY
// row, so a large batch (all → the same key) overflows the model's output token
// limit and the block is cut off before its closing fence. Compact shares one
// `set` across every ref, so ~60 rows fit where ~15 verbose ones did. The match
// shape goes further: it needs NO refs at all, so it reclassifies every matching
// row across ALL years even though the AI can only ever see one year's rows.
function parseFixBody(body: string): { fixes: FixTx[]; matches: MatchFix[] } {
  // `shared` is a top-level "set" (the single-match shape {"match":{...},"set":{...}}
  // puts it there); a per-item "set" inside a matches[] entry overrides it.
  const toMatch = (m: unknown, shared: unknown): MatchFix | null => {
    const raw = (m ?? {}) as MatchFix & { match?: MatchFix };
    // Accept BOTH shapes the model uses: flat {desc,…,set} and nested
    // {match:{desc,…},set}. It sometimes wraps the criteria in an inner "match"
    // object — before this that parsed to nothing and the block was rejected.
    const crit = (raw.match && typeof raw.match === 'object') ? raw.match : raw;
    const set = (raw.set && typeof raw.set === 'object') ? raw.set
      : (crit.set && typeof crit.set === 'object') ? crit.set
      : (shared as FixTx['set']);
    return typeof crit.desc === 'string' && crit.desc.trim() && set && typeof set === 'object'
      ? { desc: crit.desc, contains: crit.contains, type: crit.type, year: crit.year != null ? Number(crit.year) : undefined, date: typeof crit.date === 'string' ? crit.date : undefined, set }
      : null;
  };
  try {
    const p = JSON.parse(body);
    if (p?.match || Array.isArray(p?.matches)) {
      const raw = Array.isArray(p.matches) ? p.matches : [p.match];
      return { fixes: [], matches: raw.map((m: unknown) => toMatch(m, p.set)).filter(Boolean) as MatchFix[] };
    }
    if (Array.isArray(p?.fixes)) return { fixes: p.fixes.filter((f: FixTx) => f && Number.isFinite(Number(f.ref)) && f.set), matches: [] };
    if (p?.set && Array.isArray(p?.refs)) return { fixes: sharedFixes(p.set, p.refs, p.amts), matches: [] };
    return { fixes: [], matches: [] };
  } catch { /* fall through and salvage a truncated block */ }
  // Salvage: the JSON did not parse — almost always because the block was
  // truncated mid-array. Recover the rows that DID arrive so the owner still
  // gets a Laga banner instead of nothing. Only the compact shape is salvaged
  // (its `set` is flat and comes first); a truncated compact block is the case
  // that can still overflow at extreme scale.
  const setM = body.match(/"set"\s*:\s*(\{[^{}]*\})/);
  if (setM) {
    try {
      const set = JSON.parse(setM[1]);
      const nums = (key: string): number[] => {
        const a = body.match(new RegExp(`"${key}"\\s*:\\s*\\[([0-9.,\\s]*)`));
        return a ? a[1].split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n)) : [];
      };
      const refs = nums('refs');
      if (refs.length) return { fixes: sharedFixes(set, refs, nums('amts')), matches: [] };
    } catch { /* ignore — nothing safely recoverable */ }
  }
  return { fixes: [], matches: [] };
}
function extractFix(content: string): { text: string; fixes: FixTx[]; matches: MatchFix[]; badBlock: boolean } {
  const fixes: FixTx[] = [];
  const matches: MatchFix[] = [];
  const strip: string[] = [];
  let badBlock = false;
  // Tolerant on purpose. The model sometimes tags the block ```json (or leaves it
  // untagged), or splits it into SEVERAL blocks — before this, any of those meant
  // the block silently vanished with NO button and NO error ("engin block"). We
  // now accept: the correctly-tagged block, any other fenced block whose JSON is
  // clearly fix-shaped, and multiple blocks — merging them all. A ```jobboks-fix
  // block that parses to nothing sets badBlock so the UI reports it instead of
  // showing nothing.
  const fenceRe = /```([a-zA-Z0-9_-]*)[^\S\r\n]*\r?\n?([\s\S]*?)(?:```|$)/g;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(content)) !== null) {
    const tagged = m[1] === 'jobboks-fix';
    const body = m[2].trim();
    if (!tagged && !/["'](fixes|refs|match|matches)["']\s*:/.test(body)) continue;
    const parsed = parseFixBody(body);
    if (parsed.fixes.length || parsed.matches.length) {
      fixes.push(...parsed.fixes);
      matches.push(...parsed.matches);
      strip.push(m[0]);
    } else if (tagged) {
      // A jobboks-fix block that parsed to nothing: flag it AND leave it visible
      // (don't strip) so the owner can see/share exactly what the AI wrote — the
      // only way to tell why it didn't parse.
      badBlock = true;
    }
  }
  let text = content;
  for (const s of strip) text = text.replace(s, '');
  return { text: text.trim(), fixes, matches, badBlock };
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

export default function AIAssistant({ setView }: { setView?: (v: View) => void }) {
  const { data, t, lang, dispatch, fmtISK } = useApp();
  const attention = getAttention(data);
  const [tab, setTab] = useState<'chat' | 'insights' | 'memory'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>(() => data.aiChat ?? []);
  // A brand-new user with an empty app — greet them like a concierge (slice 2)
  // rather than the generic "how can I help" prompt.
  const isNewUser = (data.transactions?.length ?? 0) === 0 && (data.invoices?.length ?? 0) === 0 && (data.jobs?.length ?? 0) === 0;

  // The year the AI is working on. One year at a time: it then gets EVERY row of
  // that year rather than a newest-first sweep that quietly drops the oldest.
  const yearsWithData = [...new Set(data.transactions.map(tx => yearOf(tx.date)))]
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
  const [stripeBusy, setStripeBusy] = useState(false);
  const [stripeErr, setStripeErr] = useState<string | null>(null);

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

  // The owner approved the AI's proposed setup → configure the business. Reuses the
  // exact country-apply path onboarding uses (COUNTRY_CONFIGS → settings), plus the
  // US state rate (mirrors applyUsRate) and an optional company name.
  function applySetup(msgIndex: number, setup: SetupProposal) {
    const code = String(setup.country || '').toUpperCase();
    const cc = COUNTRY_CONFIGS[code];
    if (!cc) {
      const err = lang === 'is' ? `⚠️ Þekki ekki landið „${setup.country}“.` : `⚠️ Unknown country "${setup.country}".`;
      setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, content: m.content.replace(/```jobboks-setup\s*[\s\S]*?```/, `\n${err}`) } : m));
      return;
    }
    const usRate = code === 'US' && setup.salesTaxRate != null ? (Number(setup.salesTaxRate) || 0) : null;
    // Canada: the AI names the province; the app looks up the canonical combined
    // GST/HST rate (same table as the Settings picker) — GST/HST is a recoverable VAT.
    const caProv = code === 'CA' && setup.province ? findCaProvince(String(setup.province)) : null;
    const rate = usRate != null ? usRate : caProv ? caProv.rate : null;
    dispatch({ type: 'UPDATE_SETTINGS', payload: {
      country: code,
      defaultCurrency: cc.currency,
      taxWithholdingRate: cc.taxWithholdingRate,
      employeePensionRate: cc.employeePensionRate,
      employerPensionRate: cc.employerPensionRate,
      socialInsuranceRate: cc.socialInsuranceRate,
      personalDeductionMonthly: cc.personalDeductionMonthly,
      vatRates: rate != null ? Array.from(new Set([rate, 0])) : cc.vatRates,
      standardRate: rate != null ? rate : cc.standardRate,
      vatTerm: cc.vatTerm,
      taxAuthority: cc.taxAuthority,
      companyIdLabel: cc.companyIdLabel,
      vatNumberLabel: cc.vatNumberLabel,
      ...(setup.state ? { usState: String(setup.state).toUpperCase() } : {}),
      ...(caProv ? { caProvince: caProv.name } : {}),
      ...(usRate != null ? { salesTaxRate: usRate } : {}),
      ...(setup.companyName ? { company: { ...data.settings.company, name: String(setup.companyName) } } : {}),
    }});
    const done = lang === 'is'
      ? `✅ Uppsett: ${cc.nameEn}${setup.companyName ? ` · ${setup.companyName}` : ''}`
      : `✅ Set up: ${cc.nameEn}${setup.companyName ? ` · ${setup.companyName}` : ''}`;
    setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, content: m.content.replace(/```jobboks-setup\s*[\s\S]*?```/, `\n${done}`) } : m));
  }

  // The owner approved the AI's drafted invoice(s) → create them as DRAFTS. The
  // owner enters a GROSS amount; the line stores net = gross ÷ (1+rate) so the
  // invoice total reproduces the gross exactly (same math as bulk invoicing).
  // Sequential numbers off invoiceLastNumber; new customers saved to Viðskiptavinir.
  function applyInvoice(msgIndex: number, invoices: InvoiceProposal[]) {
    const s = data.settings;
    const today = new Date().toISOString().split('T')[0];
    const due = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    let seq = s.invoiceLastNumber;
    const added: string[] = [];
    for (const iv of invoices) {
      const name = String(iv.customer || '').trim();
      const gross = Number(iv.amount) || 0;
      if (!name || gross <= 0) continue;
      seq += 1;
      const rate = Number(iv.vatRate) || 0;
      const net = rate ? gross / (1 + rate / 100) : gross;
      const existing = (data.customers ?? []).find(c => c.name.trim().toLowerCase() === name.toLowerCase());
      const inv: Invoice = {
        id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'invoice',
        number: `${s.invoicePrefix}${String(seq).padStart(4, '0')}`,
        date: today, dueDate: due,
        customer: existing
          ? { name: existing.name, kennitala: existing.kennitala, address: existing.address, postalCode: existing.postalCode, city: existing.city, email: existing.email, phone: existing.phone }
          : { name },
        lines: [{ id: `ln_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, description: String(iv.description || (lang === 'is' ? 'Verk og þjónusta' : 'Work and services')), quantity: 1, unitPrice: net, vatRate: rate }],
        notes: '', status: 'draft', currency: s.defaultCurrency, eurToIskRate: s.exchangeRates.EUR,
      };
      dispatch({ type: 'ADD_INVOICE', payload: inv });
      const key = name.toLowerCase();
      if (!existing && !added.includes(key)) {
        added.push(key);
        dispatch({ type: 'ADD_CUSTOMER', payload: { id: `cust_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name, createdAt: new Date().toISOString() } });
      }
    }
    dispatch({ type: 'UPDATE_SETTINGS', payload: { invoiceLastNumber: seq } });
    const n = seq - s.invoiceLastNumber;
    const done = lang === 'is' ? `✅ ${n} reikningur búinn til sem drög` : `✅ ${n} invoice${n === 1 ? '' : 's'} created as draft${n === 1 ? '' : 's'}`;
    setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, content: m.content.replace(/```jobboks-invoice(?!-)\s*[\s\S]*?```/, `\n${done}`) } : m));
  }

  // The owner approved an AI-drafted ESTIMATE → create it as a DRAFT quote (T####),
  // mirroring the Invoices screen's quote path: separate quoteLastNumber sequence,
  // 14-day (or stated) validity, net extracted per line from the GROSS the customer
  // pays. A new client name is saved to Viðskiptavinir so the quote can be reused.
  function applyQuote(msgIndex: number, quotes: QuoteProposal[]) {
    const s = data.settings;
    const today = new Date().toISOString().split('T')[0];
    let seq = s.quoteLastNumber;
    const added: string[] = [];
    let made = 0;
    for (const q of quotes) {
      const name = String(q.customer || '').trim();
      // Lines: use the itemised list if given, else fall back to a single lump line.
      const rawLines: QuoteLine[] = (Array.isArray(q.lines) && q.lines.length)
        ? q.lines
        : [{ description: q.description, amount: Number(q.amount) || 0, vatRate: q.vatRate }];
      const lines = rawLines
        .map(l => {
          const gross = Number(l.amount) || 0;
          const rate = Number(l.vatRate) || 0;
          return { gross, rate, description: String(l.description || (lang === 'is' ? 'Verk og þjónusta' : 'Work and services')) };
        })
        .filter(l => l.gross > 0);
      if (!name || !lines.length) continue;
      seq += 1;
      const validDays = Number(q.validDays) > 0 ? Number(q.validDays) : 14;
      const due = new Date(Date.now() + validDays * 86400000).toISOString().split('T')[0];
      const existing = (data.customers ?? []).find(c => c.name.trim().toLowerCase() === name.toLowerCase());
      const inv: Invoice = {
        id: `qte_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'quote',
        number: `T${String(seq).padStart(4, '0')}`,
        date: today, dueDate: due,
        customer: existing
          ? { name: existing.name, kennitala: existing.kennitala, address: existing.address, postalCode: existing.postalCode, city: existing.city, email: existing.email, phone: existing.phone }
          : { name, address: q.address },
        lines: lines.map(l => ({
          id: `ln_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          description: l.description, quantity: 1,
          unitPrice: l.rate ? l.gross / (1 + l.rate / 100) : l.gross,
          vatRate: l.rate,
        })),
        notes: '', status: 'draft', currency: s.defaultCurrency, eurToIskRate: s.exchangeRates.EUR,
      };
      dispatch({ type: 'ADD_INVOICE', payload: inv });
      made += 1;
      const key = name.toLowerCase();
      if (!existing && !added.includes(key)) {
        added.push(key);
        dispatch({ type: 'ADD_CUSTOMER', payload: { id: `cust_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name, address: q.address, createdAt: new Date().toISOString() } });
      }
    }
    if (made) dispatch({ type: 'UPDATE_SETTINGS', payload: { quoteLastNumber: seq } });
    const done = lang === 'is' ? `✅ ${made} tilboð búið til sem drög` : `✅ ${made} estimate${made === 1 ? '' : 's'} created as draft${made === 1 ? '' : 's'}`;
    setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, content: m.content.replace(/```jobboks-quote\s*[\s\S]*?```/, `\n${done}`) } : m));
  }

  // The owner approved AI-logged job(s) → create them. Numbers run JOB-YYYY-NNN off
  // the count of this year's jobs; status defaults to 'survey' (site visit); a new
  // client name is saved to Viðskiptavinir. Mirrors the Jobs screen's saveJob path.
  function applyJob(msgIndex: number, jobs: JobProposal[]) {
    const now = new Date().toISOString();
    const year = new Date().getFullYear();
    const valid: JobStatus[] = ['survey', 'scheduled', 'active', 'paused', 'complete', 'cancelled'];
    let count = (data.jobs ?? []).filter(j => j.number.includes(String(year))).length;
    const added: string[] = [];
    let made = 0;
    for (const jp of jobs) {
      const name = String(jp.name || '').trim();
      if (!name) continue;
      count += 1; made += 1;
      const client = String(jp.client || '').trim();
      const job: Job = {
        id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        number: `JOB-${year}-${String(count).padStart(3, '0')}`,
        name,
        clientName: client,
        status: valid.includes(jp.status as JobStatus) ? (jp.status as JobStatus) : 'survey',
        currency: data.settings.defaultCurrency,
        quotedAmount: Number(jp.quotedAmount) || 0,
        ...(jp.address ? { address: String(jp.address) } : {}),
        ...(jp.description ? { description: String(jp.description) } : {}),
        createdAt: now, updatedAt: now,
      };
      dispatch({ type: 'ADD_JOB', payload: job });
      const key = client.toLowerCase();
      if (client && !(data.customers ?? []).some(c => c.name.trim().toLowerCase() === key) && !added.includes(key)) {
        added.push(key);
        dispatch({ type: 'ADD_CUSTOMER', payload: { id: `cust_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: client, createdAt: now } });
      }
    }
    const done = lang === 'is' ? `✅ ${made} verk skráð` : `✅ ${made} job${made === 1 ? '' : 's'} created`;
    setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, content: m.content.replace(/```jobboks-job\s*[\s\S]*?```/, `\n${done}`) } : m));
  }

  // The owner approved an AI-proposed settings change → apply only the SAFE,
  // whitelisted user-facing settings; any other key (API keys, Supabase, plan,
  // permissions, …) is silently ignored, so the AI can never touch sensitive config.
  function applySettings(msgIndex: number, set: SettingsSet) {
    const s = data.settings;
    const payload: Record<string, unknown> = {};
    const company = { ...s.company };
    let touchedCompany = false;
    for (const [k, v] of Object.entries(set)) {
      switch (k) {
        case 'companyName': company.name = String(v); touchedCompany = true; break;
        case 'companyEmail': company.email = String(v); touchedCompany = true; break;
        case 'companyPhone': company.phone = String(v); touchedCompany = true; break;
        case 'companyAddress': company.address = String(v); touchedCompany = true; break;
        case 'companyId': company.kennitala = String(v); touchedCompany = true; break;
        case 'invoicePrefix': payload.invoicePrefix = String(v); break;
        case 'pricesIncludeVAT': payload.pricesIncludeVAT = Boolean(v); break;
        case 'paymentsEnabled': payload.paymentsEnabled = Boolean(v); break;
        case 'defaultCurrency': payload.defaultCurrency = String(v); break;
        case 'fiscalYear': payload.fiscalYear = Number(v); break;
        case 'salesTaxRate': {
          const r = Number(v) || 0;
          payload.salesTaxRate = r;
          if (s.country === 'US') { payload.standardRate = r; payload.vatRates = Array.from(new Set([r, 0])); }
          break;
        }
        default: break; // unknown / unsafe key → ignored
      }
    }
    if (touchedCompany) payload.company = company;
    if (Object.keys(payload).length === 0) {
      const err = lang === 'is' ? '⚠️ Ekkert öruggt til að breyta þar.' : '⚠️ Nothing safe to change there.';
      setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, content: m.content.replace(/```jobboks-settings\s*[\s\S]*?```/, `\n${err}`) } : m));
      return;
    }
    dispatch({ type: 'UPDATE_SETTINGS', payload });
    const done = lang === 'is' ? '✅ Stillingum breytt' : '✅ Settings updated';
    setMessages(prev => prev.map((m, idx) => idx === msgIndex ? { ...m, content: m.content.replace(/```jobboks-settings\s*[\s\S]*?```/, `\n${done}`) } : m));
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

  // The owner approved a proposed categorisation rule → save it so future imports
  // auto-categorise anything matching the pattern (same engine as the Flokkunarreglur screen).
  function approveRule(msgIndex: number, rules: RuleProposal[]) {
    let n = 0;
    for (const r of rules) {
      if (!String(r.pattern ?? '').trim()) continue;
      const rule: CategoryRule = {
        id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        pattern: String(r.pattern).trim(),
        category: r.category,
        type: r.type,
        vatRate: (Number(r.vatRate) || 0) as CategoryRule['vatRate'],
        useCount: 0,
        createdAt: new Date().toISOString().split('T')[0],
      };
      dispatch({ type: 'ADD_RULE', payload: rule });
      n++;
    }
    const done = lang === 'is' ? `✅ Flokkunarregla búin til: ${n}` : `✅ Rule${n === 1 ? '' : 's'} created: ${n}`;
    setMessages(prev => prev.map((m, idx) =>
      idx === msgIndex ? { ...m, content: m.content.replace(/```jobboks-rule\s*[\s\S]*?```/, `\n${done}`) } : m));
  }

  // The owner approved a proposed contact → save it as a reusable customer or supplier.
  function approveContact(msgIndex: number, contacts: ContactProposal[]) {
    let n = 0;
    for (const c of contacts) {
      if (!String(c.name ?? '').trim()) continue;
      const now = new Date().toISOString();
      const rid = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      if (c.kind === 'supplier') {
        dispatch({ type: 'ADD_SUPPLIER', payload: {
          id: `sup_${rid}`, name: String(c.name).trim(),
          contactName: c.contactName, email: c.email, phone: c.phone, address: c.address,
          vatNumber: c.vatNumber, currency: (data.settings.defaultCurrency || 'ISK') as Currency, createdAt: now,
        }});
      } else {
        dispatch({ type: 'ADD_CUSTOMER', payload: {
          id: `cust_${rid}`, name: String(c.name).trim(),
          kennitala: c.kennitala, address: c.address, postalCode: c.postalCode, city: c.city,
          email: c.email, phone: c.phone, createdAt: now,
        }});
      }
      n++;
    }
    const done = lang === 'is' ? `✅ Tengiliður skráður: ${n}` : `✅ Contact${n === 1 ? '' : 's'} added: ${n}`;
    setMessages(prev => prev.map((m, idx) =>
      idx === msgIndex ? { ...m, content: m.content.replace(/```jobboks-contact\s*[\s\S]*?```/, `\n${done}`) } : m));
  }

  // The owner approved an invoice status change → flip it (paid/sent only). Marking
  // paid is non-financial in this app (income is booked from the bank deposit).
  function approveInvoiceStatus(msgIndex: number, updates: InvoiceStatusUpdate[]) {
    let n = 0;
    for (const u of updates) {
      const num = String(u.number ?? '').trim();
      const status = u.status === 'sent' ? 'sent' : u.status === 'paid' ? 'paid' : null;
      if (!num || !status) continue;
      const inv = (data.invoices ?? []).find(x => x.type === 'invoice' && x.number === num);
      if (!inv) continue;
      dispatch({ type: 'UPDATE_INVOICE', payload: { ...inv, status } });
      n++;
    }
    const done = lang === 'is' ? `✅ Reikningsstöðu breytt: ${n}` : `✅ Invoice${n === 1 ? '' : 's'} updated: ${n}`;
    setMessages(prev => prev.map((m, idx) =>
      idx === msgIndex ? { ...m, content: m.content.replace(/```jobboks-invoice-status\s*[\s\S]*?```/, `\n${done}`) } : m));
  }

  // The owner tapped "Connect Stripe" in chat → create (or reuse) their Stripe
  // Connect account and send them to Stripe's OWN hosted page to enter their bank
  // and business details. We store only the account id (acct_…, NOT a secret);
  // nothing sensitive ever touches the app or the chat. Mirrors Settings.connectStripe
  // so the two entry points behave identically. A clean 503 here means the platform
  // owner hasn't switched payments on yet — we show that in plain words, not an error.
  async function connectStripeFromChat() {
    setStripeBusy(true); setStripeErr(null);
    try {
      const res = await fetch('/api/stripe-connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          country: data.settings.country || 'US',
          email: data.settings.company.email || undefined,
          accountId: data.settings.stripeConnectAccountId || undefined,
          origin: window.location.origin,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) {
        setStripeErr(d?.error?.message || (lang === 'is' ? 'Ekki tókst að tengja Stripe.' : 'Could not start Stripe connection.'));
        return;
      }
      // Remember the account id before we leave, so the return trip can check status.
      if (d.accountId && d.accountId !== data.settings.stripeConnectAccountId) {
        dispatch({ type: 'UPDATE_SETTINGS', payload: { stripeConnectAccountId: d.accountId } });
      }
      window.location.href = d.url; // hand off to Stripe's secure page
    } catch {
      setStripeErr(lang === 'is' ? 'Villa við að tengja Stripe.' : 'Error connecting to Stripe.');
    } finally {
      setStripeBusy(false);
    }
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

  // Every transaction a description-match fix would hit — searched across the
  // WHOLE dataset (every year), not the year-scoped txPool. This is why a match
  // fix reclassifies all years at once: the app matches by name, so a row the AI
  // never saw is still caught. Exact (trimmed) by default; `contains` allows a
  // substring; `type`/`year`/`date` narrow it further. Matching is BOTH case- AND
  // accent-insensitive (fold diacritics), so "kronan"/"vordur" catch the accented
  // "Krónan"/"Vörður" spellings that card terminals and bank exports mix.
  function matchTxs(mf: MatchFix): Transaction[] {
    const needle = foldAccents(mf.desc.trim());
    if (!needle) return [];
    return data.transactions.filter(tx => {
      const d = foldAccents((tx.description || '').trim());
      if (mf.contains ? !d.includes(needle) : d !== needle) return false;
      if (mf.type && tx.type !== mf.type) return false;
      if (mf.year != null && yearOf(tx.date) !== mf.year) return false;
      if (mf.date && tx.date !== mf.date) return false;
      return true;
    });
  }

  // Why a key on a fix/match set can't be used — MISSING (not in the chart) or
  // DUPLICATE (two keys share the number, so the app can't tell which to book on;
  // exactly the 6100 "Raforka og hiti" vs "Eldsneytis kaup" collision). Returns a
  // plain-language reason, or null when the key is fine. Reported instead of
  // silently booking onto the wrong key.
  function keyProblem(accountNumber?: string): string | null {
    if (!accountNumber) return null;
    const hits = data.accounts.filter(a => a.number === String(accountNumber));
    if (hits.length === 0) return lang === 'is'
      ? `Lykill ${accountNumber} er ekki til í lyklaskránni — búðu hann til fyrst.`
      : `Key ${accountNumber} is not in the chart of accounts — create it first.`;
    if (hits.length > 1) return lang === 'is'
      ? `Fleiri en einn lykill hefur númerið ${accountNumber} (${hits.map(a => a.name).join(', ')}) — appið veit ekki á hvorn á að bóka. Gefðu öðrum þeirra nýtt númer fyrst.`
      : `More than one key has number ${accountNumber} (${hits.map(a => a.name).join(', ')}) — the app can't tell which. Renumber one of them first.`;
    return null;
  }

  // The owner approved an all-years match fix → write the change onto every
  // matching row. A fix naming a key that isn't in the chart is refused whole
  // (the key IS the change), so we never report "fixed" while leaving rows wrong.
  function applyMatch(msgIndex: number, matches: MatchFix[]) {
    const problem = matches.map(mf => keyProblem(mf.set.accountNumber)).find(Boolean);
    if (problem) {
      setMessages(prev => prev.map((m, idx) =>
        idx === msgIndex ? { ...m, content: m.content.replace(/```jobboks-fix\s*[\s\S]*?```/, `\n⚠️ ${problem}`) } : m));
      return;
    }
    // Merge changes per transaction, keyed by id — a row can be caught by several
    // match entries (overlapping terms), but must be updated and COUNTED once, not
    // once per term (that inflated the "N færslur" tally, e.g. 58 reported as 760).
    const changes = new Map<string, Transaction>();
    for (const mf of matches) {
      const s = mf.set;
      const accountId = s.accountNumber ? data.accounts.find(a => a.number === String(s.accountNumber))?.id : undefined;
      for (const tx of matchTxs(mf)) {
        const base = changes.get(tx.id) ?? tx;
        changes.set(tx.id, {
          ...base,
          ...(s.date ? { date: s.date } : {}),
          ...(s.description ? { description: s.description } : {}),
          ...(s.category ? { category: s.category } : {}),
          ...(s.type ? { type: s.type } : {}),
          ...(s.amount != null ? { amount: Number(s.amount) || 0 } : {}),
          ...(s.vatRate != null ? { vatRate: Number(s.vatRate) || 0 } : {}),
          ...(s.interestAmount != null ? { interestAmount: Number(s.interestAmount) || 0 } : {}),
          ...(accountId ? { accountId } : {}),
        });
      }
    }
    for (const tx of changes.values()) dispatch({ type: 'UPDATE_TRANSACTION', payload: tx });
    const applied = changes.size;
    const done = lang === 'is'
      ? `✅ Lagað í Jobboks (öll ár): ${applied} færsla(r)`
      : `✅ Fixed in Jobboks (all years): ${applied} entr${applied === 1 ? 'y' : 'ies'}`;
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
              isNewUser ? (
                /* First-run concierge: a warm hello that starts the AI-led setup. */
                <div className="text-center py-10 px-2">
                  <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-7 h-7 text-blue-600" />
                  </div>
                  <p className="text-gray-900 text-base font-semibold">
                    {lang === 'is' ? 'Velkomin/n í Jobboks' : 'Welcome to Jobboks'}
                  </p>
                  <p className="text-gray-500 text-sm mt-1.5 max-w-xs mx-auto leading-relaxed">
                    {lang === 'is'
                      ? 'Ég kem þér af stað — tekur eina mínútu. Segðu mér hvaða vinnu þú stundar og hvar þú ert.'
                      : "I'll get you going — takes a minute. Tell me what kind of work you do and where you're based."}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2 justify-center">
                    {(lang === 'is' ? [
                      'Ég er þaksmiður í Reykjavík',
                      'Settu upp fyrirtækið mitt',
                      'Búðu til fyrsta reikninginn minn',
                    ] : [
                      'I do roofing in Denver',
                      'Set up my business',
                      'Make my first invoice',
                    ]).map(suggestion => (
                      <button key={suggestion}
                        onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                        className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-full hover:bg-blue-100">
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Bot className="w-12 h-12 text-blue-200 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm font-medium">
                    {lang === 'is' ? 'Hvernig get ég hjálpað þér í dag?' : 'How can I help you today?'}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 justify-center">
                    {(lang === 'is' ? [
                      'Farðu yfir bókhaldið mitt',
                      'Hvernig líður rekstrinum?',
                      'Hverjar eru stærstu útgjaldirnar?',
                      'Eru einhverjar ógreiddar reikningar?',
                    ] : [
                      'Review my books',
                      'How is the business doing?',
                      'What are my biggest expenses?',
                      'Any overdue invoices?',
                    ]).map(suggestion => (
                      <button key={suggestion}
                        onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                        className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-full hover:bg-blue-100">
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )
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
                      const { text: afterSetup, setup } = extractSetup(afterMem);
                      const { text: afterSettings, settings: settingsSet } = extractSettings(afterSetup);
                      const { text: afterJob, jobs: aiJobs } = extractJob(afterSettings);
                      const { text: afterInvoice, invoices: aiInvoices } = extractInvoice(afterJob);
                      const { text: afterQuote, quotes: aiQuotes } = extractQuote(afterInvoice);
                      const { text: afterBook, book } = extractBook(afterQuote);
                      const { text: afterRule, rules: aiRules } = extractRule(afterBook);
                      const { text: afterContact, contacts: aiContacts } = extractContact(afterRule);
                      const { text: afterInvStatus, updates: aiInvStatus } = extractInvoiceStatus(afterContact);
                      const { text: afterStripe, connect: stripeConnect } = extractStripe(afterInvStatus);
                      const { text, fixes, matches, badBlock } = extractFix(afterStripe);
                      return (
                        <>
                          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
                          {badBlock && (
                            <div className="mt-3 flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                              <span className="flex-shrink-0">⚠️</span>
                              <span>{lang === 'is'
                                ? 'AI-ið reyndi að laga færslur en snið leiðréttingarinnar var ógilt — ekkert var breytt. Kóðablokkin sem það bjó til sést hér fyrir ofan; afritaðu hana og sendu mér svo ég sjái hvað fór úrskeiðis.'
                                : 'The AI tried to fix entries but the correction was in an invalid format — nothing changed. The block it produced is shown above; copy it and send it to me so I can see what went wrong.'}</span>
                            </div>
                          )}
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
                          {setup && (() => {
                            const cc = COUNTRY_CONFIGS[String(setup.country || '').toUpperCase()];
                            const chips = [
                              cc ? cc.nameEn : setup.country,
                              setup.state ? `${setup.state}${setup.salesTaxRate != null ? ` ${setup.salesTaxRate}%` : ''}` : null,
                              setup.companyName,
                            ].filter(Boolean) as string[];
                            return (
                              <div className="mt-3 border border-blue-200 rounded-lg overflow-hidden">
                                <div className="bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                                  {lang === 'is' ? 'Uppsetning — samþykktu til að stilla' : 'Setup — approve to configure'}
                                </div>
                                <div className="px-3 py-2 flex flex-wrap gap-1.5">
                                  {chips.map((c, ci) => (
                                    <span key={ci} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                                      <CheckCircle className="w-3 h-3" /> {c}
                                    </span>
                                  ))}
                                </div>
                                <button onClick={() => applySetup(i, setup)}
                                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                                  <CheckCircle className="w-4 h-4" />
                                  {lang === 'is' ? 'Setja upp' : 'Set up'}
                                </button>
                              </div>
                            );
                          })()}
                          {settingsSet && Object.keys(settingsSet).length > 0 && (
                            <div className="mt-3 border border-blue-200 rounded-lg overflow-hidden">
                              <div className="bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                                {lang === 'is' ? 'Stillingabreyting — samþykktu til að stilla' : 'Settings change — approve to apply'}
                              </div>
                              <div className="px-3 py-2 flex flex-wrap gap-1.5">
                                {Object.entries(settingsSet).map(([k, v]) => (
                                  <span key={k} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                                    {k}: {String(v)}
                                  </span>
                                ))}
                              </div>
                              <button onClick={() => applySettings(i, settingsSet)}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                                <CheckCircle className="w-4 h-4" />
                                {lang === 'is' ? 'Vista stillingar' : 'Apply settings'}
                              </button>
                            </div>
                          )}
                          {aiJobs.length > 0 && (
                            <div className="mt-3 border border-blue-200 rounded-lg overflow-hidden">
                              <div className="bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                                {lang === 'is' ? 'Nýtt verk — samþykktu til að skrá' : 'New job — approve to create'}
                              </div>
                              <div className="divide-y divide-gray-100">
                                {aiJobs.map((jp, ji) => (
                                  <div key={ji} className="px-3 py-1.5 text-xs">
                                    <span className="text-gray-700">{jp.name}{jp.client ? ` · ${jp.client}` : ''}</span>
                                    {(jp.address || jp.status) && <span className="text-gray-400">{jp.address ? ` · ${jp.address}` : ''}{jp.status ? ` · ${jp.status}` : ''}</span>}
                                  </div>
                                ))}
                              </div>
                              <button onClick={() => applyJob(i, aiJobs)}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                                <CheckCircle className="w-4 h-4" />
                                {lang === 'is' ? `Skrá ${aiJobs.length} verk` : `Create ${aiJobs.length} job${aiJobs.length === 1 ? '' : 's'}`}
                              </button>
                            </div>
                          )}
                          {aiInvoices.length > 0 && (
                            <div className="mt-3 border border-blue-200 rounded-lg overflow-hidden">
                              <div className="bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                                {lang === 'is' ? 'Reikningsdrög — samþykktu til að búa til' : 'Draft invoice — approve to create'}
                              </div>
                              <div className="divide-y divide-gray-100">
                                {aiInvoices.map((iv, ii) => (
                                  <div key={ii} className="px-3 py-1.5 text-xs flex justify-between gap-3">
                                    <span className="text-gray-700">{iv.customer}{iv.description ? ` · ${iv.description}` : ''}{iv.vatRate ? <span className="text-gray-400"> ({iv.vatRate}%)</span> : null}</span>
                                    <span className="font-mono flex-shrink-0 text-gray-700">{Number(iv.amount).toLocaleString(lang === 'is' ? 'is-IS' : 'en-US')}</span>
                                  </div>
                                ))}
                              </div>
                              <button onClick={() => applyInvoice(i, aiInvoices)}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                                <CheckCircle className="w-4 h-4" />
                                {lang === 'is' ? `Búa til ${aiInvoices.length} reikning(a)` : `Create ${aiInvoices.length} invoice${aiInvoices.length === 1 ? '' : 's'}`}
                              </button>
                            </div>
                          )}
                          {aiQuotes.length > 0 && (
                            <div className="mt-3 border border-orange-200 rounded-lg overflow-hidden">
                              <div className="bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700">
                                {lang === 'is' ? 'Tilboð — samþykktu til að búa til drög' : 'Estimate — approve to create draft'}
                              </div>
                              <div className="divide-y divide-gray-100">
                                {aiQuotes.map((q, qi) => {
                                  const qlines = (Array.isArray(q.lines) && q.lines.length)
                                    ? q.lines
                                    : [{ description: q.description, amount: Number(q.amount) || 0, vatRate: q.vatRate }];
                                  const total = qlines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
                                  const nf = (n: number) => n.toLocaleString(lang === 'is' ? 'is-IS' : 'en-US');
                                  return (
                                    <div key={qi} className="px-3 py-2 text-xs">
                                      <div className="font-medium text-gray-800">{q.customer}{q.address ? <span className="text-gray-400"> · {q.address}</span> : null}</div>
                                      <div className="mt-1 space-y-0.5">
                                        {qlines.map((l, li) => (
                                          <div key={li} className="flex justify-between gap-3 text-gray-600">
                                            <span>{l.description || (lang === 'is' ? 'Verk og þjónusta' : 'Work and services')}{l.vatRate ? <span className="text-gray-400"> ({l.vatRate}%)</span> : null}</span>
                                            <span className="font-mono flex-shrink-0">{nf(Number(l.amount) || 0)}</span>
                                          </div>
                                        ))}
                                      </div>
                                      <div className="mt-1 flex justify-between gap-3 font-semibold text-gray-800 border-t border-gray-100 pt-1">
                                        <span>{lang === 'is' ? 'Samtals' : 'Total'}</span>
                                        <span className="font-mono">{nf(total)}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <button onClick={() => applyQuote(i, aiQuotes)}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-orange-600 text-white text-sm font-medium hover:bg-orange-700">
                                <CheckCircle className="w-4 h-4" />
                                {lang === 'is' ? `Búa til ${aiQuotes.length} tilboð` : `Create ${aiQuotes.length} estimate${aiQuotes.length === 1 ? '' : 's'}`}
                              </button>
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
                          {aiRules.length > 0 && (
                            <div className="mt-3 border border-purple-200 rounded-lg overflow-hidden">
                              <div className="bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700">
                                {lang === 'is' ? 'Tillaga að flokkunarreglu — flokkar sjálfkrafa næst' : 'Proposed rule — auto-categorises from now on'}
                              </div>
                              <div className="divide-y divide-gray-100">
                                {aiRules.map((r, ri) => (
                                  <div key={ri} className="px-3 py-1.5 text-xs text-gray-700">
                                    {lang === 'is' ? 'Allt sem inniheldur' : 'Anything containing'} “<span className="font-medium">{r.pattern}</span>” → <span className="text-gray-500">{r.category} ({r.type}, {lang === 'is' ? 'VSK' : 'tax'} {Number(r.vatRate) || 0}%)</span>
                                  </div>
                                ))}
                              </div>
                              <button onClick={() => approveRule(i, aiRules)}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 text-white text-sm font-medium hover:bg-purple-700">
                                <CheckCircle className="w-4 h-4" />
                                {lang === 'is' ? `Búa til ${aiRules.length} reglu(r)` : `Create ${aiRules.length} rule${aiRules.length === 1 ? '' : 's'}`}
                              </button>
                            </div>
                          )}
                          {aiContacts.length > 0 && (
                            <div className="mt-3 border border-teal-200 rounded-lg overflow-hidden">
                              <div className="bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700">
                                {lang === 'is' ? 'Tillaga að tengilið' : 'Proposed contact'}
                              </div>
                              <div className="divide-y divide-gray-100">
                                {aiContacts.map((c, ci) => (
                                  <div key={ci} className="px-3 py-1.5 text-xs text-gray-700">
                                    <span className="font-medium">{c.name}</span>
                                    <span className="text-gray-400"> · {c.kind === 'supplier' ? (lang === 'is' ? 'birgir' : 'supplier') : (lang === 'is' ? 'viðskiptavinur' : 'customer')}</span>
                                    {(c.email || c.phone) && <span className="text-gray-500"> — {[c.email, c.phone].filter(Boolean).join(' · ')}</span>}
                                  </div>
                                ))}
                              </div>
                              <button onClick={() => approveContact(i, aiContacts)}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-teal-600 text-white text-sm font-medium hover:bg-teal-700">
                                <CheckCircle className="w-4 h-4" />
                                {lang === 'is' ? `Skrá ${aiContacts.length} tengilið(i)` : `Add ${aiContacts.length} contact${aiContacts.length === 1 ? '' : 's'}`}
                              </button>
                            </div>
                          )}
                          {aiInvStatus.length > 0 && (
                            <div className="mt-3 border border-emerald-200 rounded-lg overflow-hidden">
                              <div className="bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                                {lang === 'is' ? 'Uppfæra stöðu reiknings' : 'Update invoice status'}
                              </div>
                              <div className="divide-y divide-gray-100">
                                {aiInvStatus.map((u, ui) => (
                                  <div key={ui} className="px-3 py-1.5 text-xs text-gray-700">
                                    <span className="font-medium">{u.number}</span> → {u.status === 'paid' ? (lang === 'is' ? 'greitt' : 'paid') : (lang === 'is' ? 'sent' : 'sent')}
                                  </div>
                                ))}
                              </div>
                              <button onClick={() => approveInvoiceStatus(i, aiInvStatus)}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
                                <CheckCircle className="w-4 h-4" />
                                {lang === 'is' ? 'Uppfæra' : 'Apply'}
                              </button>
                            </div>
                          )}
                          {stripeConnect && (
                            <div className="mt-3 border border-indigo-200 rounded-lg overflow-hidden">
                              <div className="bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
                                {lang === 'is' ? 'Fá greitt á netinu' : 'Get paid online'}
                              </div>
                              <div className="px-3 py-2 text-xs text-gray-600">
                                {lang === 'is'
                                  ? 'Þú klárar á öruggri síðu Stripe — þú slærð inn banka- og fyrirtækjaupplýsingar þar, aldrei hér.'
                                  : "You'll finish on Stripe's own secure page — you enter your bank and business details there, never here."}
                              </div>
                              {stripeErr && <div className="px-3 pb-2 text-xs text-red-600">{stripeErr}</div>}
                              <button onClick={connectStripeFromChat} disabled={stripeBusy}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">
                                {stripeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                {lang === 'is' ? 'Tengja Stripe' : 'Connect Stripe'}
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
                          {matches.length > 0 && (() => {
                            // All-years match fix: the APP counts every matching row across
                            // all years and shows the owner exactly what will change (name →
                            // key, total, per-year breakdown) before anything is written.
                            const groups = matches.map(mf => {
                              const txs = matchTxs(mf);
                              const perYear = new Map<number, number>();
                              for (const tx of txs) { const y = yearOf(tx.date); perYear.set(y, (perYear.get(y) ?? 0) + 1); }
                              return { mf, txs, perYear: [...perYear.entries()].sort((a, b) => a[0] - b[0]) };
                            });
                            // DISTINCT rows across all groups — a row caught by
                            // several terms counts once, matching what apply does.
                            const total = new Set(groups.flatMap(g => g.txs.map(t => t.id))).size;
                            const keyIssue = matches.map(mf => keyProblem(mf.set.accountNumber)).find(Boolean);
                            return (
                              <div className="mt-3 border border-amber-200 rounded-lg overflow-hidden">
                                <div className="bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
                                  {lang === 'is' ? 'Leiðrétting — ÖLL ÁR í einu' : 'Correction — ALL YEARS at once'}
                                </div>
                                <div className="divide-y divide-gray-100">
                                  {groups.map((g, gi) => {
                                    const s = g.mf.set;
                                    const change = [
                                      s.type ? (lang === 'is' ? `tegund → ${s.type}` : `type → ${s.type}`) : null,
                                      s.accountNumber ? (lang === 'is' ? `lykill → ${s.accountNumber}` : `key → ${s.accountNumber}`) : null,
                                      s.category ? (lang === 'is' ? `flokkur → ${s.category}` : `category → ${s.category}`) : null,
                                    ].filter(Boolean).join(', ');
                                    return (
                                      <div key={gi} className="px-3 py-1.5 text-xs">
                                        <div className="text-gray-900 font-medium">
                                          "{g.mf.desc}"{g.mf.type ? ` (${g.mf.type})` : ''} → {change || '—'}
                                        </div>
                                        <div className="text-gray-500 mt-0.5">
                                          {g.txs.length} {lang === 'is' ? 'færslur' : 'entries'}
                                          {g.perYear.length > 0 && <> · {g.perYear.map(([y, n]) => `${y}:${n}`).join('  ')}</>}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                                {keyIssue ? (
                                  <div className="px-3 py-2 text-xs text-red-600 bg-red-50">⚠️ {keyIssue}</div>
                                ) : (
                                  <button onClick={() => applyMatch(i, matches)} disabled={total === 0}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:bg-gray-300">
                                    <CheckCircle className="w-4 h-4" />
                                    {lang === 'is' ? `Laga ${total} færslu(r) — öll ár` : `Fix ${total} entr${total === 1 ? 'y' : 'ies'} — all years`}
                                  </button>
                                )}
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
          {/* Proactive "needs your attention" — deterministic, no server; each item jumps to the fix */}
          {attention.length > 0 && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-sm font-bold text-amber-900 mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />{lang === 'is' ? 'Þarfnast athygli' : 'Needs your attention'}
              </h3>
              <div className="space-y-2">
                {attention.map(a => {
                  const msg = a.id === 'overdue'
                    ? (lang === 'is' ? `${a.count} reikningur gjaldfallinn${a.amountISK ? ` (${fmtISK(a.amountISK)})` : ''} — rukkaðu þá` : `${a.count} invoice${a.count === 1 ? '' : 's'} overdue${a.amountISK ? ` (${fmtISK(a.amountISK)})` : ''} — chase payment`)
                    : a.id === 'drafts'
                    ? (lang === 'is' ? `${a.count} reikningur enn í drögum — sendu þá` : `${a.count} invoice${a.count === 1 ? '' : 's'} still in draft — send them`)
                    : (lang === 'is' ? 'Stilling lítur út fyrir að vera röng' : 'A setting looks wrong — check it');
                  const label = a.id === 'settings' ? (lang === 'is' ? 'Opna stillingar' : 'Open Settings') : (lang === 'is' ? 'Opna reikninga' : 'Open invoices');
                  return (
                    <div key={a.id} className="flex items-center gap-2 justify-between">
                      <span className="text-xs text-amber-800 flex-1">{msg}</span>
                      {setView && (
                        <button type="button" onClick={() => setView(a.view)}
                          className="flex-shrink-0 px-2.5 py-1 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700">
                          {label}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
