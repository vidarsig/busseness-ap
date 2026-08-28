#!/usr/bin/env node
// ---------------------------------------------------------------------------
// JOBBOKS TEST BENCH — a brand-new customer, an empty set of books, one bank
// file, and a real conversation with the app's own AI.
//
// It runs the SAME code the shipped app runs: the same bank parser, the same
// categoriser, the same chat system prompt. Nothing here is a re-implementation,
// so what you see is what a new subscriber would see on their first day.
//
//   node tools/testbench/bench.mjs --bank <file.xlsx> [options]
//
//   --bank <path>     bank statement to import (xlsx or csv)
//   --rows <n>        keep only the first n rows          (default 60)
//   --year <yyyy>     keep only rows from this year
//   --company <name>  company name for the fresh account  (default "Nýtt fyrirtæki")
//   --country <cc>    IS | US | CA                        (default IS)
//   --lang <is|en>    language the AI answers in          (default is)
//   --no-categorise   skip the import categorisation step
//   --say "..."       ask one question and exit
//   --script <path>   a text file, one question per line
//   --host <url>      API host (default https://jobboks.app)
//   --token <jwt>     Supabase access token (or set JOBBOKS_TOKEN) — the AI
//                     endpoints are signed-in only
//
//   Easier: set ANTHROPIC_API_KEY in the environment and the bench calls
//   Anthropic directly, no session needed. See DIRECT MODE below.
//
// With no --say and no --script it drops into a prompt where you just type.
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

// ---- arguments -------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes('--' + name);

const opt = {
  bank: flag('bank'),
  rows: Number(flag('rows', '60')),
  year: flag('year'),
  company: flag('company', 'Nýtt fyrirtæki'),
  country: flag('country', 'IS'),
  lang: flag('lang', 'is'),
  categorise: !has('no-categorise'),
  say: flag('say'),
  script: flag('script'),
  host: flag('host', 'https://jobboks.app'),
  token: flag('token', process.env.JOBBOKS_TOKEN || ''),
  apiKey: process.env.ANTHROPIC_API_KEY || '',
};

