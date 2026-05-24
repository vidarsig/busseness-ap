import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, X, CheckCircle2, Circle, ClipboardList, ArrowRight, AlertTriangle, Clock } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { Task, TaskPriority, TaskStatus, View } from '../types';

function newId() { return `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

const today = () => new Date().toISOString().split('T')[0];

function dueBadge(dueDate: string | undefined, status: TaskStatus, lang: string) {
  if (!dueDate || status === 'done') return null;
  const diff = Math.floor((new Date(dueDate).getTime() - new Date(today()).getTime()) / 86400000);
  if (diff < 0)  return { label: lang === 'is' ? 'Útrunnið' : 'Overdue',   cls: 'bg-red-100 text-red-700' };
  if (diff === 0) return { label: lang === 'is' ? 'Í dag' : 'Due today',   cls: 'bg-orange-100 text-orange-700' };
  if (diff <= 3)  return { label: lang === 'is' ? `${diff}d` : `${diff}d`, cls: 'bg-yellow-100 text-yellow-700' };
  return null;
}

const PRIORITY_ORDER: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

const LINKED_VIEWS: { value: View | ''; labelIs: string; labelEn: string }[] = [
  { value: '',          labelIs: 'Enginn',         labelEn: 'None' },
  { value: 'dashboard', labelIs: 'Yfirlit',        labelEn: 'Dashboard' },
  { value: 'transactions', labelIs: 'Færslur',     labelEn: 'Transactions' },
  { value: 'bankimport', labelIs: 'Bankaimport',   labelEn: 'Bank Import' },
  { value: 'invoices',  labelIs: 'Reikningar',     labelEn: 'Invoices' },
  { value: 'vatreturn', labelIs: 'VSK-skýrsla',    labelEn: 'VAT Return' },
  { value: 'payroll',   labelIs: 'Laun',           labelEn: 'Payroll' },
  { value: 'reports',   labelIs: 'Skýrslur',       labelEn: 'Reports' },
  { value: 'settings',  labelIs: 'Stillingar',     labelEn: 'Settings' },
];

function TaskModal({ initial, onSave, onClose }: {
  initial?: Task; onSave: (t: Task) => void; onClose: () => void;
}) {
  const { t, lang } = useApp();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? '');
  const [priority, setPriority] = useState<TaskPriority>(initial?.priority ?? 'medium');
  const [linkedView, setLinkedView] = useState<View | ''>(initial?.linkedView ?? '');

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lbl = 'block text-xs font-medium text-gray-600 mb-1';

  function handleSave() {
    const task: Task = {
      id: initial?.id ?? newId(),
      title: title.trim(),
      note: note.trim() || undefined,
      dueDate: dueDate || undefined,
      priority,
      status: initial?.status ?? 'open',
      linkedView: linkedView || undefined,
      createdAt: initial?.createdAt ?? today(),
      completedAt: initial?.completedAt,
    };
    onSave(task);
  }

  const priorityBtn = (p: TaskPriority, labelIs: string, labelEn: string, color: string) => (
    <button type="button" onClick={() => setPriority(p)}
      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${priority === p ? `${color} text-white border-transparent` : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
      {lang === 'is' ? labelIs : labelEn}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50">
      <div className="bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-blue-600" />
            {initial ? t('editTask') : t('addTask')}
          </h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className={lbl}>{t('taskTitle')} *</label>
            <input className={inp} value={title} onChange={e => setTitle(e.target.value)} autoFocus
              placeholder={lang === 'is' ? 't.d. Skila VSK-skýrslu, Senda reikning...' : 'e.g. Submit VAT return, Send invoice...'} />
          </div>
          <div>
            <label className={lbl}>{t('taskNote')}</label>
            <textarea className={inp + ' resize-none'} rows={2} value={note} onChange={e => setNote(e.target.value)}
              placeholder={lang === 'is' ? 'Valfrjálst...' : 'Optional...'} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>{t('taskDueDate')}</label>
              <input type="date" className={inp} value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className={lbl}>{t('taskLinkedView')}</label>
              <select className={inp} value={linkedView} onChange={e => setLinkedView(e.target.value as View | '')}>
                {LINKED_VIEWS.map(v => (
                  <option key={v.value} value={v.value}>{lang === 'is' ? v.labelIs : v.labelEn}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={lbl}>{t('taskPriority')}</label>
            <div className="flex gap-2">
              {priorityBtn('high',   'Hár',   'High',   'bg-red-500')}
              {priorityBtn('medium', 'Meðal', 'Medium', 'bg-orange-400')}
              {priorityBtn('low',    'Lágur', 'Low',    'bg-gray-400')}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 border border-gray-300 py-3 rounded-xl text-sm">{t('cancel')}</button>
            <button onClick={handleSave} disabled={!title.trim()}
              className="flex-1 bg-blue-600 text-white py-3 rounded-xl text-sm disabled:opacity-40">{t('save')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Props { setView: (v: View) => void; }

export default function Tasks({ setView }: Props) {
  const { data, dispatch, t, lang } = useApp();
  const [modal, setModal] = useState<{ open: boolean; task?: Task }>({ open: false });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open');

  function handleSave(task: Task) {
    dispatch(data.tasks.find(t => t.id === task.id)
      ? { type: 'UPDATE_TASK', payload: task }
      : { type: 'ADD_TASK', payload: task });
    setModal({ open: false });
  }

  function toggleDone(task: Task) {
    dispatch({ type: 'UPDATE_TASK', payload: {
      ...task,
      status: task.status === 'done' ? 'open' : 'done',
      completedAt: task.status === 'done' ? undefined : today(),
    }});
  }

  const sorted = useMemo(() => {
    return [...data.tasks]
      .filter(t => filter === 'all' ? true : t.status === filter)
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
        const pa = PRIORITY_ORDER[a.priority], pb = PRIORITY_ORDER[b.priority];
        if (pa !== pb) return pa - pb;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return a.createdAt.localeCompare(b.createdAt);
      });
  }, [data.tasks, filter]);

  const openCount = data.tasks.filter(t => t.status === 'open').length;
  const overdueCount = data.tasks.filter(t => t.status === 'open' && t.dueDate && t.dueDate < today()).length;

  const priorityCls: Record<TaskPriority, string> = {
    high:   'bg-red-500',
    medium: 'bg-orange-400',
    low:    'bg-gray-300',
  };
  const priorityLabel: Record<TaskPriority, string> = {
    high:   lang === 'is' ? 'Hár' : 'High',
    medium: lang === 'is' ? 'Meðal' : 'Medium',
    low:    lang === 'is' ? 'Lágur' : 'Low',
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-blue-600" />
            {t('tasks')}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {openCount} {lang === 'is' ? 'opin' : 'open'}
            {overdueCount > 0 && <span className="text-red-600 ml-2">· {overdueCount} {lang === 'is' ? 'útrunnin' : 'overdue'}</span>}
          </p>
        </div>
        <button onClick={() => setModal({ open: true })}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium">
          <Plus className="w-4 h-4" /><span className="hidden sm:inline">{t('addTask')}</span>
        </button>
      </div>

      {/* Stats */}
      {data.tasks.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">{t('openTasks')}</p>
            <p className="text-2xl font-bold text-blue-700">{openCount}</p>
          </div>
          <div className={`rounded-xl border p-3 ${overdueCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
            <p className={`text-xs ${overdueCount > 0 ? 'text-red-600' : 'text-gray-500'}`}>{t('taskOverdue')}</p>
            <p className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-700' : 'text-gray-400'}`}>{overdueCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">{t('completedTasks')}</p>
            <p className="text-2xl font-bold text-green-700">{data.tasks.filter(t => t.status === 'done').length}</p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4 w-fit">
        {(['open', 'done', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === f ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {f === 'open' ? t('taskOpen') : f === 'done' ? t('taskDone') : (lang === 'is' ? 'Allt' : 'All')}
          </button>
        ))}
      </div>

      {/* Task list */}
      {sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-14 text-center">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 text-sm font-medium">{t('noTasks')}</p>
          <p className="text-gray-400 text-xs mt-1 mb-4">
            {lang === 'is' ? 'Bættu við verkefni til að fylgjast með bókhalds-skyldum' : 'Add tasks to track your accounting to-dos'}
          </p>
          <button onClick={() => setModal({ open: true })}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {t('addTask')}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(task => {
            const badge = dueBadge(task.dueDate, task.status, lang);
            const isOverdue = task.status === 'open' && task.dueDate && task.dueDate < today();
            return (
              <div key={task.id}
                className={`bg-white rounded-xl border p-4 flex gap-3 items-start transition-opacity ${task.status === 'done' ? 'opacity-60' : ''} ${isOverdue ? 'border-red-200' : 'border-gray-200'}`}>
                {/* Checkbox */}
                <button onClick={() => toggleDone(task)} className="mt-0.5 flex-shrink-0 text-gray-400 hover:text-blue-600 transition-colors">
                  {task.status === 'done'
                    ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                    : <Circle className="w-5 h-5" />}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    {/* Priority dot */}
                    <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${priorityCls[task.priority]}`} title={priorityLabel[task.priority]} />
                    <span className={`font-medium text-sm ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                      {task.title}
                    </span>
                    {badge && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${badge.cls}`}>
                        {isOverdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {badge.label}
                      </span>
                    )}
                  </div>
                  {task.note && <p className="text-xs text-gray-500 mt-1 ml-4">{task.note}</p>}
                  <div className="flex items-center gap-3 mt-2 ml-4 flex-wrap">
                    {task.dueDate && (
                      <span className="text-xs text-gray-400">
                        {lang === 'is' ? 'Skiladagur' : 'Due'}: {task.dueDate}
                      </span>
                    )}
                    {task.completedAt && (
                      <span className="text-xs text-green-600">
                        ✓ {task.completedAt}
                      </span>
                    )}
                    {task.linkedView && (
                      <button onClick={() => setView(task.linkedView!)}
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                        <ArrowRight className="w-3 h-3" />
                        {LINKED_VIEWS.find(v => v.value === task.linkedView)?.[lang === 'is' ? 'labelIs' : 'labelEn'] ?? task.linkedView}
                      </button>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => setModal({ open: true, task })}
                    className="text-gray-400 hover:text-blue-600 p-1 rounded">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleteId(task.id)}
                    className="text-gray-400 hover:text-red-600 p-1 rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal.open && <TaskModal initial={modal.task} onSave={handleSave} onClose={() => setModal({ open: false })} />}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold mb-2">{t('warning')}</h3>
            <p className="text-sm text-gray-600 mb-5">{t('confirmDelete')}</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 border border-gray-300 py-2 rounded-xl text-sm">{t('cancel')}</button>
              <button onClick={() => { dispatch({ type: 'DELETE_TASK', payload: deleteId }); setDeleteId(null); }}
                className="flex-1 bg-red-600 text-white py-2 rounded-xl text-sm">{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
