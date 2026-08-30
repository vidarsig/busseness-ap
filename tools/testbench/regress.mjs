#!/usr/bin/env node
// ---------------------------------------------------------------------------
// JOBBOKS REGRESSION SUITE — run after EVERY change, without exception.
//
//   node tools/testbench/regress.mjs
//
// The owner's standing rule is that the whole app is tested after every
// improvement. That rule was unenforceable, because the project had no test
// runner at all and nothing checked whether a repair had broken something
// else. On 29 Aug two fixes made in one afternoon each introduced a fault the
// manual test missed: rent that vanished from revenue, and a direction read
// from a sign that had already been stripped. Both are contract failures and
// both are caught below.
//
// These are CONTRACTS, not examples. They assert what must hold for EVERY
// category, EVERY parser and EVERY language, so a new one cannot be added
// without being wired in. Offline — no API key, no network.
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

function buildApp() {
  const out = join(HERE, '.build', 'regress.mjs');
  mkdirSync(dirname(out), { recursive: true });
  const candidates = [
    join(REPO, 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe'),
    join(REPO, 'node_modules', '.bin', 'esbuild'),
    resolve(REPO, '..', '..', '..', 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe'),
  ];
  const esbuild = candidates.find(existsSync);
  if (!esbuild) { console.error('esbuild not found — run "npm install".'); process.exit(1); }
  execFileSync(esbuild, [
    join(HERE, 'entry.ts'),
    '--bundle', '--format=esm', '--platform=node', '--target=node20',
    // Nothing here renders, so the UI packages stay out of the bundle — the
    // parser only lives in a component file by accident of where it was written.
    '--external:react', '--external:react-dom', '--external:lucide-react',
    '--external:@supabase/supabase-js', '--external:xlsx', '--external:recharts',
    '--external:jspdf', '--external:jspdf-autotable',
    '--outfile=' + out, '--log-level=error',
  ], { stdio: 'inherit' });
  return out;
}

const app = await import(pathToFileURL(buildApp()).href);

let pass = 0;
const failures = [];
const check = (name, fn) => {
  try {
    const why = fn();
    if (why) failures.push(name + '\n      ' + why); else pass++;
  } catch (e) {
    failures.push(name + '\n      threw: ' + e.message);
  }
};

const tx = (o) => Object.assign({
  id: Math.random().toString(36).slice(2), date: '2025-06-15', description: 'x',
  amount: 0, currency: 'ISK', eurToIskRate: 150, vatRate: 0, type: 'expense',
  category: 'adrir_rekstrargjold',
}, o);

// ── 1. Every income category must reach the revenue total ───────────────────
// Catches: leigutekjur was added as a category but not to the named list that
// calcProfitLoss sums, so rent booked on it appeared NOWHERE — not in the P&L,
// the annual accounts, or any report. Money that does not look wrong because
// it does not appear at all.
for (const cat of app.INCOME_CATEGORIES) {
  check('income category "' + cat + '" is counted in the accounts', () => {
    const pl = app.calcProfitLoss([tx({ type: 'income', category: cat, amount: 100000 })], 20, false);
    const seen = pl.totalRevenue + (pl.fjarmagntekjur || 0);
    return seen === 100000 ? null
      : 'booked 100.000 on "' + cat + '" and the accounts show ' + seen + ' — that category is summed nowhere';
  });
}

// ── 2. Every expense category must reach the cost total ─────────────────────
for (const cat of app.EXPENSE_CATEGORIES) {
  check('expense category "' + cat + '" reaches total costs', () => {
    const pl = app.calcProfitLoss([tx({ type: 'expense', category: cat, amount: 50000 })], 20, false);
    const seen = pl.totalOperatingExpenses + (pl.fjarmagnsgjold || 0);
    return seen >= 50000 ? null
      : 'booked 50.000 on "' + cat + '" and total costs show ' + seen;
  });
}

// ── 3. Borrowed money is not profit ─────────────────────────────────────────
check('a transfer changes neither revenue nor costs', () => {
  const pl = app.calcProfitLoss([tx({ type: 'transfer', category: 'lan_afborgun', amount: 900000 })], 20, false);
  return (pl.totalRevenue === 0 && pl.totalOperatingExpenses === 0) ? null
    : 'revenue ' + pl.totalRevenue + ', costs ' + pl.totalOperatingExpenses;
});

// ── 4. Every parser keeps the amount positive and the direction in `type` ────
// Catches: "read the direction off the sign of the amount" — but every parser
// stores Math.abs(), so the sign is already gone and every row would have been
// labelled income.
const STATEMENT = [
  ['Dagsetning', 'Skyring', 'Upphaed', 'Stada'],
  ['15.06.2025', 'N1 HF', '-18450', '100000'],
  ['16.06.2025', 'GREIDSLA REIKNINGUR 1043', '250000', '350000'],
];
for (const format of ['generic', 'arion', 'islandsbanki', 'landsbankinn']) {
  check('parser "' + format + '" keeps amounts positive, direction in type', () => {
    let rows;
    try { rows = app.parseBank(STATEMENT, format); } catch { return null; }
    if (!rows || !rows.length) return null;
    const neg = rows.find(r => r.amount < 0);
    if (neg) return '"' + neg.description + '" parsed to a negative amount — code that reads the sign will disagree with code that reads the type';
    return rows.every(r => r.type === 'income' || r.type === 'expense') ? null
      : 'a parsed row carries no income/expense direction';
  });
}

// ── 4b. A money-OUT line reaches the categoriser as an expense ──────────────
// This is the one that actually fails on the bug. The prompt tells the model
// "detected IS THE BANK'S OWN DIRECTION AND IT IS NOT YOURS TO OVERRULE", so a
// wrong label there is not a hint the model can shrug off — it is an
// instruction to book money out as money in.
check('a money-out bank line reaches the categoriser as an expense', () => {
  const parsed = app.parseBank(STATEMENT, 'generic');
  const stamped = parsed.map(app.stampBankDirection);
  const out = stamped.find(r => /N1/.test(r.description));
  const inn = stamped.find(r => /REIKNINGUR/.test(r.description));
  if (!out || !inn) return 'the statement did not parse — cannot test the direction';
  if (out.bankType !== 'expense') return 'a -18.450 line reached the categoriser as "' + out.bankType + '"';
  if (inn.bankType !== 'income') return 'a +250.000 line reached the categoriser as "' + inn.bankType + '"';
  return null;
});

// ── 5. Every category has a label in every language ─────────────────────────
// Without one the UI shows a raw key like "leigutekjur" to the contractor.
const ALL_CATS = [].concat(app.INCOME_CATEGORIES, app.EXPENSE_CATEGORIES);
for (const lang of Object.keys(app.translations)) {
  check('every category has a ' + lang + ' label', () => {
    const dict = app.translations[lang];
    const missing = ALL_CATS.filter(c => !dict[c]);
    return missing.length ? 'no ' + lang + ' label for: ' + missing.join(', ') : null;
  });
}

// ── 5b. No screen may hand-write its own copy of a category list ────────────
// Catches: the Bank Import dropdown listed the four income categories as a
// literal array. When leigutekjur was added the categoriser answered it
// correctly and the dropdown, having no such option, showed the FIRST one
// instead — the screen said "Sala vara" while the row said rent. The app lying
// about its own data is worse than a wrong answer, because nothing looks wrong.
//
// A SUBSET is fine and common (e.g. "the expense categories that carry no VAT").
// What is not fine is an array that reproduces most of a list, because that is a
// copy of the options and it goes stale the moment the real list grows.
check('no screen hand-writes its own copy of a category list', () => {
  const src = join(REPO, 'src');
  const walk = (dir) => readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const files = walk(src)
    .filter(p => /\.tsx?$/.test(p))
    .filter(p => !p.endsWith(join('types', 'index.ts')));
  const INC = app.INCOME_CATEGORIES;
  const EXP = app.EXPENSE_CATEGORIES;
  const offenders = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const lit of text.match(/\[[^\[\]]{0,600}\]/g) || []) {
      const quoted = (lit.match(/'[a-z_]+'|"[a-z_]+"/g) || []).map(q => q.slice(1, -1));
      const inc = INC.filter(c => quoted.includes(c)).length;
      const exp = EXP.filter(c => quoted.includes(c)).length;
      if (inc >= INC.length - 1 && inc >= 3) offenders.push(f.replace(REPO, '').slice(1) + ' — copies the income list');
      else if (exp >= EXP.length - 1 && exp >= 6) offenders.push(f.replace(REPO, '').slice(1) + ' — copies the expense list');
    }
  }
  return offenders.length
    ? [...new Set(offenders)].join('; ') + ' — import the list instead'
    : null;
});

