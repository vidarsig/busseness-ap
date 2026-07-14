import React, { useState, useRef } from 'react';
import { CheckCircle, Download, Upload, AlertCircle, Cloud, Copy, Loader2 } from 'lucide-react';
import { pullData, SETUP_SQL } from '../utils/supabase';
import { useApp } from '../contexts/AppContext';
import { AppSettings, Language, Currency, ExchangeRates, AppData } from '../types';
import { COUNTRY_LIST } from '../data/countries';

import type { SyncStatus } from '../contexts/AppContext';

// US states with their base STATE sales-tax rate (%). Picking a state pre-fills
// the rate as a starting point — local (city/county) rates add on, so the owner
// can still override. NoMB (0%) states: AK, DE, MT, NH, OR.
const US_STATES: { name: string; rate: number }[] = [
  { name: 'Alabama', rate: 4 }, { name: 'Alaska', rate: 0 }, { name: 'Arizona', rate: 5.6 },
  { name: 'Arkansas', rate: 6.5 }, { name: 'California', rate: 7.25 }, { name: 'Colorado', rate: 2.9 },
  { name: 'Connecticut', rate: 6.35 }, { name: 'Delaware', rate: 0 }, { name: 'Florida', rate: 6 },
  { name: 'Georgia', rate: 4 }, { name: 'Hawaii', rate: 4 }, { name: 'Idaho', rate: 6 },
  { name: 'Illinois', rate: 6.25 }, { name: 'Indiana', rate: 7 }, { name: 'Iowa', rate: 6 },
  { name: 'Kansas', rate: 6.5 }, { name: 'Kentucky', rate: 6 }, { name: 'Louisiana', rate: 4.45 },
  { name: 'Maine', rate: 5.5 }, { name: 'Maryland', rate: 6 }, { name: 'Massachusetts', rate: 6.25 },
  { name: 'Michigan', rate: 6 }, { name: 'Minnesota', rate: 6.875 }, { name: 'Mississippi', rate: 7 },
  { name: 'Missouri', rate: 4.225 }, { name: 'Montana', rate: 0 }, { name: 'Nebraska', rate: 5.5 },
  { name: 'Nevada', rate: 6.85 }, { name: 'New Hampshire', rate: 0 }, { name: 'New Jersey', rate: 6.625 },
  { name: 'New Mexico', rate: 4.875 }, { name: 'New York', rate: 4 }, { name: 'North Carolina', rate: 4.75 },
  { name: 'North Dakota', rate: 5 }, { name: 'Ohio', rate: 5.75 }, { name: 'Oklahoma', rate: 4.5 },
  { name: 'Oregon', rate: 0 }, { name: 'Pennsylvania', rate: 6 }, { name: 'Rhode Island', rate: 7 },
  { name: 'South Carolina', rate: 6 }, { name: 'South Dakota', rate: 4.2 }, { name: 'Tennessee', rate: 7 },
  { name: 'Texas', rate: 6.25 }, { name: 'Utah', rate: 6.1 }, { name: 'Vermont', rate: 6 },
  { name: 'Virginia', rate: 5.3 }, { name: 'Washington', rate: 6.5 }, { name: 'West Virginia', rate: 6 },
  { name: 'Wisconsin', rate: 5 }, { name: 'Wyoming', rate: 4 }, { name: 'District of Columbia', rate: 6 },
];

