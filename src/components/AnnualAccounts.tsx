import { useState, useMemo } from 'react';
import { Printer, Plus, Pencil, Trash2, X, Download, Send } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { filterByYear, calcProfitLoss, accountBalanceByYear, getTransactionISK, yearOf } from '../utils/calculations';
import { exportPDF, sharePDF, ExportColumn, ExportRow } from '../utils/exports';
import { BalanceSheetItem, Account } from '../types';
import { assetBookValue, assetVisible } from '../utils/calculations';

function newId() {
  return `bs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Year-end BOOK VALUE of a balance-sheet item for a given year. A plain item just
// returns its static amount; a depreciating fixed asset (cost + acquiredYear set)
interface BSModalProps {
  initial?: BalanceSheetItem;
  onSave: (item: BalanceSheetItem) => void;
  onClose: () => void;
}

function BSModal({ initial, onSave, onClose }: BSModalProps) {
  const { t, lang } = useApp();
  const numOrUndef = (v: string) => v === '' ? undefined : (parseFloat(v) || 0);
  const [form, setForm] = useState<BalanceSheetItem>(initial ?? {
    id: newId(),
    name: '',
    nameEn: '',
    section: 'current_assets',
    amount: 0,
  });

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

  const sections = [
    { value: 'fixed_assets', label: t('fixedAssets') },
    { value: 'current_assets', label: t('currentAssets') },
    { value: 'equity', label: t('equity') },
    { value: 'long_term_liabilities', label: t('longTermLiabilities') },
    { value: 'current_liabilities', label: t('currentLiabilities') },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold">{initial ? t('edit') : t('addBalanceSheetItem')}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className={labelCls}>{t('name')} (IS)</label>
            <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label className={labelCls}>{t('name')} (EN)</label>
            <input className={inputCls} value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>{t('section')}</label>
            <select className={inputCls} value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value as BalanceSheetItem['section'] }))}>
              {sections.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t('openingBalance')} (ISK)</label>
            <input type="number" className={inputCls} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} />
          </div>

          {form.section === 'fixed_assets' && (
            <div className="border-t border-gray-100 pt-3 space-y-3">
              <p className="text-xs text-gray-500">
                {lang === 'is'
                  ? 'Fasteign sem afskrifast? Fylltu út kaupverð og kaupár — þá reiknar appið bókfært verð (kaupverð − afskrift húss) fyrir hvert ár, og eignin birtist bara frá kaupári. Lóð afskrifast ekki. (Láttu autt fyrir venjulegan lið — þá gildir upphæðin að ofan.)'
                  : 'A property that depreciates? Fill in the cost and the year acquired — the app then shows the book value (cost − building depreciation) per year, and it only appears from the acquired year. Land does not depreciate. (Leave blank for a plain item — the amount above is used.)'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{lang === 'is' ? 'Kaupverð' : 'Cost'}</label>
                  <input type="number" className={inputCls} value={form.cost ?? ''} onChange={e => setForm(f => ({ ...f, cost: numOrUndef(e.target.value) }))} />
                </div>
                <div>
                  <label className={labelCls}>{lang === 'is' ? 'Kaupár' : 'Year acquired'}</label>
                  <input type="number" className={inputCls} value={form.acquiredYear ?? ''} onChange={e => setForm(f => ({ ...f, acquiredYear: e.target.value === '' ? undefined : (parseInt(e.target.value) || undefined) }))} />
                </div>
                <div>
                  <label className={labelCls}>{lang === 'is' ? 'Lóðarverð (afskrifast ekki)' : 'Land value (no depreciation)'}</label>
                  <input type="number" className={inputCls} value={form.landValue ?? ''} onChange={e => setForm(f => ({ ...f, landValue: numOrUndef(e.target.value) }))} />
                </div>
                <div>
                  <label className={labelCls}>{lang === 'is' ? 'Afskrift húss %/ári' : 'Building depreciation %/yr'}</label>
                  <input type="number" step="0.1" className={inputCls} value={form.depreciationRate ?? ''} onChange={e => setForm(f => ({ ...f, depreciationRate: numOrUndef(e.target.value) }))} />
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">{t('cancel')}</button>
            <button onClick={() => onSave(form)} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700">{t('save')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AnnualAccounts() {
  const { data, dispatch, t, lang, fmtISK, cc } = useApp();
  // Column figures are rendered via fmtISK (company currency), so the "(ISK)" in
  // the headers must follow suit — show the company's own currency code. The
  // Icelandic Annual-Accounts-Act subtitle/notes only apply to an IS company.
  const baseCur = (data.settings.defaultCurrency || 'ISK');
  const isIceland = cc.code === 'IS';
  const acctSubtitle = isIceland ? t('annualAccountsTitle') : (lang === 'is' ? 'Ársreikningur' : 'Annual Accounts');
  // Browse the accounts for any year with data (not just the fiscal year), so the
  // owner can see all years. Only the displayed year changes — the figures come
  // from the same calcProfitLoss engine as before.
  const years = useMemo(() => {
    const ys = new Set(data.transactions.map(tx => yearOf(tx.date)));
    ys.add(data.settings.fiscalYear);
    return [...ys].sort((a, b) => b - a);
  }, [data.transactions, data.settings.fiscalYear]);
  const [year, setYear] = useState(data.settings.fiscalYear);
  const company = data.settings.company;
  const txs = filterByYear(data.transactions, year);
  const pl = calcProfitLoss(txs, data.settings.corporateTaxRate, data.settings.pricesIncludeVAT);

  // "Other operating expenses" = every operating line except wages and depreciation,
  // computed once (incl. electricity/heating) so the display and the export agree.
  const otherOp = pl.husaleiga + pl.rafmagnHiti + pl.simagjold + pl.skrifstofugjold + pl.samgongur + pl.markadsmal + pl.fagthjonusta + pl.vorur + pl.adrir;

  // Whether the immediately prior year has any bookings — drives the one-tap
  // "download both years" button (each year stays its own separate PDF).
  const prevYear = year - 1;
  const hasPrevYear = data.transactions.some(tx => yearOf(tx.date) === prevYear);

  const [bsModal, setBsModal] = useState<{ open: boolean; item?: BalanceSheetItem }>({ open: false });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'income' | 'balance' | 'notes'>('income');

  const bsItems = data.balanceSheetItems;

  const getSection = (section: BalanceSheetItem['section']) =>
    bsItems.filter(b => b.section === section);

  // Fixed assets shown at their year-end book value for the selected year; a property
  // only appears from its acquired year (see assetBookValue/assetVisible).
  const fixedAssetRows = getSection('fixed_assets')
    .filter(b => assetVisible(b, year))
    .map(b => ({ item: b, value: assetBookValue(b, year) }));
  const totalFixedAssets = fixedAssetRows.reduce((s, r) => s + r.value, 0);
  // The cash line ("Handbært fé") reflects the year-end CALCULATED cash (trackedCash,
  // defined below) so it mirrors the reconciled bank balance rather than a static 0.
  // totalCurrentAssets / totalAssets are computed after trackedCash (see below).
  const isCashLine = (b: BalanceSheetItem) =>
    b.computed === 'cash' || b.id === 'bs1' || (b.section === 'current_assets' && /handbært/i.test(b.name));

  // Static liability/equity lines the owner may have typed in manually (usually just
  // share capital). The full liability/equity totals — which also pull the real key
  // balances (loans, owner account) and accumulated profit — are computed below,
  // once those key balances are known.
  const staticEquity = getSection('equity').reduce((s, b) => s + b.amount, 0);
  const staticLongTerm = getSection('long_term_liabilities').reduce((s, b) => s + b.amount, 0);
  const staticCurrentLiab = getSection('current_liabilities').reduce((s, b) => s + b.amount, 0);

  // Carried key balances for the selected year: each balance-sheet key's closing
  // balance at year-end (opening + booked entries, principal-only for loans),
  // shown as a per-year informational section. Kept separate from the manual
  // balance-sheet totals above so a partly-keyed setup can't show a false
  // "doesn't balance" — full integration needs cash tracking (in progress).
  const keyClosing = (acc: Account): number => {
    const rows = accountBalanceByYear(acc, data.transactions);
    const upto = rows.filter(r => r.year <= year);
    if (upto.length) return upto[upto.length - 1].closing;
    return acc.openingYear != null && year >= acc.openingYear ? (acc.openingBalance ?? 0) : 0;
  };
  const balanceKeys = useMemo(() => {
    const rowsFor = (type: Account['type']) => data.accounts
      .filter(a => a.isActive && a.type === type &&
        (a.openingBalance != null || data.transactions.some(tx => tx.accountId === a.id)))
      .map(a => ({ acc: a, closing: keyClosing(a) }));
    return { asset: rowsFor('asset'), liability: rowsFor('liability'), equity: rowsFor('equity') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.accounts, data.transactions, year]);

  // Cash-basis financial position at year-end that actually balances:
  //   Assets (tracked cash + asset keys) = Liabilities (liab keys) + Equity (equity keys + retained earnings).
  // Cash = every money movement (in +, out −) except (a) entries booked onto an
  // asset key (that key tracks its own balance, counting it here too would double
  // it) and (b) DEPRECIATION (afskriftir) — a non-cash expense: it lowers profit
  // and the fixed-asset book value (book it onto the asset key) but no money moves.
  // Retained earnings = accumulated profit before income tax (a tax accrual isn't a
  // cash movement; actual tax paid is its own transaction). Verified to net to 0
  // when the opening balances balance and entries are complete; any residual is
  // shown honestly so the owner can complete opening balances / fix an entry.
  const isAssetKey = (id?: string) => !!id && data.accounts.find(a => a.id === id)?.type === 'asset';
  const trackedCash = useMemo(() =>
    data.transactions
      .filter(tx => yearOf(tx.date) <= year && !isAssetKey(tx.accountId) && tx.category !== 'afskriftir')
      // Money IN = income, a loan received (lan_mottekid), OR an owner contribution
      // (framlag) — mirror accountBalanceByYear, so money paid IN isn't wrongly
      // counted as cash going out.
      .reduce((s, tx) => s + ((tx.type === 'income' || tx.category === 'lan_mottekid' || tx.category === 'framlag') ? getTransactionISK(tx) : -getTransactionISK(tx)), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.transactions, data.accounts, year]);
  // Current assets: the cash line shows the calculated (bank) cash for the selected
  // year; every other line keeps its static amount.
  // Cash for the year: a positive balance is an asset; a NEGATIVE balance is a bank
  // overdraft (yfirdráttur), which is a short-term LIABILITY, not negative cash.
  const cashLineItem = getSection('current_assets').find(isCashLine);
  const cashRaw = cashLineItem ? (cashLineItem.cashByYear?.[String(year)] ?? trackedCash) : 0;
  const cashAsset = Math.max(0, cashRaw);
  const overdraft = Math.max(0, -cashRaw);
  const currentAssetValue = (b: BalanceSheetItem) => isCashLine(b) ? cashAsset : b.amount;
  const totalCurrentAssets = getSection('current_assets').reduce((s, b) => s + currentAssetValue(b), 0);
  const retainedEarnings = useMemo(() => {
    const yrs = [...new Set(data.transactions.map(t => yearOf(t.date)))].filter(y => y <= year);
    return yrs.reduce((s, y) => s + calcProfitLoss(filterByYear(data.transactions, y), data.settings.corporateTaxRate, data.settings.pricesIncludeVAT).profitBeforeTax, 0);
  }, [data.transactions, year, data.settings.corporateTaxRate, data.settings.pricesIncludeVAT]);
  const posAssetKeys = balanceKeys.asset.reduce((s, r) => s + r.closing, 0);
  const posLiab = balanceKeys.liability.reduce((s, r) => s + r.closing, 0);
  const posEquityKeys = balanceKeys.equity.reduce((s, r) => s + r.closing, 0);

  // ── Unified balance sheet ────────────────────────────────────────────────
  // ONE formal Efnahagsreikningur that pulls the real key balances (loans as
  // liabilities, owner account + accumulated profit as equity) AND recognises the
  // properties, instead of a static sheet + a separate calculated position box.
  //   Assets      = fixed assets (properties, book value) + cash + other current + asset keys
  //   Liabilities = loan/liability keys + any static liability lines
  //   Equity      = share capital + owner/equity keys + accumulated profit + property equity
  // Property equity = the properties' book value (financed by the mortgages above +
  // the owner's own funds); it balances the property asset. Any residual (bsDiff) is
  // shown honestly — it means opening balances/loans aren't fully entered yet.
  const totalAssets = totalFixedAssets + totalCurrentAssets + posAssetKeys;
  const totalLiabilities = posLiab + staticLongTerm + staticCurrentLiab + overdraft;
  // Owner's equity in the properties = their book value MINUS the loans that finance
  // them (the liability keys). This balances the property asset against its mortgages
  // + this equity, so the properties don't inflate the sheet. Only when properties
  // exist; any residual (bsDiff) is then the honest operating gap (cash vs equity).
  // Only MORTGAGE keys (loans that financed the properties) net against property book
  // value. Non-mortgage debt (family/working-capital loans) stays in liabilities,
  // offset by the cash/asset it produced — so the sheet balances by construction.
  const mortgageLiab = balanceKeys.liability.reduce((s, r) => s + (r.acc.isPropertyMortgage ? r.closing : 0), 0);
  const propertyEquity = totalFixedAssets > 0 ? totalFixedAssets - mortgageLiab : 0;
  const totalEquityFull = staticEquity + posEquityKeys + retainedEarnings + propertyEquity;
  const totalEquityAndLiab = totalLiabilities + totalEquityFull;
  const bsDiff = totalAssets - totalEquityAndLiab;

  // Full year-end picture for ANY year, from the same pure engines as the on-screen
  // display — lets each year be exported as its OWN separate statement (the owner
  // wants 2025 and 2026 as two independent reports, not one merged sheet). Mirrors
  // the memoised values above for the selected year.
  function computeYear(y: number) {
    const plY = calcProfitLoss(filterByYear(data.transactions, y), data.settings.corporateTaxRate, data.settings.pricesIncludeVAT);
    const otherOpY = plY.husaleiga + plY.rafmagnHiti + plY.simagjold + plY.skrifstofugjold + plY.samgongur + plY.markadsmal + plY.fagthjonusta + plY.vorur + plY.adrir;
    const closingFor = (acc: Account): number => {
      const rows = accountBalanceByYear(acc, data.transactions).filter(r => r.year <= y);
      if (rows.length) return rows[rows.length - 1].closing;
      return acc.openingYear != null && y >= acc.openingYear ? (acc.openingBalance ?? 0) : 0;
    };
    const rowsFor = (type: Account['type']) => data.accounts
      .filter(a => a.isActive && a.type === type && (a.openingBalance != null || data.transactions.some(tx => tx.accountId === a.id)))
      .map(a => ({ acc: a, closing: closingFor(a) }));
    const bk = { asset: rowsFor('asset'), liability: rowsFor('liability'), equity: rowsFor('equity') };
    const cash = data.transactions
      .filter(tx => yearOf(tx.date) <= y && !isAssetKey(tx.accountId) && tx.category !== 'afskriftir')
      .reduce((s, tx) => s + ((tx.type === 'income' || tx.category === 'lan_mottekid' || tx.category === 'framlag') ? getTransactionISK(tx) : -getTransactionISK(tx)), 0);
    const retained = [...new Set(data.transactions.map(t => yearOf(t.date)))]
      .filter(yy => yy <= y)
      .reduce((s, yy) => s + calcProfitLoss(filterByYear(data.transactions, yy), data.settings.corporateTaxRate, data.settings.pricesIncludeVAT).profitBeforeTax, 0);
    const posAssets = cash + bk.asset.reduce((s, r) => s + r.closing, 0);
    const posLiab = bk.liability.reduce((s, r) => s + r.closing, 0);
    const posEquity = bk.equity.reduce((s, r) => s + r.closing, 0) + retained;
    const hasPosition = bk.asset.length + bk.liability.length + bk.equity.length > 0 || Math.abs(cash) > 0.5 || Math.abs(retained) > 0.5;
    return { plY, otherOpY, bk, cash, retained, posAssets, posLiab, posEquity, posDiff: posAssets - posLiab - posEquity, hasPosition };
  }

  function handleSaveBs(item: BalanceSheetItem) {
    const exists = bsItems.find(b => b.id === item.id);
    dispatch(exists
      ? { type: 'UPDATE_BS_ITEM', payload: item }
      : { type: 'ADD_BS_ITEM', payload: item }
    );
    setBsModal({ open: false });
  }

  // The exact figures shown on screen, flattened into a two-column statement so
  // the annual accounts can be downloaded as a PDF or attached to an email. Same
  // numbers as the display — no separate calculation.
  function statementExport(y: number): { columns: ExportColumn[]; rows: ExportRow[] } {
    const nm = (i: BalanceSheetItem) => lang === 'is' ? i.name : (i.nameEn || i.name);
    const R = (label: string, amount: number): ExportRow => ({ label, amount: fmtISK(amount) });
    const SEC = (label: string): ExportRow => ({ label: label.toUpperCase(), amount: '' });
    const { plY, otherOpY, bk, cash, retained } = computeYear(y);
    // Fixed assets at their book value for THIS year (a property only from its
    // acquired year), so each year's PDF shows that year's depreciated value.
    const fixedRowsY = getSection('fixed_assets').filter(i => assetVisible(i, y)).map(i => ({ i, v: assetBookValue(i, y) }));
    const totalFixedY = fixedRowsY.reduce((s, r) => s + r.v, 0);
    // Current assets for THIS year: positive cash is an asset; negative = overdraft (liability).
    const cashRawY = cashLineItem ? (cashLineItem.cashByYear?.[String(y)] ?? cash) : cash;
    const cashAssetY = Math.max(0, cashRawY);
    const overdraftY = Math.max(0, -cashRawY);
    const currentAssetValY = (i: BalanceSheetItem) => isCashLine(i) ? cashAssetY : i.amount;
    const totalCurrentAssetsY = getSection('current_assets').reduce((s, i) => s + currentAssetValY(i), 0);
    // Unified balance sheet for THIS year (mirrors the on-screen statement): pulls
    // the key balances (loans, owner account) + accumulated profit, and recognises
    // the properties' book value as equity.
    const assetKeysY = bk.asset.reduce((s, r) => s + r.closing, 0);
    const liabKeysY = bk.liability.reduce((s, r) => s + r.closing, 0);
    const equityKeysY = bk.equity.reduce((s, r) => s + r.closing, 0);
    const totalAssetsY = totalFixedY + totalCurrentAssetsY + assetKeysY;
    // Only MORTGAGE keys net against the properties (mirrors the on-screen calc);
    // non-mortgage debt stays a normal liability offset by the cash it produced.
    const mortgageLiabY = bk.liability.reduce((s, r) => s + (r.acc.isPropertyMortgage ? r.closing : 0), 0);
    const propertyEquityY = totalFixedY > 0 ? totalFixedY - mortgageLiabY : 0;
    const totalLiabY = liabKeysY + staticLongTerm + staticCurrentLiab + overdraftY;
    const totalEquityY = staticEquity + equityKeysY + retained + propertyEquityY;
    const totalEquityAndLiabY = totalLiabY + totalEquityY;
    const bsDiffY = totalAssetsY - totalEquityAndLiabY;
    const keyLbl = (acc: Account) => `${acc.number} ${lang === 'is' ? acc.name : (acc.nameEn || acc.name)}`;
    const rows: ExportRow[] = [];
    rows.push(SEC(t('incomeStatement')));
    rows.push(SEC(t('revenues')));
    if (plY.salaTekjur > 0) rows.push(R(t('sala_vara'), plY.salaTekjur));
    if (plY.thjonustutekjur > 0) rows.push(R(t('sala_thjonustu'), plY.thjonustutekjur));
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
    rows.push(R(t('longTermLiabilities'), staticLongTerm + liabKeysY));
    getSection('current_liabilities').forEach(i => rows.push(R(nm(i), i.amount)));
    rows.push(R(t('currentLiabilities'), staticCurrentLiab));
    rows.push(R(t('equityAndLiabilities'), totalEquityAndLiabY));
    if (Math.abs(bsDiffY) > 1) rows.push(R(lang === 'is' ? 'Mismunur (vantar lán/opnunarstöður)' : 'Difference (loans/opening balances incomplete)', bsDiffY));
    return {
      columns: [
        { header: t('description'), key: 'label', width: 120 },
        { header: `${y} (${baseCur})`, key: 'amount', width: 45 },
      ],
      rows,
    };
  }

  const pdfTitle = company.name || t('annualAccounts');
  const subtitleFor = (y: number) => `${t('annualAccounts')} — ${y}${company.kennitala ? ` · ${company.kennitala}` : ''}`;
  const fileFor = (y: number) => `arsreikningur_${y}.pdf`;

  function downloadYear(y: number) {
    const { columns, rows } = statementExport(y);
    exportPDF(pdfTitle, subtitleFor(y), columns, rows, fileFor(y));
  }
  // Two years, two separate PDFs (current + prior) — one tap, each its own report.
  function downloadBothYears() {
    downloadYear(year);
    downloadYear(prevYear);
  }
  async function emailAccounts() {
    const { columns, rows } = statementExport(year);
    await sharePDF(pdfTitle, subtitleFor(year), columns, rows, fileFor(year), {
      emailTo: '',
      subject: `${t('annualAccounts')} ${year} — ${company.name}`,
      body: `${t('annualAccounts')} ${year}`,
    });
  }

  const BSRow = ({ label, amount, bold, indent }: { label: string; amount: number; bold?: boolean; indent?: boolean }) => (
    <tr className={bold ? 'border-t border-gray-300 bg-gray-50' : ''}>
      <td className={`px-4 py-1.5 text-sm ${bold ? 'font-bold' : ''} ${indent ? 'pl-8' : ''}`}>{label}</td>
      <td className={`px-4 py-1.5 text-sm text-right font-mono ${bold ? 'font-bold' : ''}`}>
        {amount !== 0 || bold ? fmtISK(amount) : '—'}
      </td>
    </tr>
  );

  const PLRow = ({ label, amount, bold, indent, isNeg }: { label: string; amount: number; bold?: boolean; indent?: boolean; isNeg?: boolean }) => (
    <tr className={bold ? 'border-t border-gray-300 bg-gray-50' : ''}>
      <td className={`px-4 py-1.5 text-sm ${bold ? 'font-bold' : ''} ${indent ? 'pl-8' : ''}`}>{label}</td>
      <td className={`px-4 py-1.5 text-sm text-right font-mono ${bold ? 'font-bold' : ''}`}>
        {amount !== 0 ? fmtISK(isNeg ? -amount : amount) : '—'}
      </td>
    </tr>
  );

  const tabs = [
    { id: 'income' as const, label: t('incomeStatement') },
    { id: 'balance' as const, label: t('balanceSheet') },
    { id: 'notes' as const, label: t('notes') },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('annualAccounts')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{acctSubtitle}</p>
        </div>
        <div className="flex gap-2 no-print items-center">
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            title={lang === 'is' ? 'Reikningsár' : 'Financial year'}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => setBsModal({ open: true })}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <Plus className="w-4 h-4" />
            {t('addBalanceSheetItem')}
          </button>
          <button
            onClick={() => downloadYear(year)}
            title={lang === 'is' ? `Sækja PDF (${year})` : `Download PDF (${year})`}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{lang === 'is' ? `Sækja ${year}` : `Download ${year}`}</span>
          </button>
          {hasPrevYear && (
            <button
              onClick={downloadBothYears}
              title={lang === 'is' ? `Sækja ${year} og ${prevYear} — sitt hvort PDF` : `Download ${year} and ${prevYear} — separate PDFs`}
              className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{lang === 'is' ? `Sækja bæði árin (${year} + ${prevYear})` : `Download both years (${year} + ${prevYear})`}</span>
            </button>
          )}
          <button
            onClick={emailAccounts}
            title={lang === 'is' ? 'Senda í tölvupósti' : 'Send by email'}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">{lang === 'is' ? 'Senda' : 'Send'}</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Printer className="w-4 h-4" />
            {t('printAccounts')}
          </button>
        </div>
      </div>

      {/* Print header */}
      <div className="print-only text-center mb-6 border-b pb-4">
        <div className="text-xl font-bold">{company.name}</div>
        {company.kennitala && <div className="text-sm text-gray-600">{t('companyKennitala')}: {company.kennitala}</div>}
        {company.address && <div className="text-sm text-gray-600">{company.address}{company.postalCode ? `, ${company.postalCode}` : ''} {company.city}</div>}
        <div className="text-base font-semibold mt-2">{t('annualAccounts')} {t('forYear')} {year}</div>
        <div className="text-xs text-gray-500 mt-1">{acctSubtitle}</div>
      </div>

      {/* Company info bar */}
      {company.name && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 mb-5 flex flex-wrap gap-4 text-sm no-print">
          <span className="font-semibold text-blue-900">{company.name}</span>
          {company.kennitala && <span className="text-blue-700">{t('companyKennitala')}: {company.kennitala}</span>}
          {company.vskNumber && <span className="text-blue-700">{cc.vatNumberLabel}: {company.vskNumber}</span>}
          <span className="text-blue-700">{t('fiscalYear')}: {year}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-5 no-print">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Income Statement */}
      {(activeTab === 'income' || true) && (
        <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden mb-5 ${activeTab !== 'income' ? 'hidden print-only' : ''}`}>
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="font-bold text-gray-900">{t('incomeStatement')}</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-xs text-gray-500 font-semibold text-left uppercase">{t('description')}</th>
                <th className="px-4 py-2 text-xs text-gray-500 font-semibold text-right uppercase">{year} ({baseCur})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              <tr className="bg-blue-50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-blue-700 uppercase">{t('revenues')}</td></tr>
              {pl.salaTekjur > 0 && <PLRow label={t('sala_vara')} amount={pl.salaTekjur} indent />}
              {pl.thjonustutekjur > 0 && <PLRow label={t('sala_thjonustu')} amount={pl.thjonustutekjur} indent />}
              {pl.adrarTekjur > 0 && <PLRow label={t('adrar_tekjur')} amount={pl.adrarTekjur} indent />}
              <PLRow label={t('revenues')} amount={pl.totalRevenue} bold />

              <tr className="bg-blue-50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-blue-700 uppercase">{t('operatingExpenses')}</td></tr>
              {(pl.laun + pl.launatengd) > 0 && <PLRow label={t('wagesExpenses')} amount={pl.laun + pl.launatengd} indent isNeg />}
              {pl.afskriftir > 0 && <PLRow label={t('afskriftir')} amount={pl.afskriftir} indent isNeg />}
              {otherOp > 0 && (
                <PLRow label={t('otherOperating')} amount={otherOp} indent isNeg />
              )}
              <PLRow label={t('operatingExpenses')} amount={-pl.totalOperatingExpenses} bold />
              <PLRow label={t('operatingProfit')} amount={pl.operatingProfit} bold />

              {(pl.fjarmagntekjur > 0 || pl.fjarmagnsgjold > 0) && (
                <>
                  <tr className="bg-blue-50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-blue-700 uppercase">{t('financialIncome')} / {t('financialExpenses')}</td></tr>
                  {pl.fjarmagntekjur > 0 && <PLRow label={t('fjarmagns_tekjur')} amount={pl.fjarmagntekjur} indent />}
                  {pl.fjarmagnsgjold > 0 && <PLRow label={t('fjarmagnsgjold')} amount={-pl.fjarmagnsgjold} indent />}
                </>
              )}
              <PLRow label={t('profitBeforeTax')} amount={pl.profitBeforeTax} bold />
              {pl.incomeTax > 0 && <PLRow label={t('incomeTax')} amount={-pl.incomeTax} indent />}
              <PLRow label={t('netResult')} amount={pl.netResult} bold />
            </tbody>
          </table>
        </div>
      )}

      {/* Balance Sheet */}
      {(activeTab === 'balance' || true) && (
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5 ${activeTab !== 'balance' ? 'hidden print-only' : ''}`}>
          {/* Assets */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-bold text-gray-900">{t('assets')}</h2>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-xs text-gray-500 font-semibold text-left uppercase">{t('description')}</th>
                  <th className="px-4 py-2 text-xs text-gray-500 font-semibold text-right uppercase">{year} ({baseCur})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                <tr className="bg-blue-50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-blue-700 uppercase">{t('fixedAssets')}</td></tr>
                {fixedAssetRows.map(({ item, value }) => (
                  <tr key={item.id}>
                    <td className="px-4 py-1.5 text-sm pl-8 flex items-center gap-2">
                      {lang === 'is' ? item.name : (item.nameEn || item.name)}
                      {item.cost != null && item.acquiredYear != null && (
                        <span className="text-xs text-gray-400">({lang === 'is' ? 'bókf. verð' : 'book value'})</span>
                      )}
                      <button onClick={() => setBsModal({ open: true, item })} className="text-gray-300 hover:text-blue-500 no-print"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => setDeleteId(item.id)} className="text-gray-300 hover:text-red-500 no-print"><Trash2 className="w-3 h-3" /></button>
                    </td>
                    <td className="px-4 py-1.5 text-sm text-right font-mono">{fmtISK(value)}</td>
                  </tr>
                ))}
                <BSRow label={t('fixedAssets')} amount={totalFixedAssets} bold />

                <tr className="bg-blue-50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-blue-700 uppercase">{t('currentAssets')}</td></tr>
                {getSection('current_assets').map(item => (
                  <tr key={item.id}>
                    <td className="px-4 py-1.5 text-sm pl-8 flex items-center gap-2">
                      {lang === 'is' ? item.name : (item.nameEn || item.name)}
                      {isCashLine(item) && <span className="text-xs text-gray-400">({lang === 'is' ? 'skv. banka' : 'per bank'})</span>}
                      {!isCashLine(item) && <button onClick={() => setBsModal({ open: true, item })} className="text-gray-300 hover:text-blue-500 no-print"><Pencil className="w-3 h-3" /></button>}
                      {!isCashLine(item) && <button onClick={() => setDeleteId(item.id)} className="text-gray-300 hover:text-red-500 no-print"><Trash2 className="w-3 h-3" /></button>}
                    </td>
                    <td className="px-4 py-1.5 text-sm text-right font-mono">{fmtISK(currentAssetValue(item))}</td>
                  </tr>
                ))}
                <BSRow label={t('currentAssets')} amount={totalCurrentAssets} bold />
                {balanceKeys.asset.map(({ acc, closing }) => (
                  <tr key={acc.id}>
                    <td className="px-4 py-1.5 text-sm pl-8">{acc.number} {lang === 'is' ? acc.name : (acc.nameEn || acc.name)}</td>
                    <td className="px-4 py-1.5 text-sm text-right font-mono">{fmtISK(closing)}</td>
                  </tr>
                ))}
                <BSRow label={t('totalAssets')} amount={totalAssets} bold />
              </tbody>
            </table>
          </div>

          {/* Equity & Liabilities */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h2 className="font-bold text-gray-900">{t('equityAndLiabilities')}</h2>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-xs text-gray-500 font-semibold text-left uppercase">{t('description')}</th>
                  <th className="px-4 py-2 text-xs text-gray-500 font-semibold text-right uppercase">{year} ({baseCur})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                <tr className="bg-blue-50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-blue-700 uppercase">{t('equity')}</td></tr>
                {getSection('equity').map(item => (
                  <tr key={item.id}>
                    <td className="px-4 py-1.5 text-sm pl-8 flex items-center gap-2">
                      {lang === 'is' ? item.name : (item.nameEn || item.name)}
                      <button onClick={() => setBsModal({ open: true, item })} className="text-gray-300 hover:text-blue-500 no-print"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => setDeleteId(item.id)} className="text-gray-300 hover:text-red-500 no-print"><Trash2 className="w-3 h-3" /></button>
                    </td>
                    <td className="px-4 py-1.5 text-sm text-right font-mono">{fmtISK(item.amount)}</td>
                  </tr>
                ))}
                {balanceKeys.equity.map(({ acc, closing }) => (
                  <tr key={acc.id}>
                    <td className="px-4 py-1.5 text-sm pl-8">{acc.number} {lang === 'is' ? acc.name : (acc.nameEn || acc.name)}</td>
                    <td className="px-4 py-1.5 text-sm text-right font-mono">{fmtISK(closing)}</td>
                  </tr>
                ))}
                <tr><td className="px-4 py-1.5 text-sm pl-8">{lang === 'is' ? 'Uppsafnaður hagnaður' : 'Accumulated profit'}</td><td className="px-4 py-1.5 text-sm text-right font-mono">{fmtISK(retainedEarnings)}</td></tr>
                {totalFixedAssets > 0 && (
                  <tr><td className="px-4 py-1.5 text-sm pl-8">{lang === 'is' ? 'Eigið fé í fasteignum (bókf. verð − áhvílandi lán)' : 'Equity in properties (book value − mortgages)'}</td><td className="px-4 py-1.5 text-sm text-right font-mono">{fmtISK(propertyEquity)}</td></tr>
                )}
                <BSRow label={t('totalEquity')} amount={totalEquityFull} bold />

                <tr className="bg-blue-50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-blue-700 uppercase">{t('longTermLiabilities')}</td></tr>
                {getSection('long_term_liabilities').map(item => (
                  <tr key={item.id}>
                    <td className="px-4 py-1.5 text-sm pl-8 flex items-center gap-2">
                      {lang === 'is' ? item.name : (item.nameEn || item.name)}
                      <button onClick={() => setBsModal({ open: true, item })} className="text-gray-300 hover:text-blue-500 no-print"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => setDeleteId(item.id)} className="text-gray-300 hover:text-red-500 no-print"><Trash2 className="w-3 h-3" /></button>
                    </td>
                    <td className="px-4 py-1.5 text-sm text-right font-mono">{fmtISK(item.amount)}</td>
                  </tr>
                ))}
                {balanceKeys.liability.map(({ acc, closing }) => (
                  <tr key={acc.id}>
                    <td className="px-4 py-1.5 text-sm pl-8">{acc.number} {lang === 'is' ? acc.name : (acc.nameEn || acc.name)}</td>
                    <td className="px-4 py-1.5 text-sm text-right font-mono">{fmtISK(closing)}</td>
                  </tr>
                ))}
                <BSRow label={t('longTermLiabilities')} amount={staticLongTerm + posLiab} bold />

                <tr className="bg-blue-50"><td colSpan={2} className="px-4 py-1.5 text-xs font-bold text-blue-700 uppercase">{t('currentLiabilities')}</td></tr>
                {getSection('current_liabilities').map(item => (
                  <tr key={item.id}>
                    <td className="px-4 py-1.5 text-sm pl-8 flex items-center gap-2">
                      {lang === 'is' ? item.name : (item.nameEn || item.name)}
                      <button onClick={() => setBsModal({ open: true, item })} className="text-gray-300 hover:text-blue-500 no-print"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => setDeleteId(item.id)} className="text-gray-300 hover:text-red-500 no-print"><Trash2 className="w-3 h-3" /></button>
                    </td>
                    <td className="px-4 py-1.5 text-sm text-right font-mono">{fmtISK(item.amount)}</td>
                  </tr>
                ))}
                {overdraft > 0 && (
                  <tr><td className="px-4 py-1.5 text-sm pl-8">{lang === 'is' ? 'Yfirdráttur (skv. banka)' : 'Bank overdraft'}</td><td className="px-4 py-1.5 text-sm text-right font-mono">{fmtISK(overdraft)}</td></tr>
                )}
                <BSRow label={t('currentLiabilities')} amount={staticCurrentLiab + overdraft} bold />
                <BSRow label={t('totalEquityAndLiabilities')} amount={totalEquityAndLiab} bold />
              </tbody>
            </table>
            {Math.abs(bsDiff) > 1 ? (
              <div className="px-4 py-2 bg-yellow-50 border-t border-yellow-200 text-xs text-yellow-800">
                ⚠️ {lang === 'is' ? 'Efnahagsreikningur jafnast ekki — uppfærðu opnunarstöður' : 'Balance sheet does not balance — update opening balances'}
              </div>
            ) : (
              <div className="px-4 py-2 bg-green-50 border-t border-green-200 text-xs text-green-700">
                {lang === 'is' ? '✓ Efnahagur jafnast' : '✓ Balance sheet balances'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      {(activeTab === 'notes' || true) && (
        <div className={`bg-white rounded-xl border border-gray-200 p-6 space-y-5 ${activeTab !== 'notes' ? 'hidden print-only' : ''}`}>
          <h2 className="font-bold text-gray-900 text-lg border-b pb-2">{t('notes')}</h2>

          <div>
            <h3 className="font-semibold text-gray-800 mb-1">1. {t('note1Title')}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{isIceland ? t('note1Text') : (lang === 'is'
              ? `Ársreikningurinn er gerður í ${baseCur}. Tekjur og gjöld eru færð á þeim tíma sem þau eiga sér stað (gjaldfærslureglan).`
              : `The accounts are prepared in ${baseCur}. Revenues and expenses are recognized on an accrual basis.`)}</p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-800 mb-1">2. {t('note2Title')}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{t('note2Text')}</p>
            {company.vskNumber && (
              <p className="text-sm text-gray-600 mt-1">{cc.vatNumberLabel}: {company.vskNumber}</p>
            )}
          </div>

          <div>
            <h3 className="font-semibold text-gray-800 mb-1">3. {t('note3Title')}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{t('note3Text')}</p>
          </div>

          {/* Signature area */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <div className="border-b border-gray-400 mb-1 pb-8"></div>
                <p className="text-xs text-gray-500">{t('boardSignature')}</p>
              </div>
              <div>
                <div className="border-b border-gray-400 mb-1 pb-8"></div>
                <p className="text-xs text-gray-500">{t('signatureDate')}</p>
              </div>
            </div>
            {company.auditor && (
              <div className="mt-4">
                <p className="text-sm text-gray-600">{t('auditedBy')}: <span className="font-medium">{company.auditor}</span></p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {bsModal.open && (
        <BSModal
          initial={bsModal.item}
          onSave={handleSaveBs}
          onClose={() => setBsModal({ open: false })}
        />
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-base font-semibold text-gray-900 mb-2">{t('warning')}</h3>
            <p className="text-sm text-gray-600 mb-5">{t('confirmDelete')}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm hover:bg-gray-50">{t('cancel')}</button>
              <button onClick={() => { dispatch({ type: 'DELETE_BS_ITEM', payload: deleteId }); setDeleteId(null); }} className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm hover:bg-red-700">{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

