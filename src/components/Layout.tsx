import { useState, useEffect } from 'react';
import {
  BookOpen, LayoutDashboard, List, Calculator, BarChart2, FileText,
  Settings, Globe, Menu, X, RefreshCw, Upload, Receipt,
  BookMarked, TrendingUp, Users, ClipboardList, Zap, CheckSquare,
  Cloud, CloudOff, Loader2, Bot, Package, HardHat, LogOut, UserCircle, Crown, Star,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { signOut } from '../utils/supabase';
import { View, UserPermissions } from '../types';
import { canAccessView } from '../utils/access';
import type { SessionUser } from '../App';

interface Props {
  view: View;
  setView: (v: View) => void;
  children: React.ReactNode;
  sessionUser?: SessionUser | null;
  perms?: UserPermissions | null;
  onSignOut?: () => void;
}

interface NavItem { id: View; icon: React.ElementType; }
interface NavSection { label?: string; labelKey?: string; items: NavItem[]; }

const sections: NavSection[] = [
  { items: [{ id: 'dashboard', icon: LayoutDashboard }] },
  { labelKey: 'navTransactions', items: [
    { id: 'transactions', icon: List },
    { id: 'recurring', icon: RefreshCw },
    { id: 'bankimport', icon: Upload },
    { id: 'rules', icon: Zap },
  ]},
  { labelKey: 'navSales', items: [
    { id: 'invoices', icon: Receipt },
    { id: 'jobs', icon: HardHat },
    { id: 'stock', icon: Package },
  ]},
  { labelKey: 'navAccounting', items: [
    { id: 'accounts', icon: BookMarked },
    { id: 'budget', icon: TrendingUp },
    { id: 'payroll', icon: Users },
  ]},
  { labelKey: 'navReports', items: [
    { id: 'vat', icon: Calculator },
    { id: 'vatreturn', icon: ClipboardList },
    { id: 'reports', icon: BarChart2 },
    { id: 'annual', icon: FileText },
  ]},
  { labelKey: 'tasks', items: [
    { id: 'tasks', icon: CheckSquare },
  ]},
  { label: 'AI', items: [
    { id: 'ai', icon: Bot },
    { id: 'reviews', icon: Star },
  ]},
  { items: [{ id: 'settings', icon: Settings }] },
  { items: [{ id: 'users', icon: Users }] },
];

const bottomNavItems: NavItem[] = [
  { id: 'dashboard', icon: LayoutDashboard },
  { id: 'transactions', icon: List },
  { id: 'invoices', icon: Receipt },
  { id: 'reports', icon: BarChart2 },
  { id: 'settings', icon: Settings },
];

function SyncIndicator() {
  const { syncStatus, lastSyncedAt, syncNow, data } = useApp();
  if (!data.settings.supabaseUrl) return null;
  const icon = syncStatus === 'syncing'
    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
    : syncStatus === 'error'
    ? <CloudOff className="w-3.5 h-3.5 text-red-500" />
    : <Cloud className="w-3.5 h-3.5 text-blue-500" />;
  const title = syncStatus === 'syncing' ? 'Syncing…'
    : syncStatus === 'error' ? 'Sync error'
    : lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : 'Cloud sync';
  return (
    <button onClick={syncNow} title={title}
      className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 flex items-center">
      {icon}
    </button>
  );
}

export default function Layout({ view, setView, children, sessionUser, perms, onSignOut }: Props) {
  const { t, lang, setLang, data } = useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const companyName = data.settings.company.name || t('appName');
  const supabaseConfigured = !!(data.settings.supabaseUrl && data.settings.supabaseKey);

  async function handleSignOut() {
    if (data.settings.supabaseUrl && data.settings.supabaseKey) {
      await signOut(data.settings.supabaseUrl, data.settings.supabaseKey);
    }
    onSignOut?.();
  }

  useEffect(() => { setDrawerOpen(false); }, [view]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const NavContent = () => (
    <>
      {/* Logo / company */}
      <div className="px-4 py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-4.5 h-4.5 text-white w-[18px] h-[18px]" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-blue-600 tracking-wide uppercase">Jobboks</div>
            <div className="text-sm font-semibold text-gray-800 leading-tight truncate">{companyName}</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-3 px-2 overflow-y-auto">
        {sections.map((section, si) => {
          const items = section.items.filter(item =>
            (item.id !== 'users' || supabaseConfigured) &&
            canAccessView(item.id, perms ?? null),
          );
          if (items.length === 0) return null;
          return (
          <div key={si} className={si > 0 ? 'mt-1' : ''}>
            {section.labelKey && (
              <div className="px-3 pt-3 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                {t(section.labelKey as never)}
              </div>
            )}
            {items.map(({ id, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-all ${
                  view === id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {t(id)}
              </button>
            ))}
            {section.labelKey && <div className="mx-3 mt-1 border-t border-gray-100" />}
          </div>
          );
        })}
      </nav>

      {/* Upgrade CTA */}
      {data.settings.plan === 'free' && (
        <div className="px-3 py-2 flex-shrink-0">
          <button onClick={() => setView('upgrade' as View)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white text-xs font-semibold shadow-sm transition">
            <Crown className="w-3.5 h-3.5 flex-shrink-0" />
            {lang === 'is' ? 'Uppfæra í Pro' : 'Upgrade to Pro'}
          </button>
        </div>
      )}

      {/* Logged-in user */}
      {sessionUser && (
        <div className="px-4 py-2 border-t border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <UserCircle className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-800 truncate">{sessionUser.name}</div>
              <div className="text-[10px] text-gray-400 truncate">{sessionUser.email}</div>
            </div>
            <button onClick={handleSignOut} title="Sign out"
              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500 transition-colors">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0 flex items-center gap-2">
        <button
          onClick={() => setLang(lang === 'is' ? 'en' : 'is')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 text-sm transition-colors flex-1"
        >
          <Globe className="w-4 h-4" />
          {lang === 'is' ? 'English' : 'Íslenska'}
        </button>
        <SyncIndicator />
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-gray-200 flex-shrink-0 h-screen sticky top-0 no-print">
        <NavContent />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 shadow-sm no-print">
        <button onClick={() => setDrawerOpen(true)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Menu">
          <Menu className="w-6 h-6" />
        </button>
        <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center flex-shrink-0">
          <BookOpen className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-bold text-blue-600 text-sm tracking-wide uppercase flex-shrink-0">Jobboks</span>
        <span className="text-gray-400 text-sm truncate flex-1">{companyName !== 'Jobboks' ? companyName : ''}</span>
        <button
          onClick={() => setLang(lang === 'is' ? 'en' : 'is')}
          className="p-1 rounded-lg hover:bg-gray-100 flex items-center gap-1 text-gray-500 text-xs"
        >
          <Globe className="w-4 h-4" />
          {lang === 'is' ? 'EN' : 'IS'}
        </button>
        <SyncIndicator />
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex no-print">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="relative flex flex-col w-72 max-w-[85vw] bg-white h-full shadow-2xl animate-slide-in">
            <button onClick={() => setDrawerOpen(false)} className="absolute top-4 right-4 text-blue-300 hover:text-white p-1" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
            <NavContent />
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="md:hidden h-14" />
        <div className="max-w-6xl mx-auto p-4 md:p-6 pb-24 md:pb-6">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 flex no-print safe-area-pb">
        {bottomNavItems.filter(item => canAccessView(item.id, perms ?? null)).map(({ id, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 ${
              view === id ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-tight">{t(id)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
