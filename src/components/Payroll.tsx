import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, X, Users, Download, FileText, FileSpreadsheet, UserCog, Clock, Wallet } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { PayrollEntry, Employee } from '../types';
import { exportPDF, exportExcel } from '../utils/exports';
import { isIntlPayroll, calcIntlPayroll } from '../utils/payrollIntl';
import { isPayrollLimitReached } from '../utils/planLimits';
import PlanLimitModal from './PlanLimitModal';

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function newId() { return `pay_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }
function newEmpId() { return `emp_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }

function EmployeeModal({ initial, onSave, onClose }: {
  initial?: Employee; onSave: (e: Employee) => void; onClose: () => void;
}) {
  const { t, lang, data } = useApp();
  const country = data.settings.country;
  const intl = isIntlPayroll(country); // US / Canada use FICA / CPP-EI, not persónuafsláttur
  const [name, setName] = useState(initial?.name ?? '');
  const [kennitala, setKennitala] = useState(initial?.kennitala ?? '');
  const [monthlySalary, setMonthlySalary] = useState(initial?.monthlySalary ?? 0);
  const [hourlyRate, setHourlyRate] = useState(initial?.hourlyRate ?? 0);
  // Persónuafsláttur only applies once the employer registers the employee's tax
  // card (skattkort). Default 0 → no card registered yet = full withholding, the
  // legally safe side; the employer sets the % from the card when the worker starts.
  const [allowancePct, setAllowancePct] = useState(initial?.personalAllowancePct ?? 0);
  // US/CA: the employee's income-tax withholding % from their W-4 / TD1.
  const [incomeTaxPct, setIncomeTaxPct] = useState(initial?.incomeTaxPct ?? 0);
  const [secondaryTaxPct, setSecondaryTaxPct] = useState(initial?.secondaryTaxPct ?? 0);
  const [payFrequency, setPayFrequency] = useState<'monthly' | 'weekly'>(initial?.payFrequency ?? 'monthly');
  const [active, setActive] = useState(initial?.active ?? true);
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';
  const ktLabel = t('kennitala');

  function handleSave() {
    onSave({
      id: initial?.id ?? newEmpId(), name, kennitala: kennitala || undefined,
      monthlySalary, hourlyRate, personalAllowancePct: allowancePct,
      incomeTaxPct, secondaryTaxPct, payFrequency,
      active, notes: notes || undefined,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50">
      <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl shadow-xl p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">
            {initial ? (lang === 'is' ? 'Breyta starfsmanni' : 'Edit employee') : (lang === 'is' ? 'Nýr starfsmaður' : 'New employee')}
          </h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className={lbl}>{lang === 'is' ? 'Nafn starfsmanns' : 'Employee name'}</label>
            <input className={inp} value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <label className={lbl}>{ktLabel}</label>
            <input className={inp} value={kennitala} onChange={e => setKennitala(e.target.value)} placeholder="000000-0000" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>{lang === 'is' ? 'Mánaðarlaun (ISK)' : 'Monthly salary (ISK)'}</label>
              <input type="number" className={inp} value={monthlySalary || ''} onChange={e => setMonthlySalary(parseInt(e.target.value) || 0)} min={0} step={1000} />
            </div>
            <div>
              <label className={lbl}>{lang === 'is' ? 'Tímakaup (ISK)' : 'Hourly rate (ISK)'}</label>
              <input type="number" className={inp} value={hourlyRate || ''} onChange={e => setHourlyRate(parseInt(e.target.value) || 0)} min={0} step={50} />
            </div>
          </div>
          {intl ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>{country === 'CA' ? 'Federal tax %' : 'Federal income tax %'}</label>
                <input type="number" className={inp} value={incomeTaxPct} onChange={e => setIncomeTaxPct(Math.max(0, Math.min(60, parseFloat(e.target.value) || 0)))} min={0} max={60} step="0.5" />
                <p className="text-[11px] text-gray-400 mt-1">{country === 'CA' ? "From the worker's TD1 / paystub." : "From the worker's W-4 / paystub."}</p>
              </div>
              <div>
                <label className={lbl}>{country === 'CA' ? 'Provincial tax %' : 'State income tax %'}</label>
                <input type="number" className={inp} value={secondaryTaxPct} onChange={e => setSecondaryTaxPct(Math.max(0, Math.min(30, parseFloat(e.target.value) || 0)))} min={0} max={30} step="0.5" />
                <p className="text-[11px] text-gray-400 mt-1">{country === 'CA' ? 'Provincial rate (0 if none).' : 'State rate (0 if the state has no income tax).'}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>{lang === 'is' ? 'Skattkort — persónuafsláttur (%)' : 'Tax card — personal credit (%)'}</label>
                <input type="number" className={inp} value={allowancePct} onChange={e => setAllowancePct(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))} min={0} max={100} step={1} />
                <p className="text-[11px] text-gray-400 mt-1">{lang === 'is' ? 'Skráðu skattkort starfsmanns: 100% fullt, 0% ef ekkert skattkort (t.d. nýtt á lífeyri).' : "Register the employee's tax card: 100% full, 0% if none (e.g. used on a pension)."}</p>
              </div>
              <div>
                <label className={lbl}>{lang === 'is' ? 'Greiðslutíðni' : 'Pay frequency'}</label>
                <select className={inp} value={payFrequency} onChange={e => setPayFrequency(e.target.value as 'monthly' | 'weekly')}>
                  <option value="monthly">{lang === 'is' ? 'Mánaðarlega' : 'Monthly'}</option>
                  <option value="weekly">{lang === 'is' ? 'Vikulega' : 'Weekly'}</option>
                </select>
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="w-4 h-4" />
            {lang === 'is' ? 'Virkur starfsmaður' : 'Active employee'}
          </label>
          <div>
            <label className={lbl}>{t('notes')}</label>
            <input className={inp} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm">{t('cancel')}</button>
            <button onClick={handleSave} disabled={!name}
              className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm disabled:opacity-40">{t('save')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function calcPayroll(gross: number, settings: { taxWithholdingRate: number; employeePensionRate: number; employerPensionRate: number; socialInsuranceRate: number; personalDeductionMonthly: number }, allowanceOverride?: number) {
  // Persónuafsláttur actually applied this period (per-employee %, prorated for weekly pay).
  const allowance = allowanceOverride ?? settings.personalDeductionMonthly;
  const employeePension = Math.round(gross * settings.employeePensionRate / 100);
  const taxBase = Math.max(0, gross - employeePension - allowance);
  const taxWithheld = Math.round(taxBase * settings.taxWithholdingRate / 100);
  const netWage = gross - employeePension - taxWithheld;
  const employerPension = Math.round(gross * settings.employerPensionRate / 100);
  const socialInsurance = Math.round(gross * settings.socialInsuranceRate / 100);
  return { employeePension, taxWithheld, netWage, employerPension, socialInsurance, allowance };
}

const thisMonth = () => new Date().toISOString().slice(0, 7);

function PayrollModal({ initial, onSave, onClose }: {
  initial?: PayrollEntry; onSave: (p: PayrollEntry) => void; onClose: () => void;
}) {
  const { t, lang, data, fmt } = useApp();
  const s = data.settings;
  const activeEmployees = (data.employees ?? []).filter(e => e.active || e.id === initial?.employeeId);
  const [employeeId, setEmployeeId] = useState<string>(initial?.employeeId ?? '');
  const [month, setMonth] = useState(initial?.month ?? thisMonth());
  const [name, setName] = useState(initial?.employeeName ?? '');
  const [kennitala, setKennitala] = useState(initial?.employeeKennitala ?? '');
  const [gross, setGross] = useState(initial?.grossWage ?? 0);
  const [hours, setHours] = useState(0);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [overrideTax, setOverrideTax] = useState<number | null>(initial ? initial.taxWithheld : null);

  function selectEmployee(id: string) {
    setEmployeeId(id);
    const emp = activeEmployees.find(e => e.id === id);
    if (emp) {
      setName(emp.name);
      setKennitala(emp.kennitala ?? '');
      if (emp.monthlySalary > 0) { setGross(emp.monthlySalary); setHours(0); }
    }
  }
  const selectedEmp = activeEmployees.find(e => e.id === employeeId);
  function applyHours(h: number) {
    setHours(h);
    if (selectedEmp && selectedEmp.hourlyRate > 0) setGross(Math.round(h * selectedEmp.hourlyRate));
  }

  // Persónuafsláttur for THIS pay period: the employee's chosen % of the monthly
  // allowance, prorated to a week when they're paid weekly.
  const allowance = useMemo(() => {
    const pct = selectedEmp?.personalAllowancePct ?? 100;
    const weekly = (selectedEmp?.payFrequency ?? 'monthly') === 'weekly';
    return Math.round(s.personalDeductionMonthly * (pct / 100) * (weekly ? 12 / 52 : 1));
  }, [selectedEmp, s.personalDeductionMonthly]);
  const calc = useMemo(() => calcPayroll(gross, s, allowance), [gross, s, allowance]);
  const taxWithheld = overrideTax !== null ? overrideTax : calc.taxWithheld;
  const netWage = gross - calc.employeePension - taxWithheld;

  // US / Canada use a completely different statutory model (FICA / CPP-EI +
  // per-employee income-tax %). Computed here; Iceland keeps calc above.
  const country = s.country;
  const intl = isIntlPayroll(country);
  const intlRes = useMemo(
    () => intl ? calcIntlPayroll(country, gross, selectedEmp?.incomeTaxPct ?? 0, selectedEmp?.secondaryTaxPct ?? 0) : null,
    [intl, country, gross, selectedEmp]);
  const isIncomeTaxLine = (k: string) => k === 'federal' || k === 'secondary';

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';

  function handleSave() {
    const entry: PayrollEntry = intlRes ? {
      // US/CA: statutory (SS+Medicare / CPP+EI) → employeePension; income tax → taxWithheld;
      // employer statutory → employerPension. Totals reconcile; breakdown recomputes on edit.
      id: initial?.id ?? newId(), month, employeeId: employeeId || undefined,
      employeeName: name, employeeKennitala: kennitala || undefined,
      grossWage: gross,
      employeePension: intlRes.employee.filter(l => !isIncomeTaxLine(l.key)).reduce((a, l) => a + l.amount, 0),
      taxWithheld: intlRes.employee.filter(l => isIncomeTaxLine(l.key)).reduce((a, l) => a + l.amount, 0),
      employerPension: intlRes.employer.reduce((a, l) => a + l.amount, 0),
      socialInsurance: 0,
      netWage: intlRes.net, notes: notes || undefined,
    } : {
      id: initial?.id ?? newId(), month, employeeId: employeeId || undefined,
      employeeName: name, employeeKennitala: kennitala || undefined,
      grossWage: gross, employeePension: calc.employeePension, taxWithheld,
      employerPension: calc.employerPension, socialInsurance: calc.socialInsurance,
      netWage, notes: notes || undefined,
    };
    onSave(entry);
  }

  const row = (label: string, amount: number, cls = 'text-gray-700') => (
    <div className="flex justify-between text-xs py-1 border-b border-gray-50">
      <span className="text-gray-600">{label}</span>
      <span className={`font-mono font-medium ${cls}`}>{fmt(amount)}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50">
      <div className="bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl shadow-xl p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{initial ? t('editPayroll') : t('addPayroll')}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          {activeEmployees.length > 0 && (
            <div>
              <label className={lbl}>{lang === 'is' ? 'Starfsmaður' : 'Employee'}</label>
              <select className={inp} value={employeeId} onChange={e => selectEmployee(e.target.value)}>
                <option value="">{lang === 'is' ? '— Slá inn handvirkt —' : '— Enter manually —'}</option>
                {activeEmployees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>{lang === 'is' ? 'Mánuður' : 'Month'}</label>
              <input type="month" className={inp} value={month} onChange={e => setMonth(e.target.value)} />
            </div>
            <div>
              <label className={lbl}>{t('kennitala')}</label>
              <input className={inp} value={kennitala} onChange={e => setKennitala(e.target.value)} placeholder="000000-0000" />
            </div>
          </div>
          <div>
            <label className={lbl}>{lang === 'is' ? 'Nafn starfsmanns' : 'Employee name'}</label>
            <input className={inp} value={name} onChange={e => setName(e.target.value)} required />
          </div>
          {selectedEmp && selectedEmp.hourlyRate > 0 && (
            <div>
              <label className={lbl}>{lang === 'is' ? `Tímar × ${fmt(selectedEmp.hourlyRate)}/klst` : `Hours × ${fmt(selectedEmp.hourlyRate)}/hr`}</label>
              <input type="number" className={inp} value={hours || ''} onChange={e => applyHours(parseFloat(e.target.value) || 0)} min={0} step={0.5}
                placeholder={lang === 'is' ? 'Fjöldi tíma' : 'Number of hours'} />
            </div>
          )}
          <div>
            <label className={lbl}>{lang === 'is' ? 'Brúttólaun (ISK)' : 'Gross wage (ISK)'}</label>
            <input type="number" className={inp} value={gross || ''} onChange={e => { setGross(parseInt(e.target.value) || 0); }} min={0} step={1000} />
          </div>

          {gross > 0 && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-0.5">
              <p className="text-xs font-bold text-gray-700 mb-2">{lang === 'is' ? 'Útreikningur' : 'Calculation'}</p>
              {intlRes ? (
                <>
                  {row(lang === 'is' ? 'Brúttólaun' : 'Gross wage', gross)}
                  {intlRes.employee.map(l => row(`${l.label} (${l.rate}%)`, -l.amount, 'text-red-600'))}
                  <div className="flex justify-between text-sm font-bold pt-1.5">
                    <span className="text-gray-700">{lang === 'is' ? 'Nettólaun' : 'Net pay'}</span>
                    <span className="font-mono text-green-700">{fmt(intlRes.net)}</span>
                  </div>
                  <div className="border-t border-gray-200 mt-2 pt-2 space-y-0.5">
                    <p className="text-xs font-semibold text-gray-500 mb-1">{lang === 'is' ? 'Kostnaður atvinnurekanda' : 'Employer costs'}</p>
                    {intlRes.employer.map(l => row(`${l.label} (${l.rate}%)`, l.amount, 'text-red-600'))}
                    <div className="flex justify-between text-xs font-bold pt-1">
                      <span>{lang === 'is' ? 'Heildarkostnaður' : 'Total employer cost'}</span>
                      <span className="font-mono">{fmt(intlRes.employerTotal)}</span>
                    </div>
                  </div>
                  {!selectedEmp && (
                    <p className="text-[11px] text-amber-600 mt-1">{country === 'CA' ? 'Pick an employee to apply their federal/provincial tax %.' : 'Pick an employee to apply their federal/state tax %.'}</p>
                  )}
                </>
              ) : (
                <>
              {row(lang === 'is' ? 'Brúttólaun' : 'Gross wage', gross)}
              {row(lang === 'is' ? `Lífeyrir starfsmanns (${s.employeePensionRate}%)` : `Employee pension (${s.employeePensionRate}%)`, -calc.employeePension, 'text-red-600')}
              <div className="flex justify-between text-xs py-1 border-b border-gray-50 items-center">
                <span className="text-gray-600">{lang === 'is' ? `Staðgreiðsla (${s.taxWithholdingRate}%)` : `Tax withheld (${s.taxWithholdingRate}%)`}</span>
                <div className="flex items-center gap-2">
                  <input type="number" className="w-24 border border-gray-300 rounded px-2 py-0.5 text-xs text-right font-mono"
                    value={overrideTax !== null ? overrideTax : calc.taxWithheld}
                    onChange={e => setOverrideTax(parseInt(e.target.value) || 0)} />
                  {overrideTax !== null && (
                    <button onClick={() => setOverrideTax(null)} className="text-blue-600 text-xs">{lang === 'is' ? 'Endurstilla' : 'Reset'}</button>
                  )}
                </div>
              </div>
              <div className="flex justify-between text-[11px] text-gray-400 pb-1">
                <span>{lang === 'is' ? 'Persónuafsláttur nýttur' : 'Personal tax credit applied'}{(selectedEmp?.payFrequency ?? 'monthly') === 'weekly' ? (lang === 'is' ? ' (vika)' : ' (weekly)') : ''}</span>
                <span className="font-mono">{fmt(calc.allowance)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-1.5">
                <span className="text-gray-700">{lang === 'is' ? 'Nettólaun' : 'Net wage'}</span>
                <span className="font-mono text-green-700">{fmt(netWage)}</span>
              </div>
              <div className="border-t border-gray-200 mt-2 pt-2 space-y-0.5">
                <p className="text-xs font-semibold text-gray-500 mb-1">{lang === 'is' ? 'Kostnaður atvinnurekanda' : 'Employer costs'}</p>
                {row(lang === 'is' ? `Lífeyrir atvinnurekanda (${s.employerPensionRate}%)` : `Employer pension (${s.employerPensionRate}%)`, calc.employerPension, 'text-red-600')}
                {row(lang === 'is' ? `Tryggingagjald (${s.socialInsuranceRate}%)` : `Social insurance (${s.socialInsuranceRate}%)`, calc.socialInsurance, 'text-red-600')}
                <div className="flex justify-between text-xs font-bold pt-1">
                  <span>{lang === 'is' ? 'Heildarkostnaður' : 'Total employer cost'}</span>
                  <span className="font-mono">{fmt(gross + calc.employerPension + calc.socialInsurance)}</span>
                </div>
              </div>
                </>
              )}
            </div>
          )}

          <div>
            <label className={lbl}>{t('notes')}</label>
            <input className={inp} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm">{t('cancel')}</button>
            <button onClick={handleSave} disabled={!name || gross <= 0}
              className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm disabled:opacity-40">{t('save')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Payroll() {
  const { data, dispatch, t, lang, fmt: fmtCur } = useApp();
  const [tab, setTab] = useState<'runs' | 'employees'>('runs');
  const [modal, setModal] = useState<{ open: boolean; entry?: PayrollEntry }>({ open: false });
  const [empModal, setEmpModal] = useState<{ open: boolean; employee?: Employee }>({ open: false });
  const [limitModal, setLimitModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteEmpId, setDeleteEmpId] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState(thisMonth());

  const employees = data.employees ?? [];

  function handleSaveEmployee(emp: Employee) {
    dispatch(employees.find(e => e.id === emp.id)
      ? { type: 'UPDATE_EMPLOYEE', payload: emp }
      : { type: 'ADD_EMPLOYEE', payload: emp });
    setEmpModal({ open: false });
  }

  function openAddPayroll() {
    if (isPayrollLimitReached(data)) { setLimitModal(true); return; }
    setModal({ open: true });
  }

  function handleSave(entry: PayrollEntry) {
    dispatch(data.payrollEntries.find(p => p.id === entry.id)
      ? { type: 'UPDATE_PAYROLL', payload: entry }
      : { type: 'ADD_PAYROLL', payload: entry });
    setModal({ open: false });
  }

  const payCols = [
    { header: lang === 'is' ? 'Nafn' : 'Name',                             key: 'name',     width: 22 },
    { header: lang === 'is' ? 'Kennitala' : 'Kennitala',                   key: 'kt',       width: 14 },
    { header: lang === 'is' ? 'Brúttólaun' : 'Gross wage',                 key: 'gross',    width: 14 },
    { header: lang === 'is' ? 'Lífeyrir (starfsm.)' : 'Employee pension',  key: 'empPens',  width: 16 },
    { header: lang === 'is' ? 'Staðgreiðsla' : 'Tax withheld',             key: 'tax',      width: 14 },
    { header: lang === 'is' ? 'Nettólaun' : 'Net wage',                    key: 'net',      width: 14 },
    { header: lang === 'is' ? 'Lífeyrir (atvinnur.)' : 'Employer pension', key: 'emplrPens',width: 16 },
    { header: lang === 'is' ? 'Tryggingagjald' : 'Social ins.',            key: 'social',   width: 14 },
    { header: lang === 'is' ? 'Heildarkostnaður' : 'Total cost',           key: 'total',    width: 16 },
  ];
  function getPayRows() {
    return filtered.map(p => ({
      name: p.employeeName, kt: p.employeeKennitala ?? '',
      gross: p.grossWage, empPens: p.employeePension, tax: p.taxWithheld, net: p.netWage,
      emplrPens: p.employerPension, social: p.socialInsurance,
      total: p.grossWage + p.employerPension + p.socialInsurance,
    }));
  }

  function exportToPDF() {
    exportPDF(
      `${lang === 'is' ? 'Launaskrá' : 'Payroll'} — ${filterMonth}`,
      data.settings.company.name || '',
      payCols, getPayRows(),
      `laun_${filterMonth}.pdf`,
    );
  }
  function exportToExcel() {
    exportExcel([{ name: lang === 'is' ? 'Launaskrá' : 'Payroll', columns: payCols, rows: getPayRows() }],
      `laun_${filterMonth}.xlsx`);
  }

  function exportCSV() {
    const header = lang === 'is'
      ? ['Mánuður','Nafn','Kennitala','Brúttólaun','Lífeyrir (starfsm.)','Staðgreiðsla','Nettólaun','Lífeyrir (atvinnur.)','Tryggingagjald','Heildarkostnaður','Athugasemd']
      : ['Month','Name','Kennitala','Gross wage','Employee pension','Tax withheld','Net wage','Employer pension','Social insurance','Total employer cost','Notes'];
    const rows = filtered.map(p => [
      p.month, p.employeeName, p.employeeKennitala ?? '',
      String(p.grossWage), String(p.employeePension), String(p.taxWithheld), String(p.netWage),
      String(p.employerPension), String(p.socialInsurance),
      String(p.grossWage + p.employerPension + p.socialInsurance),
      p.notes ?? '',
    ]);
    downloadCSV(`laun_${filterMonth}.csv`, [header, ...rows]);
  }

  const months = useMemo(() => {
    const ms = new Set(data.payrollEntries.map(p => p.month));
    ms.add(thisMonth());
    return Array.from(ms).sort((a, b) => b.localeCompare(a));
  }, [data.payrollEntries]);

  const filtered = data.payrollEntries.filter(p => p.month === filterMonth)
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  const totals = useMemo(() => filtered.reduce((acc, p) => ({
    gross: acc.gross + p.grossWage,
    net: acc.net + p.netWage,
    tax: acc.tax + p.taxWithheld,
    empPension: acc.empPension + p.employeePension,
    emplrPension: acc.emplrPension + p.employerPension,
    social: acc.social + p.socialInsurance,
  }), { gross: 0, net: 0, tax: 0, empPension: 0, emplrPension: 0, social: 0 }), [filtered]);

  const fmt = (n: number) => fmtCur(n);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('payroll')}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{lang === 'is' ? 'Launaútreikningur með íslenskum skattareglum' : 'Payroll with Icelandic tax rules'}</p>
        </div>
        <div className="flex gap-2">
          {tab === 'runs' && filtered.length > 0 && (<>
            <button onClick={exportToPDF}
              className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              <FileText className="w-4 h-4" /><span className="hidden sm:inline">PDF</span>
            </button>
            <button onClick={exportToExcel}
              className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              <FileSpreadsheet className="w-4 h-4" /><span className="hidden sm:inline">Excel</span>
            </button>
            <button onClick={exportCSV}
              className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
              <Download className="w-4 h-4" /><span className="hidden sm:inline">CSV</span>
            </button>
          </>)}
          {tab === 'runs' ? (
            <button onClick={openAddPayroll}
              className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium">
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">{t('addPayroll')}</span>
            </button>
          ) : (
            <button onClick={() => setEmpModal({ open: true })}
              className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium">
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">{lang === 'is' ? 'Nýr starfsmaður' : 'New employee'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setTab('runs')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium ${tab === 'runs' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
          <Wallet className="w-4 h-4" />{lang === 'is' ? 'Launakeyrslur' : 'Payroll runs'}
        </button>
        <button onClick={() => setTab('employees')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium ${tab === 'employees' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
          <UserCog className="w-4 h-4" />{lang === 'is' ? 'Starfsmenn' : 'Employees'}
        </button>
      </div>

      {tab === 'employees' ? (
        <div>
          <p className="text-xs text-gray-500 mb-3 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {lang === 'is'
              ? 'Trúnaðarupplýsingar — umsamin laun hvers starfsmanns (mánaðarlaun og tímakaup).'
              : 'Sensitive — each employee’s agreed pay (monthly salary and hourly rate).'}
          </p>
          {employees.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">
              <UserCog className="w-8 h-8 mx-auto mb-2 opacity-40" />
              {lang === 'is' ? 'Engir starfsmenn skráðir' : 'No employees registered yet'}
            </div>
          ) : (
            <div className="space-y-2">
              {[...employees].sort((a, b) => a.name.localeCompare(b.name)).map(emp => (
                <div key={emp.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-800 flex items-center gap-2">
                        {emp.name}
                        {!emp.active && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{lang === 'is' ? 'Óvirkur' : 'Inactive'}</span>}
                      </p>
                      {emp.kennitala && <p className="text-xs text-gray-400">{emp.kennitala}</p>}
                      {emp.notes && <p className="text-xs text-gray-500 mt-0.5 italic">{emp.notes}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setEmpModal({ open: true, employee: emp })}
                        className="text-gray-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteEmpId(emp.id)}
                        className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-50 text-xs">
                    <div><span className="text-gray-500">{lang === 'is' ? 'Mánaðarlaun' : 'Monthly salary'}</span><div className="font-semibold font-mono">{emp.monthlySalary > 0 ? fmt(emp.monthlySalary) : '—'}</div></div>
                    <div><span className="text-gray-500">{lang === 'is' ? 'Tímakaup' : 'Hourly rate'}</span><div className="font-semibold font-mono">{emp.hourlyRate > 0 ? fmt(emp.hourlyRate) : '—'}</div></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (<>
      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 flex items-center gap-3">
        <label className="text-xs font-medium text-gray-600">{lang === 'is' ? 'Mánuður' : 'Month'}:</label>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
          {lang === 'is' ? 'Engar launafærslur fyrir þennan mánuð' : 'No payroll entries for this month'}
        </div>
      ) : (
        <>
          <div className="space-y-2 mb-4">
            {filtered.map(p => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-800">{p.employeeName}</p>
                    {p.employeeKennitala && <p className="text-xs text-gray-400">{p.employeeKennitala}</p>}
                    {p.notes && <p className="text-xs text-gray-500 mt-0.5 italic">{p.notes}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setModal({ open: true, entry: p })}
                      className="text-gray-400 hover:text-blue-600 p-1.5 rounded-lg hover:bg-blue-50">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleteId(p.id)}
                      className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-50 text-xs">
                  <div><span className="text-gray-500">{lang === 'is' ? 'Brúttó' : 'Gross'}</span><div className="font-semibold font-mono">{fmt(p.grossWage)}</div></div>
                  <div><span className="text-gray-500">{lang === 'is' ? 'Staðgreiðsla' : 'Tax'}</span><div className="font-semibold font-mono text-red-600">-{fmt(p.taxWithheld)}</div></div>
                  <div><span className="text-gray-500">{lang === 'is' ? 'Nettó' : 'Net'}</span><div className="font-semibold font-mono text-green-700">{fmt(p.netWage)}</div></div>
                  <div><span className="text-gray-500">{lang === 'is' ? 'Lífeyrir (starfsm.)' : 'Pension (empl.)'}</span><div className="font-mono">-{fmt(p.employeePension)}</div></div>
                  <div><span className="text-gray-500">{lang === 'is' ? 'Lífeyrir (atvinnur.)' : 'Pension (emplr.)'}</span><div className="font-mono">{fmt(p.employerPension)}</div></div>
                  <div><span className="text-gray-500">{lang === 'is' ? 'Tryggingagjald' : 'Social ins.'}</span><div className="font-mono">{fmt(p.socialInsurance)}</div></div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="text-sm font-bold text-blue-900 mb-3">{lang === 'is' ? 'Samtals' : 'Totals'} — {filterMonth}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div><div className="text-xs text-blue-700">{lang === 'is' ? 'Heildarbr.' : 'Total gross'}</div><div className="font-bold font-mono">{fmt(totals.gross)}</div></div>
              <div><div className="text-xs text-blue-700">{lang === 'is' ? 'Nettólaun' : 'Net wages'}</div><div className="font-bold font-mono text-green-700">{fmt(totals.net)}</div></div>
              <div><div className="text-xs text-blue-700">{lang === 'is' ? 'Staðgreiðsla' : 'Tax withheld'}</div><div className="font-bold font-mono text-red-600">{fmt(totals.tax)}</div></div>
              <div><div className="text-xs text-blue-700">{lang === 'is' ? 'Lífeyrir (starfsm.)' : 'Employee pension'}</div><div className="font-mono">{fmt(totals.empPension)}</div></div>
              <div><div className="text-xs text-blue-700">{lang === 'is' ? 'Lífeyrir (atvinnur.)' : 'Employer pension'}</div><div className="font-mono">{fmt(totals.emplrPension)}</div></div>
              <div><div className="text-xs text-blue-700">{lang === 'is' ? 'Tryggingagjald' : 'Social ins.'}</div><div className="font-mono">{fmt(totals.social)}</div></div>
            </div>
            <div className="mt-3 pt-3 border-t border-blue-200 flex justify-between text-sm font-bold text-blue-900">
              <span>{lang === 'is' ? 'Heildarkostnaður atvinnurekanda' : 'Total employer cost'}</span>
              <span className="font-mono">{fmt(totals.gross + totals.emplrPension + totals.social)}</span>
            </div>
          </div>
        </>
      )}
      </>)}

      {modal.open && <PayrollModal initial={modal.entry} onSave={handleSave} onClose={() => setModal({ open: false })} />}
      {empModal.open && <EmployeeModal initial={empModal.employee} onSave={handleSaveEmployee} onClose={() => setEmpModal({ open: false })} />}
      {deleteEmpId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold mb-2">{t('warning')}</h3>
            <p className="text-sm text-gray-600 mb-5">{t('confirmDelete')}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteEmpId(null)} className="flex-1 border border-gray-300 py-2 rounded-xl text-sm">{t('cancel')}</button>
              <button onClick={() => { dispatch({ type: 'DELETE_EMPLOYEE', payload: deleteEmpId }); setDeleteEmpId(null); }} className="flex-1 bg-red-600 text-white py-2 rounded-xl text-sm">{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold mb-2">{t('warning')}</h3>
            <p className="text-sm text-gray-600 mb-5">{t('confirmDelete')}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-gray-300 py-2 rounded-xl text-sm">{t('cancel')}</button>
              <button onClick={() => { dispatch({ type: 'DELETE_PAYROLL', payload: deleteId }); setDeleteId(null); }} className="flex-1 bg-red-600 text-white py-2 rounded-xl text-sm">{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
      <PlanLimitModal
        open={limitModal} onClose={() => setLimitModal(false)}
        limitText="You've reached 2 workers in payroll on the Free plan."
        limitTextIs="Þú hefur náð 2 starfsmönnum í launaskrá á Free plani."
      />
    </div>
  );
}
