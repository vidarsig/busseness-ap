import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import {
  Users as UsersIcon, UserPlus, Shield, Edit2, Trash2, X, Check,
  UserCircle, Crown, Briefcase, Calculator, HardHat, Eye,
} from 'lucide-react';
import { AppUser, UserRole, UserPermissions, DEFAULT_PERMISSIONS, View } from '../types';
import { canAccessView } from '../utils/access';
import type { SessionUser } from '../App';

interface Props { sessionUser?: SessionUser | null; }

const ROLE_ICONS: Record<UserRole, React.ElementType> = {
  owner: Crown, manager: Briefcase, accountant: Calculator, staff: HardHat, viewer: Eye,
};

const ROLE_COLORS: Record<UserRole, string> = {
  owner:     'bg-yellow-900/50 text-yellow-300 border border-yellow-700',
  manager:   'bg-blue-900/50 text-blue-300 border border-blue-700',
  accountant:'bg-purple-900/50 text-purple-300 border border-purple-700',
  staff:     'bg-green-900/50 text-green-300 border border-green-700',
  viewer:    'bg-slate-800 text-slate-400 border border-slate-600',
};

const PERMISSION_LABELS: { key: keyof UserPermissions; labelEn: string; labelIs: string }[] = [
  { key: 'canViewFinancials',    labelEn: 'View financials',       labelIs: 'Sjá fjármál' },
  { key: 'canEditTransactions',  labelEn: 'Edit transactions',     labelIs: 'Breyta færslum' },
  { key: 'canViewPayroll',       labelEn: 'View payroll',          labelIs: 'Sjá launaskrá' },
  { key: 'canEditPayroll',       labelEn: 'Edit payroll',          labelIs: 'Breyta launum' },
  { key: 'canViewInvoices',      labelEn: 'View invoices',         labelIs: 'Sjá reikninga' },
  { key: 'canEditInvoices',      labelEn: 'Edit invoices',         labelIs: 'Breyta reikningum' },
  { key: 'canViewStock',         labelEn: 'View stock',            labelIs: 'Sjá birgðir' },
  { key: 'canEditStock',         labelEn: 'Edit stock',            labelIs: 'Breyta birgðum' },
  { key: 'canViewJobs',          labelEn: 'View jobs',             labelIs: 'Sjá verkefni' },
  { key: 'canEditJobs',          labelEn: 'Edit jobs',             labelIs: 'Breyta verkefnum' },
  { key: 'canLogTime',           labelEn: 'Log time',              labelIs: 'Skrá tíma' },
  { key: 'canApproveJobReports', labelEn: 'Approve & invoice jobs', labelIs: 'Samþykkja & reikningsfæra verk' },
  { key: 'canViewSettings',      labelEn: 'View settings',         labelIs: 'Sjá stillingar' },
  { key: 'canExportData',        labelEn: 'Export data',           labelIs: 'Flytja út gögn' },
];

// Every screen the owner can turn on/off per user (in addition to the grouped
// permissions above). Order roughly follows the nav.
const SCREEN_VIEWS: { view: View; is: string; en: string }[] = [
  { view: 'transactions', is: 'Færslur',         en: 'Transactions' },
  { view: 'recurring',    is: 'Endurteknar',     en: 'Recurring' },
  { view: 'bankimport',   is: 'Bankaimport',     en: 'Bank import' },
  { view: 'rules',        is: 'Flokkunarreglur', en: 'Rules' },
  { view: 'invoices',     is: 'Reikningar',      en: 'Invoices' },
  { view: 'jobs',         is: 'Verkbókhald',     en: 'Work Book' },
  { view: 'stock',        is: 'Birgðir',         en: 'Stock' },
  { view: 'contacts',     is: 'Tengiliðir',      en: 'Contacts' },
  { view: 'accounts',     is: 'Reikningslykill', en: 'Chart of accounts' },
  { view: 'budget',       is: 'Áætlun',          en: 'Budget' },
  { view: 'payroll',      is: 'Laun',            en: 'Payroll' },
  { view: 'vat',          is: 'VSK',             en: 'VAT' },
  { view: 'vatreturn',    is: 'VSK-skýrsla',     en: 'VAT return' },
  { view: 'reports',      is: 'Skýrslur',        en: 'Reports' },
  { view: 'annual',       is: 'Ársreikningur',   en: 'Annual accounts' },
  { view: 'ai',           is: 'AI aðstoðarmaður', en: 'AI assistant' },
  { view: 'reviews',      is: 'Umsagnastjórnun', en: 'Reviews' },
  { view: 'tasks',        is: 'Verkefnalisti',   en: 'Tasks' },
  { view: 'settings',     is: 'Stillingar',      en: 'Settings' },
  { view: 'users',        is: 'Notendur',        en: 'Users' },
];

