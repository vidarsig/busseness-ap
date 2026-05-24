import { useState, useEffect } from 'react';
import {
  BookOpen, LayoutDashboard, List, Calculator, BarChart2, FileText,
  Settings, Globe, Menu, X, RefreshCw, Upload, Receipt,
  BookMarked, TrendingUp, Users, ClipboardList, Zap, CheckSquare,
  Cloud, CloudOff, Loader2, Bot, Package, HardHat,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { View } from '../types';

interface Props { view: View; setView: (v: View) => void; children: React.ReactNode; }

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
  ]},
  { items: [{ id: 'settings', icon: Settings }] },
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
    ? <CloudOff className="w-3.5 h-3.5 text-red-400" />
    : <Cloud className="w-3.5 h-3.5 text-blue-300" />;
  const title = syncStatus === 'syncing' ? 'Syncing…'
    : syncStatus === 'error' ? 'Sync error'
    : lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : 'Cloud sync';
  return (
    <button onClick={syncNow} title={title}
      className="p-1 rounded-lg hover:bg-blue-800 text-blue-300 flex items-center">
      {icon}
    </button>
  );
}

export default function Layout({ view, setView, children }: Props) {
  const { t, lang, setLang, data } = useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const companyName = data.settings.company.name || t('appName');

  useEffect(() => { setDrawerOpen(false); }, [view]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const NavContent = () => (
    <>
      <div className="px-4 py-4 border-b border-blue-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-blue-300 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-xs text-blue-300 font-medium tracking-wide">Jobboks</div>
            <div className="text-sm font-semibold leading-tight truncate">{companyName}</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-3 px-2 overflow-y-auto">
        {sections.map((section, si) => (
          <div key={si} className={si > 0 ? 'mt-1' : ''}>
            {section.labelKey && (
              <div className="px-3 pt-3 pb-1 text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                {t(section.labelKey as never)}
              </div>
            )}
            {section.items.map(({ id, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm font-medium transition-colors ${
                  view === id ? 'bg-blue-700 text-white' : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {t(id)}
              </button>
            ))}
            {section.labelKey && <div className="mx-3 mt-1 border-t border-blue-800/50" />}
          </div>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-blue-800 flex-shrink-0 flex items-center gap-2">
        <button
          onClick={() => setLang(lang === 'is' ? 'en' : 'is')}
          className="flex items-center gap-2 text-blue-300 hover:text-white text-sm transition-colors flex-1"
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
      <aside className="hidden md:flex flex-col w-56 bg-blue-900 text-white flex-shrink-0 h-screen sticky top-0 no-print">
        <NavContent />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 h-14 bg-blue-900 text-white flex items-center px-4 gap-3 shadow-lg no-print">
        <button onClick={() => setDrawerOpen(true)} className="p-1 rounded-lg hover:bg-blue-800" aria-label="Menu">
          <Menu className="w-6 h-6" />
        </button>
        <BookOpen className="w-5 h-5 text-blue-300 flex-shrink-0" />
        <span className="font-semibold text-sm truncate flex-1">{companyName || 'Jobboks'}</span>
        <button
          onClick={() => setLang(lang === 'is' ? 'en' : 'is')}
          className="p-1 rounded-lg hover:bg-blue-800 flex items-center gap-1 text-blue-300 text-xs"
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
          <div className="relative flex flex-col w-72 max-w-[85vw] bg-blue-900 text-white h-full shadow-2xl animate-slide-in">
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
        {bottomNavItems.map(({ id, icon: Icon }) => (
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
