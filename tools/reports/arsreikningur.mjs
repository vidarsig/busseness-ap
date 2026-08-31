#!/usr/bin/env node
// ---------------------------------------------------------------------------
// ÁRSREIKNINGUR — build one PDF per year straight from a Jobboks backup file,
// using the app's OWN engines (tools/reports/entry.ts re-exports them), so the
// paper says exactly what the Ársreikningur screen says.
//
//   node tools/reports/arsreikningur.mjs <backup.json> <outDir> <year> [year...]
//
// Mirrors statementExport() in src/components/AnnualAccounts.tsx line for line.
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

function buildApp() {
  const out = join(HERE, '.build', 'reports.mjs');
  mkdirSync(dirname(out), { recursive: true });
  const candidates = [
    join(REPO, 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe'),
    join(REPO, 'node_modules', '.bin', 'esbuild'),
    // Running from a git worktree: the deps live in the main checkout.
    resolve(REPO, '..', '..', '..', 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe'),
  ];
  const esbuild = candidates.find(existsSync);
  if (!esbuild) { console.error('esbuild not found — run "npm install".'); process.exit(1); }
  execFileSync(esbuild, [
    join(HERE, 'entry.ts'),
    '--bundle', '--format=esm', '--platform=node', '--target=node20',
    '--external:react', '--external:react-dom', '--external:lucide-react',
    '--external:@supabase/supabase-js', '--external:recharts',
    // jsPDF's Node build is CommonJS; the shims fix the default-export interop.
    '--alias:jspdf=' + join(HERE, 'shim-jspdf.mjs'),
    '--alias:jspdf-autotable=' + join(HERE, 'shim-autotable.mjs'),
    '--outfile=' + out, '--log-level=error',
  ], { stdio: 'inherit' });
  return out;
}

const app = await import(pathToFileURL(buildApp()).href);
const {
  filterByYear, calcProfitLoss, withAssetDepreciation, accountBalanceByYear,
  getTransactionISK, yearOf, assetBookValue, assetVisible, accumulatedResult,
  pdfBase64, translations, formatISK, setUiLanguage, IS_PRICE_INDEX,
  canonicalCategory, DEFAULT_SETTINGS,
} = app;

const [backupPath, outDir, ...yearArgs] = process.argv.slice(2);
if (!backupPath || !outDir || !yearArgs.length) {
  console.error('usage: node tools/reports/arsreikningur.mjs <backup.json> <outDir> <year>...');
  process.exit(1);
}
const years = yearArgs.map(Number);

// ── Load the backup the way the app loads it (migrateData -> healCategories) ──
const parsed = JSON.parse(readFileSync(backupPath, 'utf8'));
const raw = parsed.data ?? parsed;
const data = {
  ...raw,
  transactions: raw.transactions.map(tx => {
    const c = canonicalCategory(tx.category);
    return c === tx.category ? tx : { ...tx, category: c };
  }),
  settings: { ...DEFAULT_SETTINGS, ...raw.settings },
};
// Every owner seed in this file is already applied (seededMigrations), so
// applyOwnerSeeds is a no-op here; assert that rather than assume it.
for (const id of ['efra-skrid-properties-v2', 'efra-cash-arion-v1', 'efra-mortgages-v1',
  'efra-work-vat-v1', 'efra-input-vat-revert-v1', 'efra-interest-clean-v1']) {
  if (!(raw.seededMigrations ?? []).includes(id)) {
    console.error('backup has not run seed ' + id + ' — open it in the app once first.');
    process.exit(1);
  }
}

const lang = data.settings.language || 'is';
setUiLanguage(lang);
const t = key => translations[lang]?.[key] ?? translations.is[key] ?? key;
const fmtISK = n => formatISK(n, lang);
const baseCur = data.settings.defaultCurrency || 'ISK';
const company = data.settings.company;
const isIS = (data.settings.country || 'IS') === 'IS';
const priceIndex = isIS
  ? { ...IS_PRICE_INDEX, ...(data.settings.priceIndex ?? {}) }
  : (data.settings.priceIndex ?? {});

const getSection = section => data.balanceSheetItems.filter(b => b.section === section);
const isCashLine = b => b.computed === 'cash' || b.id === 'bs1'
  || (b.section === 'current_assets' && /handbært/i.test(b.name));
const cashLineItem = getSection('current_assets').find(isCashLine);
const staticEquity = getSection('equity').reduce((s, b) => s + b.amount, 0);
const staticLongTerm = getSection('long_term_liabilities').reduce((s, b) => s + b.amount, 0);
const staticCurrentLiab = getSection('current_liabilities').reduce((s, b) => s + b.amount, 0);

const rentKeyIds = new Set((data.accounts ?? [])
  .filter(a => a.type === 'revenue' && /leig|rent/i.test(`${a.name} ${a.nameEn || ''}`))
  .map(a => a.id));
const leigutekjurFor = y => data.transactions
  .filter(x => yearOf(x.date) === y && x.type === 'income' && x.accountId && rentKeyIds.has(x.accountId))
  .reduce((s, x) => s + getTransactionISK(x), 0);

const isAssetKey = id => !!id && data.accounts.find(a => a.id === id)?.type === 'asset';

function computeYear(y) {
  const plY = withAssetDepreciation(
    calcProfitLoss(filterByYear(data.transactions, y), data.settings.corporateTaxRate, data.settings.pricesIncludeVAT),
    data.balanceSheetItems, y);
  const otherOpY = plY.husaleiga + plY.rafmagnHiti + plY.simagjold + plY.skrifstofugjold
    + plY.samgongur + plY.markadsmal + plY.fagthjonusta + plY.vorur + plY.faedi + plY.adrir;
  const closingFor = acc => {
    const rows = accountBalanceByYear(acc, data.transactions, priceIndex).filter(r => r.year <= y);
    if (rows.length) return rows[rows.length - 1].closing;
    return acc.openingYear != null && y >= acc.openingYear ? (acc.openingBalance ?? 0) : 0;
  };
  const rowsFor = type => data.accounts
    .filter(a => a.isActive && a.type === type && (a.openingBalance != null || data.transactions.some(tx => tx.accountId === a.id)))
    .map(a => ({ acc: a, closing: closingFor(a) }));
  const bk = { asset: rowsFor('asset'), liability: rowsFor('liability'), equity: rowsFor('equity') };
  const cash = data.transactions
    .filter(tx => yearOf(tx.date) <= y && !isAssetKey(tx.accountId) && tx.category !== 'afskriftir')
    .reduce((s, tx) => s + ((tx.type === 'income' || tx.category === 'lan_mottekid' || tx.category === 'framlag') ? getTransactionISK(tx) : -getTransactionISK(tx)), 0);
  const { retained, accruedTax: accrued } = accumulatedResult(
    data.transactions, data.balanceSheetItems, y, data.settings.corporateTaxRate, data.settings.pricesIncludeVAT);
  return { plY, otherOpY, bk, cash, retained, accrued };
}

function statementExport(y) {
  const nm = i => lang === 'is' ? i.name : (i.nameEn || i.name);
  const R = (label, amount) => ({ label, amount: fmtISK(amount) });
  const SEC = label => ({ label: label.toUpperCase(), amount: '' });
  const { plY, otherOpY, bk, cash, retained, accrued } = computeYear(y);
  const fixedRowsY = getSection('fixed_assets').filter(i => assetVisible(i, y)).map(i => ({ i, v: assetBookValue(i, y) }));
  const totalFixedY = fixedRowsY.reduce((s, r) => s + r.v, 0);
  const cashRawY = cashLineItem ? (cashLineItem.cashByYear?.[String(y)] ?? cash) : cash;
  const cashAssetY = Math.max(0, cashRawY);
  const overdraftY = Math.max(0, -cashRawY);
  const currentAssetValY = i => isCashLine(i) ? cashAssetY : i.amount;
  const totalCurrentAssetsY = getSection('current_assets').reduce((s, i) => s + currentAssetValY(i), 0);
  const assetKeysY = bk.asset.reduce((s, r) => s + r.closing, 0);
  const liabKeysY = bk.liability.reduce((s, r) => s + r.closing, 0);
  const equityKeysY = bk.equity.reduce((s, r) => s + r.closing, 0);
  const totalAssetsY = totalFixedY + totalCurrentAssetsY + assetKeysY;
  const mortgageLiabY = bk.liability.reduce((s, r) => s + (r.acc.isPropertyMortgage ? r.closing : 0), 0);
  const propertyEquityY = totalFixedY > 0 ? totalFixedY - mortgageLiabY : 0;
  const totalLiabY = liabKeysY + staticLongTerm + staticCurrentLiab + overdraftY + accrued;
  const totalEquityY = staticEquity + equityKeysY + retained + propertyEquityY;
  const totalEquityAndLiabY = totalLiabY + totalEquityY;
  const bsDiffY = totalAssetsY - totalEquityAndLiabY;
  const keyLbl = acc => `${acc.number} ${lang === 'is' ? acc.name : (acc.nameEn || acc.name)}`;
  const rows = [];
  rows.push(SEC(t('incomeStatement')));
  rows.push(SEC(t('revenues')));
  if (plY.salaTekjur > 0) rows.push(R(t('sala_vara'), plY.salaTekjur));
  const rentY = leigutekjurFor(y) + plY.leigutekjur;
  if (rentY > 0) rows.push(R(lang === 'is' ? 'Húsaleigutekjur (án VSK)' : 'Rental income (VAT exempt)', rentY));
  if (plY.thjonustutekjur - leigutekjurFor(y) > 0) rows.push(R(t('sala_thjonustu'), plY.thjonustutekjur - leigutekjurFor(y)));
  if (plY.adrarTekjur > 0) rows.push(R(t('adrar_tekjur'), plY.adrarTekjur));
  rows.push(R(t('revenues'), plY.totalRevenue));
  if (plY.laun + plY.launatengd > 0) rows.push(R(t('wagesExpenses'), -(plY.laun + plY.launatengd)));
  if (plY.afskriftir > 0) rows.push(R(t('afskriftir'), -plY.afskriftir));
  if (otherOpY > 0) rows.push(R(t('otherOperating'), -otherOpY));
  rows.push(R(t('operatingExpenses'), -plY.totalOperatingExpenses));
  rows.push(R(t('operatingProfit'), plY.operatingProfit));
  if (plY.fjarmagntekjur > 0) rows.push(R(t('fjarmagns_tekjur'), plY.fjarmagntekjur));
  if (plY.fjarmagnsgjold > 0) rows.push(R(t('fjarmagnsgjold'), -plY.fjarmagnsgjold));
  rows.push(R(t('profitBeforeTax'), plY.profitBeforeTax));
  if (plY.incomeTax > 0) rows.push(R(t('incomeTax'), -plY.incomeTax));
  rows.push(R(t('netResult'), plY.netResult));
  rows.push(SEC(t('assets')));
  fixedRowsY.forEach(({ i, v }) => rows.push(R(nm(i), v)));
  rows.push(R(t('fixedAssets'), totalFixedY));
  getSection('current_assets').forEach(i => rows.push(R(nm(i), currentAssetValY(i))));
  rows.push(R(t('currentAssets'), totalCurrentAssetsY));
  bk.asset.forEach(({ acc, closing }) => rows.push(R(keyLbl(acc), closing)));
  rows.push(R(t('totalAssets'), totalAssetsY));
  rows.push(SEC(t('equityAndLiabilities')));
  getSection('equity').forEach(i => rows.push(R(nm(i), i.amount)));
  bk.equity.forEach(({ acc, closing }) => rows.push(R(keyLbl(acc), closing)));
  rows.push(R(lang === 'is' ? 'Uppsafnaður hagnaður' : 'Accumulated profit', retained));
  if (totalFixedY > 0) rows.push(R(lang === 'is' ? 'Eigið fé í fasteignum (bókf. verð − áhvílandi lán)' : 'Equity in properties (book value − mortgages)', propertyEquityY));
  rows.push(R(t('totalEquity'), totalEquityY));
  getSection('long_term_liabilities').forEach(i => rows.push(R(nm(i), i.amount)));
  bk.liability.forEach(({ acc, closing }) => rows.push(R(keyLbl(acc), closing)));
  if (accrued > 0) rows.push(R(lang === 'is' ? 'Tekjuskattur, áfallinn og ógreiddur' : 'Income tax, accrued and unpaid', accrued));
  rows.push(R(t('longTermLiabilities'), staticLongTerm + liabKeysY));
  getSection('current_liabilities').forEach(i => rows.push(R(nm(i), i.amount)));
  rows.push(R(t('currentLiabilities'), staticCurrentLiab));
  rows.push(R(t('equityAndLiabilities'), totalEquityAndLiabY));
  if (Math.abs(bsDiffY) > 1) rows.push(R(lang === 'is' ? 'Mismunur (vantar lán/opnunarstöður)' : 'Difference (loans/opening balances incomplete)', bsDiffY));
  const columns = [
    { header: t('description'), key: 'label', width: 120 },
    { header: `${y} (${baseCur})`, key: 'amount', width: 45 },
  ];
  const summary = {
    revenue: plY.totalRevenue, opProfit: plY.operatingProfit, preTax: plY.profitBeforeTax,
    tax: plY.incomeTax, net: plY.netResult, assets: totalAssetsY,
    liabilities: totalLiabY, equity: totalEquityY, diff: bsDiffY,
  };
  return { columns, rows, summary };
}

mkdirSync(outDir, { recursive: true });
const pdfTitle = company.name || t('annualAccounts');
for (const y of years) {
  const { columns, rows, summary } = statementExport(y);
  const subtitle = `${t('annualAccounts')} — ${y}${company.kennitala ? ` · ${company.kennitala}` : ''}`;
  const b64 = pdfBase64(pdfTitle, subtitle, columns, rows);
  const file = join(outDir, `arsreikningur_${y}.pdf`);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log(`\n=== ${y} ===`);
  for (const [k, v] of Object.entries(summary)) console.log('  ' + k.padEnd(12) + ' ' + fmtISK(v));
  console.log('  -> ' + file + ' (' + rows.length + ' lines)');
}