const ROLES: UserRole[] = ['owner', 'manager', 'accountant', 'staff', 'viewer'];

function newId() { return crypto.randomUUID(); }

const blankUser = (): Omit<AppUser, 'id' | 'createdAt'> => ({
  email: '', name: '', role: 'staff', isActive: true,
  permissions: { ...DEFAULT_PERMISSIONS.staff },
});

export default function Users({ sessionUser }: Props) {
  const { data, dispatch } = useApp();
  const lang = data.settings.language;
  const t = (is: string, en: string) => lang === 'is' ? is : en;

  const users = data.appUsers ?? [];

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [form, setForm] = useState(blankUser());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  function openAdd() {
    setEditing(null);
    setForm(blankUser());
    setShowModal(true);
  }

  function openEdit(u: AppUser) {
    setEditing(u);
    setForm({ email: u.email, name: u.name, role: u.role, isActive: u.isActive, permissions: { ...u.permissions } });
    setShowModal(true);
  }

  function handleRoleChange(role: UserRole) {
    setForm(f => ({ ...f, role, permissions: { ...DEFAULT_PERMISSIONS[role] } }));
  }

  function togglePerm(key: keyof UserPermissions) {
    setForm(f => ({ ...f, permissions: { ...f.permissions, [key]: !f.permissions[key] } }));
  }

  // Turn a single screen on/off. Records an explicit override vs the current
  // effective access (so a tick means "definitely allow", untick "definitely deny").
  function toggleScreen(view: View) {
    setForm(f => {
      const current = canAccessView(view, f.permissions);
      return { ...f, permissions: { ...f.permissions, viewOverrides: { ...(f.permissions.viewOverrides ?? {}), [view]: !current } } };
    });
  }

  function save() {
    if (!form.name.trim() || !form.email.trim()) return;
    if (editing) {
      dispatch({ type: 'UPDATE_APP_USER', payload: { ...editing, ...form } });
    } else {
      const nu: AppUser = {
        id: newId(), createdAt: new Date().toISOString(), ...form,
      };
      dispatch({ type: 'ADD_APP_USER', payload: nu });
    }
    setShowModal(false);
  }

  function deleteUser(id: string) {
    dispatch({ type: 'DELETE_APP_USER', payload: id });
    setDeleteConfirm(null);
  }

  const RoleBadge = ({ role }: { role: UserRole }) => {
    const Icon = ROLE_ICONS[role];
    return (
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[role]}`}>
        <Icon className="w-3 h-3" />
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <UsersIcon className="w-5 h-5 text-blue-600" />
            {t('Notendur', 'Users')}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t('Stjórnaðu notendum og heimildum', 'Manage users and permissions')}
          </p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition">
          <UserPlus className="w-4 h-4" />
          {t('Bæta við notanda', 'Add user')}
        </button>
      </div>

      {/* Info card */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-600" />
          <div>
            <strong>{t('Supabase krafist', 'Supabase required')} — </strong>
            {t(
              'Þessir notendur eru vistaðir í Jobboks gagnagrunni. Þeir þurfa Supabase innskráningu til að nota appið.',
              'These users are stored in the Jobboks database. They need Supabase authentication to log into the app.'
            )}
          </div>
        </div>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {ROLES.map(role => {
          const Icon = ROLE_ICONS[role];
          const defaults = DEFAULT_PERMISSIONS[role];
          const permCount = Object.values(defaults).filter(Boolean).length;
          return (
            <div key={role} className="bg-white rounded-xl border border-gray-200 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs font-semibold text-gray-700 capitalize">{role}</span>
              </div>
              <p className="text-[10px] text-gray-400">{permCount}/{PERMISSION_LABELS.length} permissions</p>
            </div>
          );
        })}
      </div>

      {/* Users list */}
      {users.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <UserCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            {t('Engir notendur skráðir. Bættu við fyrsta notandanum.', 'No users added yet. Add your first user.')}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {t('Nafn', 'Name')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">
                  {t('Netfang', 'Email')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {t('Hlutverk', 'Role')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">
                  {t('Staða', 'Status')}
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {t('Aðgerðir', 'Actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(user => (
                <tr key={user.id} className={`hover:bg-gray-50 transition ${!user.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-xs flex-shrink-0">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900">{user.name}</span>
                      {sessionUser && user.email === sessionUser.email && (
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                          {t('þú', 'you')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{user.email}</td>
                  <td className="px-4 py-3"><RoleBadge role={user.role} /></td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                      user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                    }`}>
                      {user.isActive ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      {user.isActive ? t('Virkur', 'Active') : t('Óvirkur', 'Inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {deleteConfirm === user.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-xs text-red-600">{t('Eyða?', 'Delete?')}</span>
                        <button onClick={() => deleteUser(user.id)}
                          className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition">
                          {t('Já', 'Yes')}
                        </button>
                        <button onClick={() => setDeleteConfirm(null)}
                          className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition">
                          {t('Nei', 'No')}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(user)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteConfirm(user.id)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-600 transition">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add/Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">
                {editing ? t('Breyta notanda', 'Edit user') : t('Nýr notandi', 'New user')}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Name & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('Nafn *', 'Name *')}
                  </label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={t('Fullt nafn', 'Full name')} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('Netfang *', 'Email *')}
                  </label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="name@company.com" />
                </div>
              </div>

              {/* Role selector */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  {t('Hlutverk', 'Role')}
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {ROLES.map(role => {
                    const Icon = ROLE_ICONS[role];
                    const isSelected = form.role === role;
                    return (
                      <button key={role} type="button" onClick={() => handleRoleChange(role)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 text-xs font-medium transition ${
                          isSelected ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 hover:border-gray-300 text-gray-500'
                        }`}>
                        <Icon className="w-4 h-4" />
                        <span className="capitalize">{role}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  {t('Virkur notandi', 'Active user')}
                </label>
                <button type="button" onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                  className={`relative w-11 h-6 rounded-full transition-colors ${form.isActive ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.isActive ? 'translate-x-5' : ''}`} />
                </button>
              </div>

              {/* Permissions */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-gray-500" />
                  <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    {t('Heimildir', 'Permissions')}
                  </label>
                  <span className="text-[10px] text-gray-400">
                    {t('(Hægt er að sérsníða)', '(customisable)')}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-3">
                  {PERMISSION_LABELS.map(({ key, labelEn, labelIs }) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" checked={!!form.permissions[key]}
                        onChange={() => togglePerm(key)}
                        className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300" />
                      <span className="text-xs text-gray-600 group-hover:text-gray-900">
                        {lang === 'is' ? labelIs : labelEn}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Per-screen access — a checkbox for every screen */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-gray-500" />
                  <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    {lang === 'is' ? 'Aðgangur að skjám' : 'Screen access'}
                  </label>
                  <span className="text-[10px] text-gray-400">{lang === 'is' ? '(hver skjár fyrir sig)' : '(each screen)'}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-1 gap-x-3">
                  {SCREEN_VIEWS.map(({ view, is, en }) => (
                    <label key={view} className="flex items-center gap-2 cursor-pointer group">
                      <input type="checkbox" checked={canAccessView(view, form.permissions)}
                        onChange={() => toggleScreen(view)}
                        className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300" />
                      <span className="text-xs text-gray-600 group-hover:text-gray-900">{lang === 'is' ? is : en}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                {t('Hætta við', 'Cancel')}
              </button>
              <button onClick={save} disabled={!form.name.trim() || !form.email.trim()}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition disabled:opacity-50">
                {editing ? t('Vista breytingar', 'Save changes') : t('Bæta við', 'Add user')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