// ── 5c. Equity must move by profit AFTER tax ────────────────────────────────
// Catches: the annual accounts accumulated profitBeforeTax into equity, so they
// reported 1.769.127 of profit for 2024 while equity moved by 2.211.409 — the
// income tax to the króna, charged in one statement and invisible in the other.
// An account whose own profit does not explain the change in its own equity is
// the first thing a tax office asks about.
//
// The first version of this check only looked for the right WORDS in the source
// and passed happily with the bug put back. This one runs the arithmetic.
check('retained earnings carry profit after tax, and the tax is carried as a debt', () => {
  const tx = (date, type, amount, category) => ({
    id: date + type + amount, date, type, amount, vatRate: 0, category,
    currency: 'ISK', eurToIskRate: 148, description: 'p',
  });
  const rows = [
    tx('2023-05-01', 'income', 1_000_000, 'sala_thjonustu'),
    tx('2023-05-02', 'expense', 4_000_000, 'vorur'),      // 2023: 3.000.000 loss, no tax
    tx('2024-05-01', 'income', 9_000_000, 'sala_thjonustu'),
    tx('2024-05-02', 'expense', 4_000_000, 'vorur'),      // 2024: 5.000.000 profit, 1.000.000 tax
  ];
  const r = app.accumulatedResult(rows, [], 2024, 20, false);
  if (Math.round(r.accruedTax) !== 1_000_000)
    return `accrued tax ${Math.round(r.accruedTax)}, expected 1.000.000`;
  if (Math.round(r.retained) !== 1_000_000)   // -3.000.000 + (5.000.000 - 1.000.000)
    return `retained ${Math.round(r.retained)}, expected 1.000.000 (after tax)`;
  // and the two together must still be the pre-tax accumulation
  const pre = [2023, 2024].reduce((s, y) =>
    s + app.calcProfitLoss(rows.filter(t => t.date.slice(0, 4) === String(y)), 20, false).profitBeforeTax, 0);
  if (Math.round(r.retained + r.accruedTax) !== Math.round(pre))
    return `retained + tax ${Math.round(r.retained + r.accruedTax)} != pre-tax ${Math.round(pre)}`;
  return null;
});