// ---- the app's own modules, bundled on demand ------------------------------
// The app is TypeScript with browser-shaped imports, so esbuild bundles the
// entry point into something Node can import. Rebuilt every run — the bench
// must never test a stale copy of the prompt.
function buildApp() {
  const out = join(HERE, '.build', 'app.mjs');
  mkdirSync(dirname(out), { recursive: true });
  const candidates = [
    join(REPO, 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe'),
    join(REPO, 'node_modules', '.bin', 'esbuild'),
    resolve(REPO, '..', '..', '..', 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe'),
  ];
  const esbuild = candidates.find(existsSync);
  if (!esbuild) {
    console.error('esbuild not found. Run "npm install" in the repo first.');
    process.exit(1);
  }
  execFileSync(esbuild, [
    join(HERE, 'entry.ts'),
    '--bundle', '--format=esm', '--platform=node', '--target=node20',
    // React and the icon set are only present because the parser happens to
    // live in a component file; nothing here renders, so keep them out.
    '--external:react', '--external:react-dom', '--external:lucide-react',
    '--external:@supabase/supabase-js', '--external:xlsx', '--external:recharts',
    '--external:jspdf', '--external:jspdf-autotable',
    '--outfile=' + out, '--log-level=error',
  ], { stdio: 'inherit' });
  return out;
}

// The app calls "/api/claude" because in the browser that is same-origin. In Node
// there is no origin, so point relative /api calls at a real host — and attach a
// session, because those endpoints are signed-in only now (netlify/functions/_guard.js).
// A session comes from JOBBOKS_TOKEN (in the running app: devtools -> Application
// -> Local Storage -> the sb-*-auth-token entry -> access_token).
//
// DIRECT MODE — set ANTHROPIC_API_KEY in the environment and the bench talks to
// Anthropic itself instead of going through jobboks.app.
//
// Why: the /api endpoints are signed-in only since e11fa72 (they used to be an
// open proxy anyone could spend the budget on), so the bench needs a Supabase
// session to reach them — and the whole point of the bench is that it runs
// unattended. netlify/functions/claude.js is a pass-through: it checks the
// session, then forwards the SAME body to https://api.anthropic.com/v1/messages
// with the server's key. So sending that body straight there tests exactly what
// production sends — the real buildChatSystem and categorizeBatch prompts —
// without a session and without weakening the guard by one line.
//
// The key is only ever read from the environment. Never pass it on the command
// line and never paste it into a file: `setx ANTHROPIC_API_KEY ...` on Windows,
// `export ANTHROPIC_API_KEY=...` elsewhere.
const DIRECT_URL = 'https://api.anthropic.com/v1/messages';

function patchFetch(host, token, apiKey) {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (url, init) => {
    if (typeof url === 'string' && url.startsWith('/api/')) {
      calls++;
      if (apiKey && !token) {
        // Streaming goes to the edge function in the app; the bench only uses the
        // plain endpoint, and both carry an Anthropic Messages body.
        const headers = { ...(init && init.headers) };
        delete headers.authorization;
        delete headers.Authorization;
        return real(DIRECT_URL, {
          ...init,
          headers: { ...headers, 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        });
      }
      url = host + url;
      if (token) init = { ...init, headers: { ...(init && init.headers), authorization: `Bearer ${token}` } };
    }
    return real(url, init);
  };
  return () => calls;
}

// ---- a brand-new, empty set of books ---------------------------------------
function freshBooks(app, { company, country }) {
  const settings = structuredClone(app.DEFAULT_SETTINGS);
  settings.company = { ...structuredClone(app.DEFAULT_COMPANY), name: company };
  settings.country = country;
  return {
    transactions: [], categoryRules: [], balanceSheetItems: [],
    accounts: structuredClone(app.DEFAULT_ACCOUNTS),
    invoices: [], recurringTransactions: [], budgetLines: [], payrollEntries: [],
    employees: [], tasks: [], stockItems: [], stockMovements: [], suppliers: [],
    customers: [], jobs: [], timeEntries: [], jobMaterials: [], jobPhotos: [],
    appUsers: [], settings,
    // A NEW customer has no chat history and no learned facts. That is the
    // whole point of the bench: the AI starts knowing nothing about them.
    aiChat: [], aiMemory: '',
  };
}

// ---- read the bank file the way the app reads it ---------------------------
async function readBank(app, path) {
  const XLSX = await import(pathToFileURL(join(REPO, 'node_modules', 'xlsx', 'xlsx.mjs')).href)
    .catch(() => import('xlsx'));
  const wb = XLSX.read(readFileSync(path), { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  const map = app.findHeaderMap(grid);
  const parsed = app.parseBank(grid, 'auto');
  return { grid, map, parsed };
}

const kr = (n) => Math.round(n).toLocaleString('is-IS');
const rule = (s = '') => console.log('\n' + '─'.repeat(76) + (s ? '\n' + s : ''));

// ---- main ------------------------------------------------------------------
const app = await import(pathToFileURL(buildApp()).href);
const apiCalls = patchFetch(opt.host, opt.token, opt.apiKey);

console.log('\n╔' + '═'.repeat(74) + '╗');
console.log('║  JOBBOKS TEST BENCH — nýr viðskiptavinur, tómt bókhald' + ' '.repeat(19) + '║');
console.log('╚' + '═'.repeat(74) + '╝');
console.log(`  fyrirtæki : ${opt.company}   land: ${opt.country}   tungumál: ${opt.lang}`);
console.log('  API       : ' + (opt.apiKey && !opt.token
  ? 'api.anthropic.com  (beint — ANTHROPIC_API_KEY úr umhverfinu)'
  : `${opt.host}/api/claude` + (opt.token
      ? '  (með aðgangslykli)'
      : '  ⚠ hvorki ANTHROPIC_API_KEY né aðgangslykill — AI-köll verða 401')));

const data = freshBooks(app, opt);

if (opt.bank) {
  const path = resolve(opt.bank);
  rule('1 · BANKASKRÁIN — les appið hana rétt?');
  const { grid, map, parsed } = await readBank(app, path);
  console.log(`  skrá         : ${path}`);
  console.log(`  raðir í skrá : ${grid.length}`);
  console.log(`  hausgreining : ${map ? 'FANNST' : 'FANNST EKKI — appið dettur í fastar staðsetningar'}`);
  if (map) {
    console.log(`                 dagsetning=${map.date}  lýsing=${map.description}  ` +
      `upphæð=${map.amount ?? '—'}  debet=${map.debit ?? '—'}  kredit=${map.credit ?? '—'}  tilvísun=${map.reference ?? '—'}`);
  }

  let rows = parsed;
  if (opt.year) rows = rows.filter(r => r.date.startsWith(opt.year));
  rows = rows.slice(0, opt.rows);
  const income = rows.filter(r => r.type === 'income');
  const expense = rows.filter(r => r.type === 'expense');
  console.log(`  lesnar      : ${parsed.length} færslur, notaðar ${rows.length}`);
  console.log(`  inn         : ${income.length} raðir, ${kr(income.reduce((s, r) => s + r.amount, 0))}`);
  console.log(`  út          : ${expense.length} raðir, ${kr(expense.reduce((s, r) => s + r.amount, 0))}`);
  if (income.length === 0 || expense.length === 0) {
    console.log('  ⚠  ALLT Í EINA ÁTT — það er merki um að röng dálkur hafi verið lesinn sem upphæð.');
  }

  if (opt.categorise) {
    rule('2 · FLOKKUNIN — hvað gerir AI-ið við færslur sem það hefur aldrei séð?');
    const cats = [...app.INCOME_CATEGORIES, ...app.EXPENSE_CATEGORIES];
    const vats = data.settings.vatRates;
    const results = [];
    for (let i = 0; i < rows.length; i += 40) {
      const slice = rows.slice(i, i + 40);
      const out = await app.categorizeBatch(
        slice.map(r => ({ description: r.description, amount: r.amount, detectedType: r.type })),
        cats, vats,
      );
      results.push(...out);
      process.stdout.write(`  flokkað ${Math.min(i + 40, rows.length)}/${rows.length}\r`);
    }
    console.log(' '.repeat(40) + '\r  flokkað ' + results.length + '/' + rows.length);

    const byCat = new Map(); let lowConf = 0;
    rows.forEach((r, i) => {
      const s = results[i]; if (!s) return;
      if (s.confidence === 'low') lowConf++;
      const k = `${s.type} · ${s.category}`;
      const e = byCat.get(k) ?? { n: 0, sum: 0 };
      e.n++; e.sum += r.amount; byCat.set(k, e);
      data.transactions.push({
        id: `tx_bench_${i}`, date: r.date, type: s.type,
        amount: r.amount, vatRate: s.vatRate, category: s.category,
        currency: 'ISK', description: r.description, reference: r.reference ?? '',
        eurToIskRate: 148,
      });
    });
    console.log('');
    for (const [k, v] of [...byCat].sort((a, b) => b[1].sum - a[1].sum)) {
      console.log(`    ${k.padEnd(38)}${String(v.n).padStart(4)} raðir ${kr(v.sum).padStart(14)}`);
    }
    console.log(`\n  ⚑ merkt til yfirferðar (low confidence): ${lowConf} af ${rows.length}` +
      `  — ${Math.round(lowConf / rows.length * 100)}%`);
    console.log('    Þetta eru færslurnar sem viðskiptavinurinn er beðinn um að staðfesta.');
  } else {
    rows.forEach((r, i) => data.transactions.push({
      id: `tx_bench_${i}`, date: r.date, type: r.type, amount: r.amount,
      vatRate: 0, category: r.type === 'income' ? 'sala_thjonustu' : 'adrir_rekstrargjold',
      currency: 'ISK', description: r.description, reference: r.reference ?? '', eurToIskRate: 148,
    }));
  }
}

// ---- the conversation ------------------------------------------------------
rule('3 · SAMTALIÐ — talað við AI-ið eins og viðskiptavinurinn myndi gera');
const year = data.transactions.length
  ? Number(data.transactions[data.transactions.length - 1].date.slice(0, 4))
  : new Date().getFullYear();
const system = app.buildChatSystem(data, opt.lang, year);
console.log(`  bókhald    : ${data.transactions.length} færslur, ár ${year}`);
console.log(`  leiðbeiningar til AI: ${system.length.toLocaleString('is-IS')} stafir`);

const history = [];
async function ask(text) {
  console.log('\n\x1b[36m▸ ' + text + '\x1b[0m\n');
  history.push({ role: 'user', content: text });
  let answer = '';
  await app.streamClaude(system, history, (chunk) => { answer += chunk; process.stdout.write(chunk); });
  history.push({ role: 'assistant', content: answer });
  console.log('');
  return answer;
}

const questions = opt.say ? [opt.say]
  : opt.script ? readFileSync(resolve(opt.script), 'utf8').split('\n').map(s => s.trim()).filter(Boolean)
  : null;

if (questions) {
  for (const q of questions) await ask(q);
} else {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log('\n  Skrifaðu spurningu og ýttu á Enter. Tómt svar hættir.\n');
  for (;;) {
    const q = (await rl.question('\x1b[36m› \x1b[0m')).trim();
    if (!q) break;
    await ask(q);
  }
  rl.close();
}

rule(`  API-köll í þessari keyrslu: ${apiCalls()}`);
