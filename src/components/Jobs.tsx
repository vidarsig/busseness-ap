import { useState, useRef } from 'react';
import {
  Plus, X, Pencil, Trash2, Clock, Package, ChevronDown, ChevronUp,
  HardHat, CheckCircle, PauseCircle, XCircle, FileText, TrendingUp,
  Camera, Image, Receipt, Users, MapPin, Phone,
  ZoomIn, Search, Calendar,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Job, JobStatus, JobReportStatus, TimeEntry, JobMaterial, JobPhoto, Invoice, InvoiceLine, InvoiceCustomer, Currency } from '../types';
import { isJobLimitReached } from '../utils/planLimits';
import PlanLimitModal from './PlanLimitModal';
import type { SessionUser } from '../App';

interface JobsProps { sessionUser?: SessionUser | null; }

function newId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }
function nowISO() { return new Date().toISOString(); }
function todayISO() { return new Date().toISOString().slice(0,10); }

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

const STATUS_COLORS: Record<JobStatus, string> = {
  survey:    'bg-purple-100 text-purple-700 border border-purple-200',
  scheduled: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
  active:    'bg-green-100 text-green-700 border border-green-200',
  paused:    'bg-amber-100 text-amber-700 border border-amber-200',
  complete:  'bg-blue-100 text-blue-700 border border-blue-200',
  cancelled: 'bg-gray-100 text-gray-500 border border-gray-200',
};

const STATUS_ICONS: Record<JobStatus, React.ElementType> = {
  survey: Search, scheduled: Calendar, active: HardHat,
  paused: PauseCircle, complete: CheckCircle, cancelled: XCircle,
};

// Plain-language stage names. Survey-first pipeline the foreman actually follows.
const STATUS_LABELS: Record<JobStatus, { is: string; en: string }> = {
  survey:    { is: 'Vettvangsskoðun', en: 'Site visit' },
  scheduled: { is: 'Tímaskipulag',    en: 'Scheduling' },
  active:    { is: 'Í vinnslu',       en: 'Active' },
  paused:    { is: 'Á bið',           en: 'Paused' },
  complete:  { is: 'Lokið',           en: 'Complete' },
  cancelled: { is: 'Hætt við',        en: 'Cancelled' },
};

const emptyJob = (): Partial<Job> => ({
  name:'', clientName:'', clientContact:'', clientEmail:'', clientPhone:'',
  address:'', status:'survey', currency:'ISK', quotedAmount:0,
  description:'', notes:'',
});

type TabType = 'time' | 'materials' | 'photos' | 'summary';
interface JobFormState { open: boolean; job?: Partial<Job>; }
interface TimeFormState { open: boolean; jobId: string; entry?: Partial<TimeEntry>; }
interface MatFormState  { open: boolean; jobId: string; mat?: Partial<JobMaterial>; }