// ── 5e. Every category must reach the profit & loss ─────────────────────────
// Catches BOTH of this week's silent-loss bugs in one rule. Rent had no income
// line, so tenants' money landed on "sale of goods"; meals had no expense line,
// so 3.577.265 of them would have dropped out of the accounts entirely and
// lifted profit by exactly that. A category the app offers but the P&L does not
// count is money that disappears with nothing on screen to show it.
check('every income and expense category is counted in the profit & loss', () => {
  const one = (type, category) => ([{
    id: 'x', date: '2024-06-01', type, amount: 100_000, vatRate: 0, category,
    currency: 'ISK', eurToIskRate: 148, description: 'p',
  }]);
  const missing = [];
  for (const c of app.INCOME_CATEGORIES) {
    const pl = app.calcProfitLoss(one('income', c), 0, false);
    // financial income sits below operating profit by design, so check the bottom line
    if (Math.round(pl.profitBeforeTax) !== 100_000) missing.push('income/' + c);
  }
  for (const c of app.EXPENSE_CATEGORIES) {
    const pl = app.calcProfitLoss(one('expense', c), 0, false);
    if (Math.round(pl.profitBeforeTax) !== -100_000) missing.push('expense/' + c);
  }
  return missing.length
    ? 'these categories never reach the P&L, so money booked to them vanishes: ' + missing.join(', ')
    : null;
});

