import { useState } from 'react';
import {
  Plus, X, Pencil, Trash2, Clock, Package, ChevronDown, ChevronUp,
  HardHat, CheckCircle, PauseCircle, XCircle, FileText, TrendingUp, AlertCircle
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Job, JobStatus, TimeEntry, JobMaterial, Currency } from '../types';

function newId(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }
function nowISO() { return new Date().toISOString(); }
function todayISO() { return new Date().toISOString().slice(0,10); }

const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

const STATUS_COLORS: Record<JobStatus, string> = {
  quote:     'bg-purple-100 text-purple-700',
  active:    'bg-green-100 text-green-700',
  paused:    'bg-amber-100 text-amber-700',
  complete:  'bg-blue-100 text-blue-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

const STATUS_ICONS: Record<JobStatus, React.ElementType> = {
  quote: FileText, active: HardHat, paused: PauseCircle,
  complete: CheckCircle, cancelled: XCircle,
};

const emptyJob = (): Partial<Job> => ({
  name:'', clientName:'', clientContact:'', clientEmail:'', clientPhone:'',
  address:'', status:'active', currency:'ISK', quotedAmount:0,
  description:'', notes:'',
});

interface JobFormState { open: boolean; job?: Partial<Job>; }
interface TimeFormState { open: boolean; jobId: string; entry?: Partial<TimeEntry>; }
interface MatFormState  { open: boolean; jobId: string; mat?: Partial<JobMaterial>; }

export default function Jobs() {
  const { data, dispatch, lang, fmt, cc } = useApp();
  const isIS = lang === 'is';

  const jobs       = data.jobs ?? [];
  const times      = data.timeEntries ?? [];
  const materials  = data.jobMaterials ?? [];

  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [tab, setTab]                   = useState<Record<string, 'time'|'materials'|'summary'>>({});
  const [jobForm, setJobForm]           = useState<JobFormState>({ open: false });
  const [timeForm, setTimeForm]         = useState<TimeFormState>({ open: false, jobId: '' });
  const [matForm, setMatForm]           = useState<MatFormState>({ open: false, jobId: '' });

  // ── helpers ──────────────────────────────────────────────
  const jobTimes = (id: string) => times.filter(t => t.jobId === id);
  const jobMats  = (id: string) => materials.filter(m => m.jobId === id);
  const labourCost = (id: string) => jobTimes(id).reduce((s,t) => s + t.hours * t.hourlyRate, 0);
  const matCost    = (id: string) => jobMats(id).reduce((s,m) => s + m.qty * m.unitCost, 0);
  const totalCost  = (id: string) => labourCost(id) + matCost(id);
  const profit     = (j: Job)  => (j.quotedAmount ?? 0) - totalCost(j.id);

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
    if (confirm(isIS ? 'Eyða þessum verkefni og öllum tímum/efni?' : 'Delete this job and all its time/materials?'))
      dispatch({ type:'DELETE_JOB', payload:id });
  }

  function updateStatus(job: Job, status: JobStatus) {
    dispatch({ type:'UPDATE_JOB', payload:{ ...job, status, updatedAt:nowISO() } });
  }

  // ── save time entry ───────────────────────────────────────
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

  // ── save material ─────────────────────────────────────────
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

  const filtered = jobs.filter(j => statusFilter === 'all' || j.status === statusFilter)
    .sort((a,b) => b.createdAt.localeCompare(a.createdAt));

  const activeCount = jobs.filter(j => j.status === 'active').length;
  const totalRevenue = jobs.filter(j => j.status === 'complete').reduce((s,j) => s + (j.quotedAmount ?? 0), 0);

  const statuses: { key: JobStatus|'all'; label: string }[] = [
    { key:'all',       label: isIS ? 'Öll' : 'All' },
    { key:'active',    label: isIS ? 'Virk' : 'Active' },
    { key:'quote',     label: isIS ? 'Tilboð' : 'Quote' },
    { key:'paused',    label: isIS ? 'Í bið' : 'Paused' },
    { key:'complete',  label: isIS ? 'Lokið' : 'Complete' },
    { key:'cancelled', label: isIS ? 'Afturkallað' : 'Cancelled' },
  ];

  const jobTab = (id: string) => tab[id] ?? 'time';
  const setJobTab = (id: string, t: 'time'|'materials'|'summary') => setTab(v => ({...v, [id]:t}));

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <HardHat className="w-6 h-6 text-amber-500" />
            {isIS ? 'Verkefni / Starfsstöðvar' : 'Jobs / Work Accounting'}
          </h1>
          <p className="text-sm text-gray-500">{isIS ? 'Tími, efni og arðsemi per verkefni' : 'Time, materials and profit per job'}</p>
        </div>
        <button onClick={() => setJobForm({ open:true, job:{ ...emptyJob(), currency: cc.currency } })}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" />{isIS ? 'Nýtt verkefni' : 'New job'}
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">{isIS ? 'Virk verkefni' : 'Active jobs'}</div>
          <div className="text-2xl font-bold text-green-600">{activeCount}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">{isIS ? 'Verkefni samtals' : 'Total jobs'}</div>
          <div className="text-2xl font-bold text-gray-900">{jobs.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">{isIS ? 'Tekjur (lokið)' : 'Revenue (complete)'}</div>
          <div className="text-lg font-bold text-gray-900">{fmt(totalRevenue)}</div>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {statuses.map(s => (
          <button key={s.key} onClick={() => setStatusFilter(s.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${statusFilter === s.key ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            {s.label}
            {s.key !== 'all' && <span className="ml-1 opacity-60">{jobs.filter(j=>j.status===s.key).length}</span>}
          </button>
        ))}
      </div>

      {/* Job list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <HardHat className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">{isIS ? 'Engin verkefni' : 'No jobs yet — add your first job'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(job => {
            const expanded = expandedId === job.id;
            const lc = labourCost(job.id);
            const mc = matCost(job.id);
            const tc = totalCost(job.id);
            const pr = profit(job);
            const StatusIcon = STATUS_ICONS[job.status];

            return (
              <div key={job.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Job header row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => setExpandedId(expanded ? null : job.id)} className="flex-1 flex items-center gap-3 text-left">
                    <StatusIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{job.name}</span>
                        <span className="text-xs font-mono text-gray-400">{job.number}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[job.status]}`}>
                          {statuses.find(s=>s.key===job.status)?.label}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{job.clientName}{job.address ? ` · ${job.address}` : ''}</div>
                    </div>
                    <div className="text-right flex-shrink-0 hidden sm:block">
                      <div className="text-sm font-semibold text-gray-800">{fmt(job.quotedAmount ?? 0)}</div>
                      <div className={`text-xs font-medium ${pr >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {pr >= 0 ? '+' : ''}{fmt(pr)} {isIS ? 'framlegð' : 'margin'}
                      </div>
                    </div>
                    {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                  </button>
                  <div className="flex gap-1">
                    <button onClick={() => setJobForm({ open:true, job:{...job} })} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteJob(job.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded detail panel */}
                {expanded && (
                  <div className="border-t border-gray-100">
                    {/* Status switcher */}
                    <div className="px-4 pt-3 pb-1 flex gap-2 flex-wrap">
                      {(['quote','active','paused','complete','cancelled'] as JobStatus[]).map(s => (
                        <button key={s} onClick={() => updateStatus(job, s)}
                          className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${job.status === s ? STATUS_COLORS[s]+' border-transparent' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                          {statuses.find(x=>x.key===s)?.label}
                        </button>
                      ))}
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-0 border-b border-gray-100 px-4">
                      {([['time', isIS?'Tími':'Time'], ['materials', isIS?'Efni':'Materials'], ['summary', isIS?'Samantekt':'Summary']] as const).map(([t,label]) => (
                        <button key={t} onClick={() => setJobTab(job.id, t as 'time'|'materials'|'summary')}
                          className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${jobTab(job.id)===t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* TIME TAB */}
                    {jobTab(job.id) === 'time' && (
                      <div className="p-4">
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-xs font-semibold text-gray-500 uppercase">{isIS?'Tímaskráning':'Time entries'}</span>
                          <button onClick={() => setTimeForm({ open:true, jobId:job.id, entry:{ date:todayISO(), hours:8, hourlyRate:5000, employeeName:'' } })}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                            <Plus className="w-3.5 h-3.5" />{isIS?'Bæta við tíma':'Log time'}
                          </button>
                        </div>
                        {jobTimes(job.id).length === 0 ? (
                          <p className="text-xs text-gray-400 py-2">{isIS?'Engir tímar skráðir':'No time logged yet'}</p>
                        ) : (
                          <div className="space-y-1.5">
                            {jobTimes(job.id).sort((a,b)=>b.date.localeCompare(a.date)).map(te => (
                              <div key={te.id} className="flex items-center gap-3 text-xs bg-gray-50 rounded-lg px-3 py-2">
                                <span className="text-gray-400 w-20 flex-shrink-0">{te.date}</span>
                                <span className="font-medium text-gray-800 flex-1">{te.employeeName}</span>
                                <span className="text-gray-600">{te.hours}h × {fmt(te.hourlyRate)}</span>
                                <span className="font-semibold text-gray-800">{fmt(te.hours * te.hourlyRate)}</span>
                                <button onClick={() => dispatch({ type:'DELETE_TIME_ENTRY', payload:te.id })} className="text-gray-300 hover:text-red-400 ml-1">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                            <div className="flex justify-end pt-1">
                              <span className="text-xs font-bold text-gray-700">{isIS?'Samtals':'Total'}: {fmt(lc)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* MATERIALS TAB */}
                    {jobTab(job.id) === 'materials' && (
                      <div className="p-4">
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-xs font-semibold text-gray-500 uppercase">{isIS?'Efni og hlutir':'Materials'}</span>
                          <button onClick={() => setMatForm({ open:true, jobId:job.id, mat:{ date:todayISO(), qty:1, unit:'pcs', unitCost:0, description:'' } })}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                            <Plus className="w-3.5 h-3.5" />{isIS?'Bæta við efni':'Add material'}
                          </button>
                        </div>
                        {jobMats(job.id).length === 0 ? (
                          <p className="text-xs text-gray-400 py-2">{isIS?'Ekkert efni skráð':'No materials yet'}</p>
                        ) : (
                          <div className="space-y-1.5">
                            {jobMats(job.id).sort((a,b)=>b.date.localeCompare(a.date)).map(m => (
                              <div key={m.id} className="flex items-center gap-3 text-xs bg-gray-50 rounded-lg px-3 py-2">
                                <span className="text-gray-400 w-20 flex-shrink-0">{m.date}</span>
                                <span className="font-medium text-gray-800 flex-1">{m.description}</span>
                                <span className="text-gray-600">{m.qty} {m.unit} × {fmt(m.unitCost)}</span>
                                <span className="font-semibold text-gray-800">{fmt(m.qty * m.unitCost)}</span>
                                <button onClick={() => dispatch({ type:'DELETE_JOB_MATERIAL', payload:m.id })} className="text-gray-300 hover:text-red-400 ml-1">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                            <div className="flex justify-end pt-1">
                              <span className="text-xs font-bold text-gray-700">{isIS?'Samtals':'Total'}: {fmt(mc)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* SUMMARY TAB */}
                    {jobTab(job.id) === 'summary' && (
                      <div className="p-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div className="bg-gray-50 rounded-xl p-3">
                            <div className="text-xs text-gray-500 mb-1">{isIS?'Samkvæmt tilboði':'Quoted'}</div>
                            <div className="text-lg font-bold text-gray-900">{fmt(job.quotedAmount ?? 0)}</div>
                          </div>
                          <div className="bg-blue-50 rounded-xl p-3">
                            <div className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Clock className="w-3 h-3"/>{isIS?'Launakostnaður':'Labour cost'}</div>
                            <div className="text-lg font-bold text-blue-700">{fmt(lc)}</div>
                            <div className="text-xs text-gray-400">{jobTimes(job.id).reduce((s,t)=>s+t.hours,0)}h {isIS?'samtals':'total'}</div>
                          </div>
                          <div className="bg-amber-50 rounded-xl p-3">
                            <div className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Package className="w-3 h-3"/>{isIS?'Efniskostnaður':'Materials cost'}</div>
                            <div className="text-lg font-bold text-amber-700">{fmt(mc)}</div>
                          </div>
                          <div className="bg-gray-100 rounded-xl p-3">
                            <div className="text-xs text-gray-500 mb-1">{isIS?'Heildarkostnaður':'Total cost'}</div>
                            <div className="text-lg font-bold text-gray-800">{fmt(tc)}</div>
                          </div>
                          <div className={`rounded-xl p-3 col-span-2 ${pr >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                            <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                              {pr >= 0 ? <TrendingUp className="w-3 h-3 text-green-600"/> : <AlertCircle className="w-3 h-3 text-red-500"/>}
                              {isIS?'Framlegð / hagnaður':'Margin / profit'}
                            </div>
                            <div className={`text-xl font-bold ${pr >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                              {pr >= 0 ? '+' : ''}{fmt(pr)}
                            </div>
                            {(job.quotedAmount ?? 0) > 0 && (
                              <div className={`text-xs font-medium ${pr >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {Math.round(pr / (job.quotedAmount ?? 1) * 100)}% {isIS?'af tilboði':'of quoted'}
                              </div>
                            )}
                          </div>
                        </div>
                        {job.description && <p className="text-xs text-gray-500 mt-3 bg-gray-50 rounded-lg px-3 py-2">{job.description}</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Job Form Modal ───────────────────────────────────── */}
      {jobForm.open && jobForm.job && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full md:max-w-xl md:rounded-2xl rounded-t-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
              <h2 className="font-semibold">{jobForm.job.id ? (isIS?'Breyta verkefni':'Edit job') : (isIS?'Nýtt verkefni':'New job')}</h2>
              <button onClick={() => setJobForm({open:false})}><X className="w-5 h-5 text-gray-400"/></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Heiti verkefnis':'Job name'} *</label>
                  <input className={inp} value={jobForm.job.name??''} onChange={e => setJobForm(f=>({...f,job:{...f.job!,name:e.target.value}}))} placeholder={isIS?'t.d. Kringlan 3. hæð viðbygging':'e.g. Office extension - North block'} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Viðskiptavinur':'Client'} *</label>
                  <input className={inp} value={jobForm.job.clientName??''} onChange={e => setJobForm(f=>({...f,job:{...f.job!,clientName:e.target.value}}))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Staða':'Status'}</label>
                  <select className={inp} value={jobForm.job.status??'active'} onChange={e => setJobForm(f=>({...f,job:{...f.job!,status:e.target.value as JobStatus}}))}>
                    <option value="quote">{isIS?'Tilboð':'Quote'}</option>
                    <option value="active">{isIS?'Virkt':'Active'}</option>
                    <option value="paused">{isIS?'Í bið':'Paused'}</option>
                    <option value="complete">{isIS?'Lokið':'Complete'}</option>
                    <option value="cancelled">{isIS?'Afturkallað':'Cancelled'}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Tilboðsverð':'Quoted amount'}</label>
                  <input type="number" min="0" className={inp} value={jobForm.job.quotedAmount??0} onChange={e => setJobForm(f=>({...f,job:{...f.job!,quotedAmount:parseFloat(e.target.value)||0}}))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Gjaldmiðill':'Currency'}</label>
                  <select className={inp} value={jobForm.job.currency??'ISK'} onChange={e => setJobForm(f=>({...f,job:{...f.job!,currency:e.target.value as Currency}}))}>
                    {['ISK','EUR','USD','GBP','DKK','NOK','SEK'].map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Upphafsdagur':'Start date'}</label>
                  <input type="date" className={inp} value={jobForm.job.startDate??''} onChange={e => setJobForm(f=>({...f,job:{...f.job!,startDate:e.target.value}}))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Skiladagur':'End date'}</label>
                  <input type="date" className={inp} value={jobForm.job.endDate??''} onChange={e => setJobForm(f=>({...f,job:{...f.job!,endDate:e.target.value}}))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Staðsetning':'Address / location'}</label>
                  <input className={inp} value={jobForm.job.address??''} onChange={e => setJobForm(f=>({...f,job:{...f.job!,address:e.target.value}}))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Netfang viðskiptavinar':'Client email'}</label>
                  <input type="email" className={inp} value={jobForm.job.clientEmail??''} onChange={e => setJobForm(f=>({...f,job:{...f.job!,clientEmail:e.target.value}}))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Sími':'Phone'}</label>
                  <input type="tel" className={inp} value={jobForm.job.clientPhone??''} onChange={e => setJobForm(f=>({...f,job:{...f.job!,clientPhone:e.target.value}}))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Lýsing':'Description'}</label>
                  <textarea className={inp} rows={2} value={jobForm.job.description??''} onChange={e => setJobForm(f=>({...f,job:{...f.job!,description:e.target.value}}))} />
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setJobForm({open:false})} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm">{isIS?'Hætta við':'Cancel'}</button>
                <button onClick={saveJob} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700">{isIS?'Vista':'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Time Entry Modal ─────────────────────────────────── */}
      {timeForm.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full md:max-w-sm md:rounded-2xl rounded-t-2xl shadow-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-blue-500"/><h2 className="font-semibold">{isIS?'Skrá tíma':'Log time'}</h2></div>
              <button onClick={() => setTimeForm(v=>({...v,open:false}))}><X className="w-5 h-5 text-gray-400"/></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Dagsetning':'Date'}</label>
                <input type="date" className={inp} value={timeForm.entry?.date??todayISO()} onChange={e=>setTimeForm(v=>({...v,entry:{...v.entry!,date:e.target.value}}))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Starfsmaður':'Employee name'}</label>
                <input className={inp} value={timeForm.entry?.employeeName??''} onChange={e=>setTimeForm(v=>({...v,entry:{...v.entry!,employeeName:e.target.value}}))} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Tímar':'Hours'}</label>
                  <input type="number" min="0.5" step="0.5" max="24" className={inp} value={timeForm.entry?.hours??8} onChange={e=>setTimeForm(v=>({...v,entry:{...v.entry!,hours:parseFloat(e.target.value)||0}}))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Tímagjald (kostnaður)':'Hourly rate (cost)'}</label>
                  <input type="number" min="0" step="100" className={inp} value={timeForm.entry?.hourlyRate??0} onChange={e=>setTimeForm(v=>({...v,entry:{...v.entry!,hourlyRate:parseFloat(e.target.value)||0}}))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Lýsing':'Description'}</label>
                <input className={inp} value={timeForm.entry?.description??''} onChange={e=>setTimeForm(v=>({...v,entry:{...v.entry!,description:e.target.value}}))} />
              </div>
              <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700 font-medium">
                {isIS?'Samtals':'Total'}: {fmt((timeForm.entry?.hours??0)*(timeForm.entry?.hourlyRate??0))}
              </div>
              <div className="flex gap-3">
                <button onClick={()=>setTimeForm(v=>({...v,open:false}))} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm">{isIS?'Hætta við':'Cancel'}</button>
                <button onClick={saveTime} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700">{isIS?'Vista':'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Material Modal ───────────────────────────────────── */}
      {matForm.open && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white w-full md:max-w-sm md:rounded-2xl rounded-t-2xl shadow-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2"><Package className="w-4 h-4 text-amber-500"/><h2 className="font-semibold">{isIS?'Bæta við efni':'Add material'}</h2></div>
              <button onClick={()=>setMatForm(v=>({...v,open:false}))}><X className="w-5 h-5 text-gray-400"/></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Dagsetning':'Date'}</label>
                <input type="date" className={inp} value={matForm.mat?.date??todayISO()} onChange={e=>setMatForm(v=>({...v,mat:{...v.mat!,date:e.target.value}}))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Lýsing efnis':'Material description'}</label>
                <input className={inp} value={matForm.mat?.description??''} onChange={e=>setMatForm(v=>({...v,mat:{...v.mat!,description:e.target.value}}))} autoFocus placeholder={isIS?'t.d. Einangrun, 100mm þykkt':'e.g. Insulation 100mm'} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Magn':'Qty'}</label>
                  <input type="number" min="0" step="0.1" className={inp} value={matForm.mat?.qty??1} onChange={e=>setMatForm(v=>({...v,mat:{...v.mat!,qty:parseFloat(e.target.value)||0}}))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Eining':'Unit'}</label>
                  <select className={inp} value={matForm.mat?.unit??'pcs'} onChange={e=>setMatForm(v=>({...v,mat:{...v.mat!,unit:e.target.value}}))}>
                    {['pcs','kg','m','m²','m³','L','box','bag','roll','set'].map(u=><option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Einingaverð':'Unit cost'}</label>
                  <input type="number" min="0" step="1" className={inp} value={matForm.mat?.unitCost??0} onChange={e=>setMatForm(v=>({...v,mat:{...v.mat!,unitCost:parseFloat(e.target.value)||0}}))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{isIS?'Birgir / tilvísun':'Supplier / reference'}</label>
                <input className={inp} value={matForm.mat?.supplierName??''} onChange={e=>setMatForm(v=>({...v,mat:{...v.mat!,supplierName:e.target.value}}))} />
              </div>
              <div className="bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-700 font-medium">
                {isIS?'Samtals':'Total'}: {fmt((matForm.mat?.qty??0)*(matForm.mat?.unitCost??0))}
              </div>
              <div className="flex gap-3">
                <button onClick={()=>setMatForm(v=>({...v,open:false}))} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm">{isIS?'Hætta við':'Cancel'}</button>
                <button onClick={saveMat} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700">{isIS?'Vista':'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