export default function Jobs({ sessionUser }: JobsProps) {
  const { data, dispatch, lang, fmt, cc } = useApp();
  const isIS = lang === 'is';
  const t = (is: string, en: string) => isIS ? is : en;

  // ── Report-approval permission ──
  // Who may approve a job report and convert it to an invoice is set per
  // worker in Settings → Users (canApproveJobReports). In single-user /
  // local mode (no app users configured) the solo tradesperson can approve,
  // so they are never locked out of their own jobs.
  const appUsers = data.appUsers ?? [];
  const currentAppUser = sessionUser?.email
    ? appUsers.find(au => au.email.toLowerCase() === sessionUser.email.toLowerCase())
    : undefined;
  const canApprove = currentAppUser
    ? !!currentAppUser.permissions?.canApproveJobReports
    : appUsers.length === 0; // local/solo mode → allowed
  const currentUserName = sessionUser?.name || sessionUser?.email || t('Starfsmaður','Worker');

  const jobs      = data.jobs ?? [];
  const times     = data.timeEntries ?? [];
  const materials = data.jobMaterials ?? [];
  const photos    = data.jobPhotos ?? [];

  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [tab, setTab]                   = useState<Record<string, TabType>>({});
  const [jobForm, setJobForm]           = useState<JobFormState>({ open: false });
  const [limitModal, setLimitModal]     = useState(false);

  function openNewJob() {
    if (isJobLimitReached(data)) { setLimitModal(true); return; }
    setJobForm({ open: true, job: emptyJob() });
  }

  // Top-bar camera: pick which job the photo belongs to (any job, old or new),
  // then launch the camera so the photo attaches to that job.
  function pickJobForPhoto(jobId: string) {
    setPhotoPicker(false);
    setPhotoJobId(jobId);
    setTimeout(() => cameraRef.current?.click(), 150);
  }

  // "New job + photo" from inside the picker: create a job, open its editor,
  // and launch the camera so the photo attaches to that brand-new job.
  function openNewJobWithCamera() {
    setPhotoPicker(false);
    if (isJobLimitReached(data)) { setLimitModal(true); return; }
    const now = nowISO();
    const id = newId('job');
    const job = {
      ...emptyJob(),
      id,
      number: nextJobNumber(),
      name: t('Nýtt verkefni', 'New job'),
      createdAt: now,
      updatedAt: now,
    } as Job;
    dispatch({ type: 'ADD_JOB', payload: job });
    setPhotoJobId(id);
    setJobForm({ open: true, job });
    setTimeout(() => cameraRef.current?.click(), 150);
  }
  const [timeForm, setTimeForm]         = useState<TimeFormState>({ open: false, jobId: '' });
  const [matForm, setMatForm]           = useState<MatFormState>({ open: false, jobId: '' });
  const [lightbox, setLightbox]         = useState<JobPhoto | null>(null);
  const [invoiceSuccess, setInvoiceSuccess] = useState<string | null>(null);
  const [photoPicker, setPhotoPicker]   = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [photoJobId, setPhotoJobId] = useState<string>('');

  // ── helpers ──────────────────────────────────────────────
  const jobTimes  = (id: string) => times.filter(t => t.jobId === id);
  const jobMats   = (id: string) => materials.filter(m => m.jobId === id);
  const jobPhotos = (id: string) => photos.filter(p => p.jobId === id);
  const labourCost = (id: string) => jobTimes(id).reduce((s,t) => s + t.hours * t.hourlyRate, 0);
  const matCost    = (id: string) => jobMats(id).reduce((s,m) => s + m.qty * m.unitCost, 0);
  const totalCost  = (id: string) => labourCost(id) + matCost(id);
  const profit     = (j: Job)    => (j.quotedAmount ?? 0) - totalCost(j.id);

  const getTab = (id: string): TabType => tab[id] ?? 'summary';
  const setJobTab = (id: string, t: TabType) => setTab(v => ({ ...v, [id]: t }));

  // ── job counter ──────────────────────────────────────────
  const nextJobNumber = () => {
    const year = new Date().getFullYear();
    const count = jobs.filter(j => j.number.includes(String(year))).length + 1;
    return `JOB-${year}-${String(count).padStart(3,'0')}`;
  };

  // ── save job ─────────────────────────────────────────────
  function saveJob() {
    const f = jobForm.job!;
    if (!f.name?.trim() || !f.clientName?.trim()) return;
    const now = nowISO();
    if (f.id) {
      dispatch({ type:'UPDATE_JOB', payload:{ ...f, updatedAt:now } as Job });
    } else {
      dispatch({ type:'ADD_JOB', payload:{ ...f, id:newId('job'), number:nextJobNumber(), createdAt:now, updatedAt:now } as Job });
    }
    setJobForm({ open:false });
  }

  function deleteJob(id: string) {
    if (confirm(t('Eyða þessum verkefni og öllum tímum/efni/myndum?', 'Delete this job and all its time/materials/photos?')))
      dispatch({ type:'DELETE_JOB', payload:id });
  }

  function updateStatus(job: Job, status: JobStatus) {
    dispatch({ type:'UPDATE_JOB', payload:{ ...job, status, updatedAt:nowISO() } });
  }

  // ── time entry ────────────────────────────────────────────
  function saveTime() {
    const f = timeForm.entry!;
    if (!f.employeeName?.trim() || !f.hours || f.hours <= 0) return;
    const now = nowISO();
    if (f.id) {
      dispatch({ type:'UPDATE_TIME_ENTRY', payload:{ ...f, createdAt:f.createdAt ?? now } as TimeEntry });
    } else {
      dispatch({ type:'ADD_TIME_ENTRY', payload:{ ...f, id:newId('te'), jobId:timeForm.jobId, createdAt:now } as TimeEntry });
    }
    setTimeForm(v => ({ ...v, open:false, entry:undefined }));
  }

  // ── material ──────────────────────────────────────────────
  function saveMat() {
    const f = matForm.mat!;
    if (!f.description?.trim() || !f.qty || f.qty <= 0) return;
    const now = nowISO();
    if (f.id) {
      dispatch({ type:'UPDATE_JOB_MATERIAL', payload:{ ...f, createdAt:f.createdAt ?? now } as JobMaterial });
    } else {
      dispatch({ type:'ADD_JOB_MATERIAL', payload:{ ...f, id:newId('jm'), jobId:matForm.jobId, createdAt:now } as JobMaterial });
    }
    setMatForm(v => ({ ...v, open:false, mat:undefined }));
  }

  // ── photos ────────────────────────────────────────────────
  function handlePhotoFiles(jobId: string, files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) return;
        dispatch({ type:'ADD_JOB_PHOTO', payload:{
          id: newId('photo'), jobId,
          dataUrl, caption:'', takenBy:'',
          takenAt: nowISO(), createdAt: nowISO(),
        }});
      };
      reader.readAsDataURL(file);
    });
  }

  function updateCaption(photo: JobPhoto, caption: string) {
    dispatch({ type:'UPDATE_JOB_PHOTO', payload:{ ...photo, caption } });
  }

  function deletePhoto(id: string) {
    dispatch({ type:'DELETE_JOB_PHOTO', payload:id });
  }

  // ── report approval workflow ──────────────────────────────
  function reportStatusOf(job: Job): JobReportStatus {
    return job.reportStatus ?? 'draft';
  }

  function submitReport(job: Job) {
    dispatch({ type:'UPDATE_JOB', payload:{
      ...job,
      reportStatus: 'submitted',
      submittedBy: currentUserName,
      submittedAt: nowISO(),
      returnNote: undefined,
      updatedAt: nowISO(),
    }});
  }

  function approveReport(job: Job) {
    dispatch({ type:'UPDATE_JOB', payload:{
      ...job,
      reportStatus: 'approved',
      approvedBy: currentUserName,
      approvedAt: nowISO(),
      updatedAt: nowISO(),
    }});
  }

  function sendBackReport(job: Job) {
    const note = window.prompt(
      t('Athugasemd til starfsmanns (valfrjálst):', 'Note to worker (optional):'),
      ''
    );
    if (note === null) return; // cancelled
    dispatch({ type:'UPDATE_JOB', payload:{
      ...job,
      reportStatus: 'draft',
      returnNote: note || undefined,
      submittedBy: undefined,
      submittedAt: undefined,
      approvedBy: undefined,
      approvedAt: undefined,
      updatedAt: nowISO(),
    }});
  }

  // ── convert to invoice ────────────────────────────────────
  function convertToInvoice(job: Job) {
    // HARD GATE: a job can NEVER become an invoice without an approved report.
    if (reportStatusOf(job) !== 'approved') {
      alert(t(
        'Ekki er hægt að reikningsfæra verkið fyrr en verkskýrslan hefur verið samþykkt af stjórnanda.',
        'This job cannot be invoiced until the job report has been approved by a manager.'
      ));
      return;
    }

    const timeItems = jobTimes(job.id);
    const matItems  = jobMats(job.id);

    if (timeItems.length === 0 && matItems.length === 0) {
      alert(t('Engar færslur á þessum verkefni til að reikningsfæra.', 'No time or materials on this job to invoice.'));
      return;
    }

    const lines: InvoiceLine[] = [];

    // Group time by worker
    const workerMap: Record<string, { hours: number; rate: number }> = {};
    timeItems.forEach(te => {
      if (!workerMap[te.employeeName]) workerMap[te.employeeName] = { hours: 0, rate: te.hourlyRate };
      workerMap[te.employeeName].hours += te.hours;
    });

    Object.entries(workerMap).forEach(([name, { hours, rate }]) => {
      lines.push({
        id: newId('il'),
        description: `${t('Vinnulaun', 'Labour')} — ${name}`,
        quantity: hours,
        unitPrice: rate,
        vatRate: cc.standardRate,
      });
    });

    // Materials
    matItems.forEach(m => {
      lines.push({
        id: newId('il'),
        description: m.description,
        quantity: m.qty,
        unitPrice: m.unitCost,
        vatRate: cc.standardRate,
      });
    });

    const customer: InvoiceCustomer = {
      name: job.clientName,
      email: job.clientEmail,
      phone: job.clientPhone,
      address: job.address,
    };

    const today = todayISO();
    const due = new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0,10);
    const lastNum = data.settings.invoiceLastNumber + 1;
    const prefix = data.settings.invoicePrefix || 'R';

    const invoice: Invoice = {
      id: newId('inv'),
      number: `${prefix}${String(lastNum).padStart(4,'0')}`,
      type: 'invoice',
      date: today,
      dueDate: due,
      customer,
      lines,
      notes: `${t('Verk', 'Job')}: ${job.number} — ${job.name}`,
      status: 'draft',
      currency: job.currency,
      eurToIskRate: data.settings.exchangeRates?.EUR ?? 150,
    };

    dispatch({ type:'ADD_INVOICE', payload: invoice });
    dispatch({ type:'UPDATE_SETTINGS', payload:{ invoiceLastNumber: lastNum } });

    setInvoiceSuccess(invoice.number);
    setTimeout(() => setInvoiceSuccess(null), 4000);
  }

  // ── make an offer (quote) straight from the job ───────────
  // After a site visit the foreman can create an offer in one tap. The quote
  // itself lives in Invoices (type:'quote'); we just prefill the customer and,
  // if a price was noted, a single line — then they finish it on the Invoices
  // screen and send it. We tag the quote's notes with the job number so the
  // button knows an offer already exists and won't make duplicates.
  function offerForJob(job: Job): Invoice | undefined {
    return (data.invoices ?? []).find(
      inv => inv.type === 'quote' && (inv.notes ?? '').includes(`#${job.number}`)
    );
  }

  function makeOffer(job: Job) {
    const existing = offerForJob(job);
    if (existing) { setInvoiceSuccess(existing.number); setTimeout(() => setInvoiceSuccess(null), 4000); return; }

    const customer: InvoiceCustomer = {
      name: job.clientName,
      email: job.clientEmail,
      phone: job.clientPhone,
      address: job.address,
    };

    const lines: InvoiceLine[] = [{
      id: newId('il'),
      description: job.name || t('Tilboð', 'Offer'),
      quantity: 1,
      unitPrice: job.quotedAmount || 0,
      vatRate: cc.standardRate,
    }];

    const today = todayISO();
    const due = new Date(Date.now() + 14*24*60*60*1000).toISOString().slice(0,10);
    const nextNum = data.settings.quoteLastNumber + 1;

    const quote: Invoice = {
      id: newId('inv'),
      number: `T${String(nextNum).padStart(4,'0')}`,
      type: 'quote',
      date: today,
      dueDate: due,
      customer,
      lines,
      notes: `${t('Verk', 'Job')} #${job.number} — ${job.name}`,
      status: 'draft',
      currency: job.currency,
      eurToIskRate: data.settings.exchangeRates?.EUR ?? 150,
    };

    dispatch({ type:'ADD_INVOICE', payload: quote });
    dispatch({ type:'UPDATE_SETTINGS', payload:{ quoteLastNumber: nextNum } });

    setInvoiceSuccess(quote.number);
    setTimeout(() => setInvoiceSuccess(null), 5000);
  }

  // ── filter ────────────────────────────────────────────────
  const filtered = statusFilter === 'all' ? jobs : jobs.filter(j => j.status === statusFilter);
  const STATUSES: JobStatus[] = ['survey','scheduled','active','paused','complete','cancelled'];

  return (
    <div className="space-y-5">

      {/* Invoice success toast */}
      {invoiceSuccess && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium">
          <CheckCircle className="w-4 h-4" />
          {invoiceSuccess.startsWith('T')
            ? t(`Tilboð ${invoiceSuccess} búið til — kláraðu það í Reikningum.`, `Offer ${invoiceSuccess} created — finish it in Invoices.`)
            : t(`Reikningur ${invoiceSuccess} búinn til!`, `Invoice ${invoiceSuccess} created!`)}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <HardHat className="w-5 h-5 text-blue-600" />
            {t('Vinnubók', 'Work Book')}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t('Verkefni · Tímar · Efni · Myndir → Reikningur', 'Jobs · Hours · Materials · Photos → Invoice')}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPhotoPicker(true)} title={t('Taka mynd fyrir verkefni', 'Take photo for a job')}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition">
            <Camera className="w-4 h-4" />
            <span className="hidden sm:inline">{t('Taka mynd', 'Take photo')}</span>
          </button>
          <button onClick={openNewJob}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t('Nýtt verkefni', 'New job')}</span>
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {jobs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t('Vettvangsskoðun', 'Site visits'), count: jobs.filter(j=>j.status==='survey').length, color:'text-purple-600' },
            { label: t('Virk', 'Active'), count: jobs.filter(j=>j.status==='active').length, color:'text-green-600' },
            { label: t('Lokið', 'Complete'), count: jobs.filter(j=>j.status==='complete').length, color:'text-blue-600' },
            { label: t('Myndir', 'Photos'), count: photos.length, color:'text-orange-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
              <div className={`text-2xl font-bold ${s.color}`}>{s.count}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {(['all', ...STATUSES] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
            }`}>
            {s === 'all' ? t('Allt', 'All') : t(STATUS_LABELS[s].is, STATUS_LABELS[s].en)}
          </button>
        ))}
      </div>

      {/* Job list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <HardHat className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">{t('Engin verkefni. Búðu til fyrsta verkefnið.', 'No jobs yet. Create your first job.')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(job => {
            const StatusIcon = STATUS_ICONS[job.status];
            const isExpanded = expandedId === job.id;
            const currentTab = getTab(job.id);
            const jTimes = jobTimes(job.id);
            const jMats  = jobMats(job.id);
            const jPhotos = jobPhotos(job.id);
            const labour  = labourCost(job.id);
            const mat     = matCost(job.id);
            const total   = labour + mat;
            const profitAmt = profit(job);

            return (
              <div key={job.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                {/* Job header */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-gray-400">{job.number}</span>
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[job.status]}`}>
                          <StatusIcon className="w-3 h-3" />
                          {t(STATUS_LABELS[job.status].is, STATUS_LABELS[job.status].en)}
                        </span>
                        {jPhotos.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-100">
                            <Camera className="w-3 h-3" />
                            {jPhotos.length}
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-gray-900 mt-1">{job.name}</h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{job.clientName}</span>
                        {job.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{job.address}</span>}
                        {job.clientPhone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{job.clientPhone}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Quick status change */}
                      <select value={job.status}
                        onChange={e => updateStatus(job, e.target.value as JobStatus)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                        {STATUSES.map(s => <option key={s} value={s}>{t(STATUS_LABELS[s].is, STATUS_LABELS[s].en)}</option>)}
                      </select>
                      <button onClick={() => { setPhotoJobId(job.id); cameraRef.current?.click(); }}
                        title={t('Taka mynd', 'Take photo')}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-orange-600 transition">
                        <Camera className="w-4 h-4" />
                      </button>
                      <button onClick={() => setJobForm({ open:true, job:{ ...job } })}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteJob(job.id)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-600 transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => setExpandedId(isExpanded ? null : job.id)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Mini summary */}
                  <div className="flex gap-4 mt-3 text-xs text-gray-500">
                    <span><Clock className="w-3 h-3 inline mr-0.5" />{jTimes.reduce((s,t)=>s+t.hours,0).toFixed(1)}h</span>
                    <span><Package className="w-3 h-3 inline mr-0.5" />{jMats.length} {t('hlutir','items')}</span>
                    <span className="font-medium text-gray-700">{fmt(total)}</span>
                    {job.quotedAmount ? (
                      <span className={`font-semibold ${profitAmt >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {profitAmt >= 0 ? '+' : ''}{fmt(profitAmt)}
                      </span>
                    ) : null}
                  </div>

                  {/* Make offer — one tap after a site visit. Quote lands in Invoices. */}
                  {(job.status === 'survey' || job.status === 'scheduled') && (() => {
                    const existingOffer = offerForJob(job);
                    return (
                      <button onClick={() => makeOffer(job)}
                        className={`mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition shadow-sm ${
                          existingOffer
                            ? 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
                            : 'bg-purple-600 hover:bg-purple-700 text-white'
                        }`}>
                        <FileText className="w-4 h-4" />
                        {existingOffer
                          ? t(`Tilboð ${existingOffer.number} til — opna í Reikningum`, `Offer ${existingOffer.number} made — open in Invoices`)
                          : t('Gera tilboð', 'Make offer')}
                      </button>
                    );
                  })()}
                </div>

                {/* Expanded panel */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    {/* Tab bar */}
                    <div className="flex border-b border-gray-100 bg-gray-50">
                      {([
                        { id:'summary',   label: t('Samantekt','Summary'),  icon: TrendingUp },
                        { id:'time',      label: t('Tímar','Time'),         icon: Clock },
                        { id:'materials', label: t('Efni','Materials'),     icon: Package },
                        { id:'photos',    label: `${t('Myndir','Photos')} (${jPhotos.length})`, icon: Camera },
                      ] as const).map(({ id, label, icon: Icon }) => (
                        <button key={id} onClick={() => setJobTab(job.id, id)}
                          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition ${
                            currentTab === id ? 'border-blue-500 text-blue-600 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'
                          }`}>
                          <Icon className="w-3.5 h-3.5" />
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="p-4">

                      {/* ── SUMMARY TAB ── */}
                      {currentTab === 'summary' && (
                        <div className="space-y-4">
                          {job.description && (
                            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{job.description}</p>
                          )}

                          {/* Financials */}
                          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">{t('Vinnulaun','Labour cost')}</span>
                              <span className="font-medium">{fmt(labour)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">{t('Efniskostnaður','Materials cost')}</span>
                              <span className="font-medium">{fmt(mat)}</span>
                            </div>
                            <div className="border-t border-gray-200 pt-2 flex justify-between text-sm font-semibold">
                              <span>{t('Heildarkostnaður','Total cost')}</span>
                              <span>{fmt(total)}</span>
                            </div>
                            {job.quotedAmount ? <>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-500">{t('Tilboðsverð','Quoted price')}</span>
                                <span className="font-medium">{fmt(job.quotedAmount ?? 0)}</span>
                              </div>
                              <div className={`flex justify-between text-sm font-bold pt-1 border-t border-gray-200 ${profitAmt >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                <span>{t('Hagnaður','Profit')}</span>
                                <span>{profitAmt >= 0 ? '+' : ''}{fmt(profitAmt)} ({job.quotedAmount > 0 ? Math.round(profitAmt / job.quotedAmount * 100) : 0}%)</span>
                              </div>
                            </> : null}
                          </div>

                          {/* Worker summary */}
                          {jTimes.length > 0 && (
                            <div>
                              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                {t('Starfsmenn','Workers')}
                              </h4>
                              {Object.entries(
                                jTimes.reduce((acc, te) => {
                                  acc[te.employeeName] = (acc[te.employeeName] || 0) + te.hours;
                                  return acc;
                                }, {} as Record<string, number>)
                              ).map(([name, hours]) => (
                                <div key={name} className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                                  <span className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">
                                      {name.charAt(0).toUpperCase()}
                                    </div>
                                    {name}
                                  </span>
                                  <span className="font-medium text-gray-700">{hours.toFixed(1)}h</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* ── Report approval workflow ── */}
                          {(() => {
                            const rs = reportStatusOf(job);
                            return (
                              <div className="space-y-3">
                                {/* Status badge */}
                                <div className="flex items-center justify-between">
                                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                    {t('Verkskýrsla','Job report')}
                                  </h4>
                                  {rs === 'draft' && (
                                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                                      {t('Drög','Draft')}
                                    </span>
                                  )}
                                  {rs === 'submitted' && (
                                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                                      {t('Bíður samþykkis','Awaiting approval')}
                                    </span>
                                  )}
                                  {rs === 'approved' && (
                                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
                                      {t('Samþykkt','Approved')}
                                    </span>
                                  )}
                                </div>

                                {/* Returned note (manager sent it back) */}
                                {rs === 'draft' && job.returnNote && (
                                  <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">
                                    ↩︎ {t('Sent til baka','Sent back')}: {job.returnNote}
                                  </p>
                                )}

                                {/* Submitted / approved meta */}
                                {rs === 'submitted' && job.submittedBy && (
                                  <p className="text-xs text-gray-500">
                                    {t('Sent af','Submitted by')} {job.submittedBy}
                                    {job.submittedAt ? ` — ${job.submittedAt.slice(0,10)}` : ''}
                                  </p>
                                )}
                                {rs === 'approved' && job.approvedBy && (
                                  <p className="text-xs text-gray-500">
                                    {t('Samþykkt af','Approved by')} {job.approvedBy}
                                    {job.approvedAt ? ` — ${job.approvedAt.slice(0,10)}` : ''}
                                  </p>
                                )}

                                {/* Worker action: submit for approval */}
                                {rs === 'draft' && (
                                  <button onClick={() => submitReport(job)}
                                    className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition shadow-sm">
                                    <FileText className="w-4 h-4" />
                                    {t('Senda skýrslu til samþykkis', 'Submit report for approval')}
                                  </button>
                                )}

                                {/* Manager actions: approve / send back */}
                                {rs === 'submitted' && (
                                  canApprove ? (
                                    <div className="flex gap-2">
                                      <button onClick={() => approveReport(job)}
                                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm transition shadow-sm">
                                        <CheckCircle className="w-4 h-4" />
                                        {t('Samþykkja','Approve')}
                                      </button>
                                      <button onClick={() => sendBackReport(job)}
                                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition">
                                        <XCircle className="w-4 h-4" />
                                        {t('Senda til baka','Send back')}
                                      </button>
                                    </div>
                                  ) : (
                                    <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-lg p-3 text-center">
                                      {t('Bíður samþykkis stjórnanda.','Waiting for a manager to approve.')}
                                    </p>
                                  )
                                )}

                                {/* Convert to Invoice — only after approval */}
                                {rs === 'approved' ? (
                                  <button onClick={() => convertToInvoice(job)}
                                    className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm transition shadow-sm">
                                    <Receipt className="w-4 h-4" />
                                    {t('Breyta í reikning', 'Convert to Invoice')}
                                  </button>
                                ) : (
                                  <button disabled
                                    className="w-full flex items-center justify-center gap-2 py-3 bg-gray-100 text-gray-400 rounded-xl font-semibold text-sm cursor-not-allowed">
                                    <Receipt className="w-4 h-4" />
                                    {t('Breyta í reikning', 'Convert to Invoice')}
                                  </button>
                                )}
                              </div>
                            );
                          })()}

                          {job.notes && (
                            <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-lg p-3">
                              📝 {job.notes}
                            </p>
                          )}
                        </div>
                      )}

                      {/* ── TIME TAB ── */}
                      {currentTab === 'time' && (
                        <div className="space-y-3">
                          <button onClick={() => setTimeForm({ open:true, jobId:job.id, entry:{ date:todayISO(), hourlyRate:5000, hours:8 } })}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-medium transition">
                            <Plus className="w-3.5 h-3.5" />
                            {t('Skrá tíma', 'Log time')}
                          </button>
                          {jTimes.length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-4">{t('Engir tímar skráðir','No time logged')}</p>
                          ) : (
                            <div className="space-y-1">
                              {jTimes.map(te => (
                                <div key={te.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold flex-shrink-0">
                                    {te.employeeName.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-gray-900">{te.employeeName}</div>
                                    <div className="text-xs text-gray-500">{te.date} · {te.description || ''}</div>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <div className="text-sm font-semibold text-gray-900">{te.hours}h</div>
                                    <div className="text-xs text-gray-500">{fmt(te.hours * te.hourlyRate)}</div>
                                  </div>
                                  <div className="flex gap-1">
                                    <button onClick={() => setTimeForm({ open:true, jobId:job.id, entry:{ ...te } })}
                                      className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-blue-600 transition">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => dispatch({ type:'DELETE_TIME_ENTRY', payload:te.id })}
                                      className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-red-600 transition">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                              <div className="flex justify-between text-xs font-semibold text-gray-700 px-3 py-2 bg-blue-50 rounded-lg">
                                <span>{jTimes.reduce((s,t)=>s+t.hours,0).toFixed(1)}h {t('alls','total')}</span>
                                <span>{fmt(labour)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── MATERIALS TAB ── */}
                      {currentTab === 'materials' && (
                        <div className="space-y-3">
                          <button onClick={() => setMatForm({ open:true, jobId:job.id, mat:{ date:todayISO(), qty:1, unitCost:0, unit:'stk' } })}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-medium transition">
                            <Plus className="w-3.5 h-3.5" />
                            {t('Bæta við efni', 'Add material')}
                          </button>
                          {jMats.length === 0 ? (
                            <p className="text-xs text-gray-400 text-center py-4">{t('Ekkert efni skráð','No materials logged')}</p>
                          ) : (
                            <div className="space-y-1">
                              {jMats.map(m => (
                                <div key={m.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                                  <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-gray-900">{m.description}</div>
                                    <div className="text-xs text-gray-500">{m.date} · {m.qty} {m.unit}</div>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <div className="text-sm font-semibold text-gray-900">{fmt(m.qty * m.unitCost)}</div>
                                    <div className="text-xs text-gray-500">{fmt(m.unitCost)}/{m.unit}</div>
                                  </div>
                                  <div className="flex gap-1">
                                    <button onClick={() => setMatForm({ open:true, jobId:job.id, mat:{ ...m } })}
                                      className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-blue-600 transition">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => dispatch({ type:'DELETE_JOB_MATERIAL', payload:m.id })}
                                      className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-red-600 transition">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                              <div className="flex justify-between text-xs font-semibold text-gray-700 px-3 py-2 bg-green-50 rounded-lg">
                                <span>{jMats.length} {t('liðir','lines')}</span>
                                <span>{fmt(mat)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── PHOTOS TAB ── */}
                      {currentTab === 'photos' && (
                        <div className="space-y-3">
                          {/* Camera / upload buttons */}
                          <div className="flex gap-2">
                            <button onClick={() => { setPhotoJobId(job.id); cameraRef.current?.click(); }}
                              className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg text-xs font-medium transition">
                              <Camera className="w-3.5 h-3.5" />
                              {t('Taka mynd', 'Take photo')}
                            </button>
                            <button onClick={() => { setPhotoJobId(job.id); galleryRef.current?.click(); }}
                              className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-medium transition">
                              <Image className="w-3.5 h-3.5" />
                              {t('Velja úr myndasafni', 'Choose from gallery')}
                            </button>
                          </div>

                          {jPhotos.length === 0 ? (
                            <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                              <Camera className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                              <p className="text-xs text-gray-400">{t('Engar myndir. Taktu mynd á vinnustaðnum.', 'No photos. Take a photo on site.')}</p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {jPhotos.map(photo => (
                                <div key={photo.id} className="relative group rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                                  <img src={photo.dataUrl} alt={photo.caption || ''} className="w-full aspect-square object-cover" />
                                  {/* Overlay */}
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                                    <button onClick={() => setLightbox(photo)}
                                      className="p-2 rounded-full bg-white/90 text-gray-700 hover:bg-white transition">
                                      <ZoomIn className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => deletePhoto(photo.id)}
                                      className="p-2 rounded-full bg-white/90 text-red-600 hover:bg-white transition">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                  {/* Caption */}
                                  <div className="p-2">
                                    <input
                                      value={photo.caption || ''}
                                      onChange={e => updateCaption(photo, e.target.value)}
                                      placeholder={t('Lýsing...', 'Caption...')}
                                      className="w-full text-xs text-gray-600 bg-transparent border-0 focus:outline-none placeholder-gray-400"
                                    />
                                    <p className="text-[10px] text-gray-400 mt-0.5">{photo.takenAt.slice(0,10)}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Photo: pick which job ── */}
      {photoPicker && (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50" onClick={() => setPhotoPicker(false)}>
          <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl shadow-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Camera className="w-5 h-5 text-orange-500" />
                {t('Velja verkefni fyrir mynd', 'Choose a job for the photo')}
              </h2>
              <button onClick={() => setPhotoPicker(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-2">
              <button onClick={openNewJobWithCamera}
                className="w-full flex items-center gap-2 px-3 py-3 mb-1 rounded-lg bg-blue-50 text-blue-700 font-medium text-sm hover:bg-blue-100 transition">
                <Plus className="w-4 h-4 flex-shrink-0" />
                {t('Nýtt verkefni', 'New job')}
              </button>
              {jobs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">{t('Engin verkefni ennþá', 'No jobs yet')}</p>
              ) : (
                [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(job => (
                  <button key={job.id} onClick={() => pickJobForPhoto(job.id)}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-gray-50 text-left transition">
                    <Camera className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-800 truncate">{job.name}</div>
                      <div className="text-xs text-gray-400 truncate">
                        {job.number}{job.clientName ? ` · ${job.clientName}` : ''} · {jobPhotos(job.id).length} {t('myndir', 'photos')}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hidden file inputs for photos */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple className="hidden"
        onChange={e => { handlePhotoFiles(photoJobId, e.target.files); e.target.value = ''; }} />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => { handlePhotoFiles(photoJobId, e.target.files); e.target.value = ''; }} />

      {/* ── Lightbox ── */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <img src={lightbox.dataUrl} alt={lightbox.caption || ''} className="w-full rounded-xl shadow-2xl max-h-[80vh] object-contain" />
            {lightbox.caption && (
              <p className="text-center text-white/80 mt-3 text-sm">{lightbox.caption}</p>
            )}
            <button onClick={() => setLightbox(null)}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Job form modal ── */}
      {jobForm.open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">
                {jobForm.job?.id ? t('Breyta verkefni','Edit job') : t('Nýtt verkefni','New job')}
              </h2>
              <button onClick={() => setJobForm({ open:false })} className="p-1 rounded hover:bg-gray-100 text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Heiti verkefnis *','Job name *')}</label>
                  <input className={inp} value={jobForm.job?.name ?? ''} onChange={e => setJobForm(f => ({ ...f, job:{ ...f.job, name:e.target.value } }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Viðskiptavinur *','Client *')}</label>
                  <input className={inp} value={jobForm.job?.clientName ?? ''} onChange={e => setJobForm(f => ({ ...f, job:{ ...f.job, clientName:e.target.value } }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Tengiliður','Contact person')}</label>
                  <input className={inp} value={jobForm.job?.clientContact ?? ''} onChange={e => setJobForm(f => ({ ...f, job:{ ...f.job, clientContact:e.target.value } }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Sími','Phone')}</label>
                  <input className={inp} value={jobForm.job?.clientPhone ?? ''} onChange={e => setJobForm(f => ({ ...f, job:{ ...f.job, clientPhone:e.target.value } }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Netfang','Email')}</label>
                  <input type="email" className={inp} value={jobForm.job?.clientEmail ?? ''} onChange={e => setJobForm(f => ({ ...f, job:{ ...f.job, clientEmail:e.target.value } }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Vinnustaður / Heimilisfang','Site address')}</label>
                  <input className={inp} value={jobForm.job?.address ?? ''} onChange={e => setJobForm(f => ({ ...f, job:{ ...f.job, address:e.target.value } }))} placeholder={t('Götuheiti, bær','Street, town')} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Staða','Status')}</label>
                  <select className={inp} value={jobForm.job?.status ?? 'active'} onChange={e => setJobForm(f => ({ ...f, job:{ ...f.job, status:e.target.value as JobStatus } }))}>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Gjaldmiðill','Currency')}</label>
                  <select className={inp} value={jobForm.job?.currency ?? 'ISK'} onChange={e => setJobForm(f => ({ ...f, job:{ ...f.job, currency:e.target.value as Currency } }))}>
                    {['ISK','EUR','USD','GBP','DKK','NOK','SEK'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Upphafsdagur','Start date')}</label>
                  <input type="date" className={inp} value={jobForm.job?.startDate ?? ''} onChange={e => setJobForm(f => ({ ...f, job:{ ...f.job, startDate:e.target.value } }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Lokadagur','End date')}</label>
                  <input type="date" className={inp} value={jobForm.job?.endDate ?? ''} onChange={e => setJobForm(f => ({ ...f, job:{ ...f.job, endDate:e.target.value } }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Tilboðsverð (án VSK)','Quoted amount (ex. VAT)')}</label>
                  <input type="number" className={inp} value={jobForm.job?.quotedAmount ?? 0} onChange={e => setJobForm(f => ({ ...f, job:{ ...f.job, quotedAmount:Number(e.target.value) } }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Lýsing','Description')}</label>
                  <textarea rows={2} className={inp} value={jobForm.job?.description ?? ''} onChange={e => setJobForm(f => ({ ...f, job:{ ...f.job, description:e.target.value } }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Athugasemdir','Notes')}</label>
                  <textarea rows={2} className={inp} value={jobForm.job?.notes ?? ''} onChange={e => setJobForm(f => ({ ...f, job:{ ...f.job, notes:e.target.value } }))} />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setJobForm({ open:false })} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                {t('Hætta við','Cancel')}
              </button>
              <button onClick={saveJob} disabled={!jobForm.job?.name?.trim() || !jobForm.job?.clientName?.trim()}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition disabled:opacity-50">
                {t('Vista','Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Time form modal ── */}
      {timeForm.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                {timeForm.entry?.id ? t('Breyta tíma','Edit time') : t('Skrá tíma','Log time')}
              </h2>
              <button onClick={() => setTimeForm(v => ({ ...v, open:false }))} className="p-1 rounded hover:bg-gray-100 text-gray-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('Starfsmaður *','Worker *')}</label>
                <input className={inp} value={timeForm.entry?.employeeName ?? ''} onChange={e => setTimeForm(v => ({ ...v, entry:{ ...v.entry, employeeName:e.target.value } }))} placeholder={t('Nafn starfsmanns','Employee name')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Dagsetning','Date')}</label>
                  <input type="date" className={inp} value={timeForm.entry?.date ?? todayISO()} onChange={e => setTimeForm(v => ({ ...v, entry:{ ...v.entry, date:e.target.value } }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Klukkustundir *','Hours *')}</label>
                  <input type="number" step="0.5" min="0.5" className={inp} value={timeForm.entry?.hours ?? 8} onChange={e => setTimeForm(v => ({ ...v, entry:{ ...v.entry, hours:Number(e.target.value) } }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('Tímagjald (kr/klst)','Hourly rate')}</label>
                <input type="number" className={inp} value={timeForm.entry?.hourlyRate ?? 5000} onChange={e => setTimeForm(v => ({ ...v, entry:{ ...v.entry, hourlyRate:Number(e.target.value) } }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('Lýsing','Description')}</label>
                <input className={inp} value={timeForm.entry?.description ?? ''} onChange={e => setTimeForm(v => ({ ...v, entry:{ ...v.entry, description:e.target.value } }))} placeholder={t('Hvað var gert?','What was done?')} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setTimeForm(v => ({ ...v, open:false }))} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">{t('Hætta við','Cancel')}</button>
              <button onClick={saveTime} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition">{t('Vista','Save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Material form modal ── */}
      {matForm.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-green-600" />
                {matForm.mat?.id ? t('Breyta efni','Edit material') : t('Bæta við efni','Add material')}
              </h2>
              <button onClick={() => setMatForm(v => ({ ...v, open:false }))} className="p-1 rounded hover:bg-gray-100 text-gray-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('Efni / Lýsing *','Material / Description *')}</label>
                <input className={inp} value={matForm.mat?.description ?? ''} onChange={e => setMatForm(v => ({ ...v, mat:{ ...v.mat, description:e.target.value } }))} placeholder={t('t.d. Viðarleggur 2x4','e.g. Timber 2x4')} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Magn','Qty')}</label>
                  <input type="number" min="0" step="0.1" className={inp} value={matForm.mat?.qty ?? 1} onChange={e => setMatForm(v => ({ ...v, mat:{ ...v.mat, qty:Number(e.target.value) } }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Eining','Unit')}</label>
                  <input className={inp} value={matForm.mat?.unit ?? 'stk'} onChange={e => setMatForm(v => ({ ...v, mat:{ ...v.mat, unit:e.target.value } }))} placeholder="stk/m/kg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Verð/stk','Unit cost')}</label>
                  <input type="number" min="0" className={inp} value={matForm.mat?.unitCost ?? 0} onChange={e => setMatForm(v => ({ ...v, mat:{ ...v.mat, unitCost:Number(e.target.value) } }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Dagsetning','Date')}</label>
                  <input type="date" className={inp} value={matForm.mat?.date ?? todayISO()} onChange={e => setMatForm(v => ({ ...v, mat:{ ...v.mat, date:e.target.value } }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{t('Birgi','Supplier')}</label>
                  <input className={inp} value={matForm.mat?.supplierName ?? ''} onChange={e => setMatForm(v => ({ ...v, mat:{ ...v.mat, supplierName:e.target.value } }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('Tilvísun / Númer','Reference')}</label>
                <input className={inp} value={matForm.mat?.reference ?? ''} onChange={e => setMatForm(v => ({ ...v, mat:{ ...v.mat, reference:e.target.value } }))} placeholder={t('Reikningsnúmer birgis','Supplier invoice no.')} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setMatForm(v => ({ ...v, open:false }))} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">{t('Hætta við','Cancel')}</button>
              <button onClick={saveMat} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition">{t('Vista','Save')}</button>
            </div>
          </div>
        </div>
      )}
      <PlanLimitModal
        open={limitModal} onClose={() => setLimitModal(false)}
        limitText="You've reached 2 active jobs on the Free plan."
        limitTextIs="Þú hefur náð 2 virkum verkefnum á Free plani."
      />
    </div>
  );
}