function CloudSyncSection({ lang, url, apiKey, userKey, setUrl, setApiKey, setUserKey, onSave, syncStatus, lastSyncedAt, syncNow, dispatch }: {
  lang: string; url: string; apiKey: string; userKey: string;
  setUrl: (v: string) => void; setApiKey: (v: string) => void; setUserKey: (v: string) => void;
  onSave: () => void; syncStatus: SyncStatus; lastSyncedAt: string | null;
  syncNow: () => Promise<void>; dispatch: React.Dispatch<{ type: 'LOAD'; payload: AppData }>;
}) {
  const [open, setOpen] = useState(false);
  const [showSql, setShowSql] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [testing, setTesting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  const isConfigured = url && apiKey && userKey;

  async function testConnection() {
    setTesting(true); setTestMsg('');
    const result = await pullData(url, apiKey, userKey);
    setTesting(false);
    if (result.error === 'no_data') setTestMsg(lang === 'is' ? '✓ Tenging tókst (engin gögn ennþá)' : '✓ Connected (no data yet)');
    else if (result.error) setTestMsg(`✗ ${result.error}`);
    else setTestMsg(lang === 'is' ? '✓ Tenging tókst' : '✓ Connection successful');
  }

  async function pullFromCloud() {
    setPulling(true); setTestMsg('');
    const result = await pullData(url, apiKey, userKey);
    setPulling(false);
    if (result.error || !result.data) { setTestMsg(`✗ ${result.error ?? 'no_data'}`); return; }
    dispatch({ type: 'LOAD', payload: result.data });
    setTestMsg(lang === 'is' ? '✓ Gögn sótt úr skýi' : '✓ Data pulled from cloud');
  }

  const statusColor = syncStatus === 'synced' ? 'text-green-600' : syncStatus === 'error' ? 'text-red-600' : syncStatus === 'syncing' ? 'text-blue-600' : 'text-gray-400';
  const statusLabel = syncStatus === 'synced' ? (lang === 'is' ? 'Samstillt' : 'Synced') : syncStatus === 'error' ? (lang === 'is' ? 'Villa' : 'Error') : syncStatus === 'syncing' ? (lang === 'is' ? 'Samstilli…' : 'Syncing…') : (lang === 'is' ? 'Óvirkt' : 'Inactive');

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <button className="w-full flex items-center justify-between" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-2">
          <Cloud className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-bold text-gray-800">{lang === 'is' ? 'Samstilling í skýi (Supabase)' : 'Cloud Sync (Supabase)'}</h2>
        </div>
        <div className="flex items-center gap-2">
          {isConfigured && <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>}
          <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-gray-500">
            {lang === 'is'
              ? 'Tengdu við Supabase til að gögn samstillist sjálfkrafa á milli tækja. Ókeypis á supabase.com.'
              : 'Connect to Supabase to automatically sync data across devices. Free at supabase.com.'}
          </p>

          {/* Setup SQL */}
          <div>
            <button onClick={() => setShowSql(s => !s)}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              {showSql ? '▲' : '▼'} {lang === 'is' ? 'Sýna uppsetningarleiðbeiningar' : 'Show setup instructions'}
            </button>
            {showSql && (
              <div className="mt-2 bg-gray-900 rounded-lg p-3 relative">
                <pre className="text-xs text-green-300 whitespace-pre-wrap overflow-x-auto">{SETUP_SQL}</pre>
                <button onClick={() => navigator.clipboard.writeText(SETUP_SQL)}
                  className="absolute top-2 right-2 text-gray-400 hover:text-white p-1">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Supabase URL</label>
              <input className={inp} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Anon Key</label>
              <input type="password" className={inp} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="eyJhbGciOiJIUzI1NiIs…" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{lang === 'is' ? 'Notandanykill (einkvæmt auðkenni, t.d. netfang)' : 'User key (unique ID, e.g. your email)'}</label>
              <input className={inp} value={userKey} onChange={e => setUserKey(e.target.value)} placeholder={lang === 'is' ? 'fyrirtaeki@example.com' : 'company@example.com'} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => { onSave(); }}
              className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-blue-700">
              <CheckCircle className="w-3.5 h-3.5" />
              {lang === 'is' ? 'Vista stillingar' : 'Save settings'}
            </button>
            {isConfigured && (
              <>
                <button onClick={testConnection} disabled={testing}
                  className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50">
                  {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />}
                  {lang === 'is' ? 'Prófa tengingu' : 'Test connection'}
                </button>
                <button onClick={syncNow}
                  className="flex items-center gap-1.5 border border-blue-300 text-blue-700 bg-blue-50 px-3 py-2 rounded-lg text-xs font-medium hover:bg-blue-100">
                  {syncStatus === 'syncing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />}
                  {lang === 'is' ? 'Samstilla núna' : 'Sync now'}
                </button>
                <button onClick={pullFromCloud} disabled={pulling}
                  className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-xs font-medium hover:bg-gray-50 disabled:opacity-50">
                  {pulling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {lang === 'is' ? 'Sækja úr skýi' : 'Pull from cloud'}
                </button>
              </>
            )}
          </div>

          {testMsg && (
            <p className={`text-xs rounded-lg px-3 py-2 ${testMsg.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {testMsg}
            </p>
          )}

          {isConfigured && lastSyncedAt && (
            <p className="text-xs text-gray-400">
              {lang === 'is' ? 'Síðast samstillt' : 'Last synced'}: {new Date(lastSyncedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const { data, dispatch, t, lang, cc, syncStatus, lastSyncedAt, syncNow } = useApp();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<AppSettings>({ ...data.settings });
  const [restoreError, setRestoreError] = useState('');
  const [restoreOk, setRestoreOk] = useState(false);
  const restoreRef = useRef<HTMLInputElement>(null);

  function exportBackup() {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bokhalds_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreError('');
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as AppData;
        if (!parsed.transactions || !parsed.settings) throw new Error('invalid');
        dispatch({ type: 'LOAD', payload: parsed });
        setRestoreOk(true);
        setTimeout(() => setRestoreOk(false), 3000);
      } catch {
        setRestoreError(lang === 'is' ? 'Ógild öryggisafritsskrá' : 'Invalid backup file');
      }
    };
    reader.readAsText(file);
    if (restoreRef.current) restoreRef.current.value = '';
  }

  function setCompany<K extends keyof AppSettings['company']>(k: K, v: AppSettings['company'][K]) {
    setForm(f => ({ ...f, company: { ...f.company, [k]: v } }));
  }

  function setTop<K extends keyof AppSettings>(k: K, v: AppSettings[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function setRate(currency: keyof ExchangeRates, value: number) {
    setForm(f => ({ ...f, exchangeRates: { ...f.exchangeRates, [currency]: value } }));
  }

  function handleSave() {
    dispatch({ type: 'UPDATE_SETTINGS', payload: form });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">{t('settings')}</h1>
        <button onClick={handleSave}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          {saved && <CheckCircle className="w-4 h-4" />}
          {saved ? t('settingsSaved') : t('saveSettings')}
        </button>
      </div>

      {/* Country / Jurisdiction */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <h2 className="text-sm font-bold text-gray-800 mb-3">
          {lang === 'is' ? 'Land / umdæmi' : 'Country / Jurisdiction'}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {COUNTRY_LIST.map(c => (
            <button key={c.code} type="button"
              onClick={() => {
                setTop('country', c.code);
                setTop('defaultCurrency', c.currency);
                setTop('taxWithholdingRate', c.taxWithholdingRate);
                setTop('employeePensionRate', c.employeePensionRate);
                setTop('employerPensionRate', c.employerPensionRate);
                setTop('socialInsuranceRate', c.socialInsuranceRate);
                setTop('personalDeductionMonthly', c.personalDeductionMonthly);
                setTop('vatRates', c.vatRates);
                setTop('standardRate', c.standardRate);
                setTop('vatTerm', c.vatTerm);
                setTop('taxAuthority', c.taxAuthority);
                setTop('companyIdLabel', c.companyIdLabel);
                setTop('vatNumberLabel', c.vatNumberLabel);
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-colors ${
                form.country === c.code
                  ? 'bg-blue-50 border-blue-500'
                  : 'border-gray-200 hover:border-gray-300'
              }`}>
              <span className="text-xl">{c.flag}</span>
              <div>
                <div className="text-xs font-medium text-gray-800">{c.nameEn}</div>
                <div className="text-xs text-gray-400">{c.currency}</div>
              </div>
            </button>
          ))}
        </div>
        {/* US sales tax rate */}
        {form.country === 'US' && (
          <>
            <div className="mt-3">
              <label className={labelCls}>{lang === 'is' ? 'Ríki (fylki)' : 'State'}</label>
              <select className={inputCls} value={form.usState ?? ''}
                onChange={e => {
                  const st = US_STATES.find(s => s.name === e.target.value);
                  setTop('usState', e.target.value);
                  if (st) setTop('salesTaxRate', st.rate);
                }}>
                <option value="">{lang === 'is' ? 'Veldu ríki…' : 'Select state…'}</option>
                {US_STATES.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">{lang === 'is' ? 'Velur grunn-söluskattshlutfall ríkisins' : 'Sets the state base sales-tax rate'}</p>
            </div>
            <div className="mt-3">
              <label className={labelCls}>{lang === 'is' ? 'Söluskattshlutfall (%)' : 'Sales tax rate (%)'}</label>
              <input type="number" className={inputCls} value={form.salesTaxRate}
                onChange={e => setTop('salesTaxRate', parseFloat(e.target.value) || 0)}
                min={0} max={30} step="0.01" />
              <p className="text-xs text-gray-400 mt-1">{lang === 'is' ? 'Grunnhlutfall ríkis — bættu við staðbundnu hlutfalli ef á við' : 'State base rate — add your local (city/county) rate if any'}</p>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Company info */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-4">{t('companySettings')}</h2>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>{t('companyName')}</label>
              <input className={inputCls} value={form.company.name} onChange={e => setCompany('name', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>{cc.companyIdLabel}</label>
              <input className={inputCls} value={form.company.kennitala} onChange={e => setCompany('kennitala', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>{t('address')}</label>
              <input className={inputCls} value={form.company.address} onChange={e => setCompany('address', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('postalCode')}</label>
                <input className={inputCls} value={form.company.postalCode} onChange={e => setCompany('postalCode', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('city')}</label>
                <input className={inputCls} value={form.company.city} onChange={e => setCompany('city', e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelCls}>{t('email')}</label>
              <input type="email" className={inputCls} value={form.company.email} onChange={e => setCompany('email', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>{t('phone')}</label>
              <input className={inputCls} value={form.company.phone} onChange={e => setCompany('phone', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>{t('bankAccount')}</label>
              <input className={inputCls} value={form.company.bankAccount} onChange={e => setCompany('bankAccount', e.target.value)} placeholder="0000-00-000000" />
            </div>
            <div>
              <label className={labelCls}>{cc.vatNumberLabel}</label>
              <input className={inputCls} value={form.company.vskNumber} onChange={e => setCompany('vskNumber', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>{t('auditor')}</label>
              <input className={inputCls} value={form.company.auditor} onChange={e => setCompany('auditor', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {/* App settings */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-800 mb-4">{t('appSettings')}</h2>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{t('language')}</label>
                <select className={inputCls} value={form.language} onChange={e => setTop('language', e.target.value as Language)}>
                  <option value="is">🇮🇸 Íslenska</option>
                  <option value="en">🇬🇧 English</option>
                  <option value="de">🇩🇪 Deutsch</option>
                  <option value="fr">🇫🇷 Français</option>
                  <option value="nl">🇳🇱 Nederlands</option>
                  <option value="no">🇳🇴 Norsk</option>
                  <option value="da">🇩🇰 Dansk</option>
                  <option value="sv">🇸🇪 Svenska</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{t('defaultCurrency')}</label>
                <select className={inputCls} value={form.defaultCurrency} onChange={e => setTop('defaultCurrency', e.target.value as Currency)}>
                  <option value="ISK">ISK — Íslenskar krónur</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="DKK">DKK — Danish Krone</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{t('fiscalYearSetting')}</label>
                <select className={inputCls} value={form.fiscalYear} onChange={e => setTop('fiscalYear', parseInt(e.target.value))}>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>{lang === 'is' ? 'Forskeyti reikningsnúmers' : 'Invoice prefix'}</label>
                <input className={inputCls} value={form.invoicePrefix} onChange={e => setTop('invoicePrefix', e.target.value)} maxLength={4} placeholder="R" />
              </div>
            </div>
          </div>

          {/* Tax & VAT */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-800 mb-1">{lang === 'is' ? 'Skattar & VSK' : 'Tax & VAT'}</h2>
            <p className="text-xs text-gray-500 mb-3">{lang === 'is' ? 'Gildi sett af landi — breyttu ef þörf er á' : 'Set by country — override if needed'}</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{lang === 'is' ? 'VSK-heiti (t.d. VSK, VAT, MwSt)' : 'VAT term (e.g. VAT, MwSt, GST)'}</label>
                  <input className={inputCls} value={form.vatTerm} onChange={e => setTop('vatTerm', e.target.value)} placeholder={cc.vatTerm} />
                </div>
                <div>
                  <label className={labelCls}>{lang === 'is' ? 'Skattyfirvald' : 'Tax authority'}</label>
                  <input className={inputCls} value={form.taxAuthority} onChange={e => setTop('taxAuthority', e.target.value)} placeholder={cc.taxAuthority} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{lang === 'is' ? 'Heiti fyrirtækjaauðkennis' : 'Company ID label'}</label>
                  <input className={inputCls} value={form.companyIdLabel} onChange={e => setTop('companyIdLabel', e.target.value)} placeholder={cc.companyIdLabel} />
                </div>
                <div>
                  <label className={labelCls}>{lang === 'is' ? 'Heiti VSK-númer' : 'VAT number label'}</label>
                  <input className={inputCls} value={form.vatNumberLabel} onChange={e => setTop('vatNumberLabel', e.target.value)} placeholder={cc.vatNumberLabel} />
                </div>
              </div>
              <div>
                <label className={labelCls}>{lang === 'is' ? 'VSK-hlutföll (%) — aðskilin með kommu' : 'VAT rates (%) — comma separated'}</label>
                <input className={inputCls}
                  value={form.vatRates.join(', ')}
                  onChange={e => {
                    const rates = e.target.value.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
                    setTop('vatRates', rates);
                  }}
                  placeholder={cc.vatRates.join(', ')} />
                <p className="text-xs text-gray-400 mt-1">{lang === 'is' ? 'Dæmi: 24, 11, 0' : 'Example: 20, 5, 0'}</p>
              </div>
              <div>
                <label className={labelCls}>{lang === 'is' ? 'Staðlað VSK-hlutfall (%)' : 'Standard VAT rate (%)'}</label>
                <select className={inputCls} value={form.standardRate}
                  onChange={e => setTop('standardRate', parseFloat(e.target.value))}>
                  {(form.vatRates.length ? form.vatRates : cc.vatRates).map(r => (
                    <option key={r} value={r}>{r}%</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{lang === 'is' ? 'Tekjuskattur fyrirtækja (%)' : 'Corporate income tax (%)'}</label>
                <input type="number" className={inputCls} value={form.corporateTaxRate}
                  onChange={e => setTop('corporateTaxRate', parseFloat(e.target.value) || 0)} min={0} max={100} step="0.01" />
                <p className="text-xs text-gray-400 mt-1">{lang === 'is' ? 'Notað í ársreikningi og rekstrarniðurstöðu' : 'Used in annual accounts and profit/loss'}</p>
              </div>
            </div>
          </div>

          {/* Exchange rates */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-800 mb-1">{lang === 'is' ? 'Gengi gjaldeyrils (á móti ISK)' : 'Exchange rates (vs ISK)'}</h2>
            <p className="text-xs text-gray-500 mb-3">{lang === 'is' ? 'Sjálfgefið gengi til notkunar á nýjum færslum' : 'Default rates used for new transactions'}</p>
            <div className="grid grid-cols-2 gap-3">
              {(['EUR', 'USD', 'GBP', 'DKK', 'NOK', 'SEK', 'AUD', 'CAD', 'NZD'] as const).map(cur => (
                <div key={cur}>
                  <label className={labelCls}>1 {cur} = ISK</label>
                  <input type="number" className={inputCls} value={form.exchangeRates[cur]}
                    onChange={e => setRate(cur, parseFloat(e.target.value) || 1)} min={1} step="0.01" />
                </div>
              ))}
            </div>
          </div>

          {/* Payroll rates */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-800 mb-1">{lang === 'is' ? 'Launaútreikningur' : 'Payroll rates'}</h2>
            <p className="text-xs text-gray-500 mb-3">{lang === 'is' ? 'Hlutföll samkvæmt íslenskum lögum' : 'Rates per Icelandic law'}</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{lang === 'is' ? 'Staðgreiðsla (%)' : 'Tax withholding (%)'}</label>
                  <input type="number" className={inputCls} value={form.taxWithholdingRate}
                    onChange={e => setTop('taxWithholdingRate', parseFloat(e.target.value) || 0)} min={0} max={100} step="0.01" />
                </div>
                <div>
                  <label className={labelCls}>{lang === 'is' ? 'Persónuafsláttur (ISK/mán.)' : 'Personal deduction (ISK/mo.)'}</label>
                  <input type="number" className={inputCls} value={form.personalDeductionMonthly}
                    onChange={e => setTop('personalDeductionMonthly', parseInt(e.target.value) || 0)} min={0} step={100} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>{lang === 'is' ? 'Lífeyrir starfsm. (%)' : 'Employee pension (%)'}</label>
                  <input type="number" className={inputCls} value={form.employeePensionRate}
                    onChange={e => setTop('employeePensionRate', parseFloat(e.target.value) || 0)} min={0} max={20} step="0.1" />
                </div>
                <div>
                  <label className={labelCls}>{lang === 'is' ? 'Lífeyrir atvinnur. (%)' : 'Employer pension (%)'}</label>
                  <input type="number" className={inputCls} value={form.employerPensionRate}
                    onChange={e => setTop('employerPensionRate', parseFloat(e.target.value) || 0)} min={0} max={20} step="0.1" />
                </div>
                <div>
                  <label className={labelCls}>{lang === 'is' ? 'Tryggingagjald (%)' : 'Social insurance (%)'}</label>
                  <input type="number" className={inputCls} value={form.socialInsuranceRate}
                    onChange={e => setTop('socialInsuranceRate', parseFloat(e.target.value) || 0)} min={0} max={20} step="0.01" />
                </div>
              </div>
            </div>
          </div>

          {/* Backup & Restore */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-800 mb-1">{lang === 'is' ? 'Öryggisafrit og endurheimting' : 'Backup & Restore'}</h2>
            <p className="text-xs text-gray-500 mb-3">
              {lang === 'is'
                ? 'Sæktu JSON-afrit af öllum gögnum eða endurheimtu frá fyrra afriti'
                : 'Download a JSON backup of all data or restore from a previous backup'}
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={exportBackup}
                className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
                <Download className="w-4 h-4" />
                {lang === 'is' ? 'Sækja öryggisafrit (.json)' : 'Download backup (.json)'}
              </button>
              <label className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 cursor-pointer">
                <Upload className="w-4 h-4" />
                {lang === 'is' ? 'Endurheimta afrit' : 'Restore backup'}
                <input ref={restoreRef} type="file" accept=".json" className="sr-only" onChange={handleRestore} />
              </label>
            </div>
            {restoreError && (
              <div className="mt-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{restoreError}
              </div>
            )}
            {restoreOk && (
              <div className="mt-2 flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {lang === 'is' ? 'Gögn endurheimtt!' : 'Data restored successfully!'}
              </div>
            )}
          </div>

          {/* AI */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-800 mb-1 flex items-center gap-2">
              <span>🤖</span> {lang === 'is' ? 'AI Aðstoðarmaður (Anthropic)' : 'AI Assistant (Anthropic)'}
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              {lang === 'is'
                ? 'Fáðu API lykil á console.anthropic.com — greiddu aðeins fyrir notkun.'
                : 'Get your API key at console.anthropic.com — pay only for usage.'}
            </p>
            <div>
              <label className={labelCls}>Anthropic API Key</label>
              <input type="password" className={inputCls} value={form.anthropicKey}
                onChange={e => setTop('anthropicKey', e.target.value)}
                placeholder="sk-ant-api03-..." />
            </div>
          </div>

          {/* Cloud Sync */}
          <CloudSyncSection
            lang={lang}
            url={form.supabaseUrl}
            apiKey={form.supabaseKey}
            userKey={form.supabaseUserKey}
            setUrl={v => setTop('supabaseUrl', v)}
            setApiKey={v => setTop('supabaseKey', v)}
            setUserKey={v => setTop('supabaseUserKey', v)}
            onSave={handleSave}
            syncStatus={syncStatus}
            lastSyncedAt={lastSyncedAt}
            syncNow={syncNow}
            dispatch={dispatch}
          />

          {/* About */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-blue-800 mb-1">{lang === 'is' ? 'Um þetta forrit' : 'About this app'}</h3>
            <p className="text-xs text-blue-700 leading-relaxed mb-3">
              {lang === 'is'
                ? 'Bókhalds-forrit í samræmi við íslensk lög, þar með lög nr. 3/2006 um ársreikninga. VSK-hlutföll: 24% (almennt) og 11% (fæði, bækur o.fl.). Gögn eru geymd í vafrageymslu (localStorage).'
                : 'Accounting app compliant with Icelandic law, including Act No. 3/2006 on Annual Accounts. VAT rates: 24% (standard) and 11% (food, books, etc.). Data is stored in browser storage (localStorage).'}
            </p>
            <div className="flex flex-wrap gap-3 text-xs">
              <a href="https://jobboks.app/privacy.html" target="_blank" rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2">
                {lang === 'is' ? 'Persónuverndarstefna' : 'Privacy Policy'}
              </a>
              <span className="text-blue-300">·</span>
              <a href="https://jobboks.app/terms.html" target="_blank" rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2">
                {lang === 'is' ? 'Notkunarskilmálar' : 'Terms of Service'}
              </a>
              <span className="text-blue-300">·</span>
              <a href="mailto:hello@jobboks.app"
                className="text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2">
                hello@jobboks.app
              </a>
            </div>
            <p className="text-[10px] text-blue-500 mt-2">Jobboks v1.0 · © 2026</p>
          </div>

          {/* Data maintenance */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              {lang === 'is' ? 'Gögn' : 'Data'}
            </h3>
            <div>
              <p className="text-xs text-slate-600 mb-2">
                {lang === 'is'
                  ? 'Byrja upp á nýtt: hreinsar ALLT annað (reikninga, verk, birgðir, laun o.fl.) en heldur innfluttu bankafærslunum þínum.'
                  : 'Start fresh: clears EVERYTHING else (invoices, jobs, stock, payroll, etc.) but keeps your imported bank transactions.'}
              </p>
              <button
                onClick={() => {
                  const kept = (data.transactions ?? []).filter(x => !x.id.includes('_demo_'));
                  const msg = lang === 'is'
                    ? `Þetta eyðir öllu nema ${kept.length} bankafærslum. Ekki hægt að afturkalla. Halda áfram?`
                    : `This deletes everything except your ${kept.length} bank transactions. This cannot be undone. Continue?`;
                  if (!window.confirm(msg)) return;
                  dispatch({ type: 'LOAD', payload: {
                    ...data,
                    settings: form,
                    transactions: kept,
                    invoices: [],
                    jobs: [],
                    timeEntries: [],
                    jobMaterials: [],
                    jobPhotos: [],
                    stockItems: [],
                    stockMovements: [],
                    payrollEntries: [],
                    tasks: [],
                    budgetLines: [],
                    suppliers: [],
                    recurringTransactions: [],
                    employees: [],
                    balanceSheetItems: [],
                  }});
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition">
                <AlertCircle className="w-3.5 h-3.5" />
                {lang === 'is' ? 'Byrja upp á nýtt (halda innflutningi)' : 'Start fresh (keep import)'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button onClick={handleSave}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700">
          {saved && <CheckCircle className="w-4 h-4" />}
          {saved ? t('settingsSaved') : t('saveSettings')}
        </button>
      </div>
    </div>
  );
}