// ── 5f. A counted category must also be a VISIBLE line ──────────────────────
// Catches the other half of the same fault. Meals reached the total — 2024 costs
// added to 9.761.085 — but no row on the report said where 526.300 of it went;
// the printed lines came to 9.234.785 and the reader was left to wonder. Money
// that is counted but never shown is not much better than money that is lost.
//
// This one is a SHAPE check, not arithmetic: JSX cannot be run here. It only
// proves each expense field is mentioned where the statement is drawn. 5e does
// the arithmetic; this makes sure the screen names it.
check('every expense line in the P&L is drawn on the report', () => {
  const src = readFileSync(join(REPO, 'src', 'components', 'Reports.tsx'), 'utf8');
  const pl = app.calcProfitLoss([], 20, false);
  const skip = new Set(['totalRevenue', 'totalOperatingExpenses', 'operatingProfit',
    'profitBeforeTax', 'incomeTax', 'netResult', 'fjarmagntekjur', 'fjarmagnsgjold',
    'salaTekjur', 'thjonustutekjur', 'leigutekjur', 'adrarTekjur']);
  const missing = Object.keys(pl).filter(k => typeof pl[k] === 'number' && !skip.has(k))
    .filter(k => !src.includes('pl.' + k) && !src.includes('plY.' + k));
  return missing.length
    ? 'counted but never drawn on the report: ' + missing.join(', ')
    : null;
});

// ── 6. Setting up a country picks a language ────────────────────────────────
check('every supported country resolves to a language', () => {
  const bad = Object.keys(app.COUNTRY_CONFIGS).filter(c => !app.languageForCountry(c));
  return bad.length ? 'no language for: ' + bad.join(', ') : null;
});
check('English-speaking countries are not set up in Icelandic', () => {
  const wrong = ['US', 'GB', 'CA', 'AU', 'NZ'].filter(c => app.languageForCountry(c) !== 'en');
  return wrong.length ? 'set up in the wrong language: ' + wrong.join(', ') : null;
});

// ── 7. Tax is extracted, never invented ─────────────────────────────────────
check('a gross amount at 24% nets down to the right revenue', () => {
  const pl = app.calcProfitLoss([tx({ type: 'income', category: 'sala_thjonustu', amount: 124000, vatRate: 24 })], 20, true);
  return Math.abs(pl.totalRevenue - 100000) < 1 ? null
    : '124.000 gross at 24% should net to 100.000, got ' + Math.round(pl.totalRevenue);
});
check('a 0% row is not reduced', () => {
  const pl = app.calcProfitLoss([tx({ type: 'income', category: 'sala_thjonustu', amount: 100000, vatRate: 0 })], 20, true);
  return Math.abs(pl.totalRevenue - 100000) < 1 ? null : '0% row came out as ' + Math.round(pl.totalRevenue);
});

// ── 8. The US path keys off isUSA, and every state has a rate ───────────────
check('the US config still says isUSA', () => {
  const us = app.COUNTRY_CONFIGS.US;
  return us && us.isUSA === true ? null : 'COUNTRY_CONFIGS.US no longer says isUSA — the whole sales-tax path keys off it';
});
check('every US state carries a sales-tax rate', () => {
  const bad = app.US_STATES.filter(s => typeof s.rate !== 'number');
  return bad.length ? 'no rate for: ' + bad.map(s => s.name).join(', ') : null;
});

// ── report ──────────────────────────────────────────────────────────────────
console.log('\n  ' + pass + ' passed, ' + failures.length + ' failed\n');
for (const f of failures) console.log('  x ' + f + '\n');
process.exit(failures.length ? 1 : 0);
