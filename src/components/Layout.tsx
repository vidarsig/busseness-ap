import { useState, useEffect } from 'react';
import {
  BookOpen, LayoutDashboard, List, Calculator, BarChart2, FileText,
  Settings, Menu, X, RefreshCw, Upload, Receipt,
  BookMarked, TrendingUp, Users, ClipboardList, Zap,
  Cloud, CloudOff, Loader2, Bot, Package, HardHat, LogOut, UserCircle, Crown, Star, Contact,
  Briefcase, ChevronDown,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { signOut } from '../utils/supabase';
import { View, UserPermissions } from '../types';
import { canAccessView, isOperatorAccount } from '../utils/access';
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
// `part` groups sections into the two halves of the app: the field-work side
// ('work', always shown) and the money side ('business', collapsible + hidden by
// default). 'top' = dashboard, 'bottom' = always-there utilities (settings, users).
type NavPart = 'top' | 'work' | 'business' | 'bottom';
interface NavSection { label?: string; labelKey?: string; part: NavPart; items: NavItem[]; }

const sections: NavSection[] = [
  { part: 'top', items: [{ id: 'dashboard', icon: LayoutDashboard }] },

  // ── WORK — the field/job side (invoices live here too; still permission-gated) ──
  // Verkefni/tasks folded into each Job's checklist, so no standalone tab.
  { part: 'work', items: [
    { id: 'jobs', icon: HardHat },
    { id: 'invoices', icon: Receipt },
    { id: 'stock', icon: Package },
  ]},

  // ── BUSINESS — the money side (hidden until expanded) ──
  { part: 'business', items: [
    { id: 'contacts', icon: Contact },
  ]},
  { part: 'business', labelKey: 'navTransactions', items: [
    { id: 'transactions', icon: List },
    { id: 'recurring', icon: RefreshCw },
    { id: 'bankimport', icon: Upload },
    { id: 'rules', icon: Zap },
  ]},
  { part: 'business', labelKey: 'navAccounting', items: [
    { id: 'accounts', icon: BookMarked },
    { id: 'budget', icon: TrendingUp },
    { id: 'payroll', icon: Users },
  ]},
  { part: 'business', labelKey: 'navReports', items: [
    { id: 'vat', icon: Calculator },
    { id: 'vatreturn', icon: ClipboardList },
    { id: 'reports', icon: BarChart2 },
    { id: 'annual', icon: FileText },
  ]},
  { part: 'business', items: [
    { id: 'ai', icon: Bot },
  ]},

  // ── BOTTOM — always available ──
  { part: 'bottom', items: [{ id: 'settings', icon: Settings }] },
  { part: 'bottom', items: [{ id: 'users', icon: Users }] },
  { part: 'bottom', items: [{ id: 'reviews', icon: Star }] },
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
  const { t, lang, cc, data } = useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The Business (money) group is collapsed & hidden by default; the owner taps
  // the "Rekstur / Business" header to reveal it. Choice is remembered.
  const [businessOpen, setBusinessOpen] = useState(() => {
    try { return localStorage.getItem('nav.businessOpen') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('nav.businessOpen', businessOpen ? '1' : '0'); } catch { /* ignore */ }
  }, [businessOpen]);
  const companyName = data.settings.company.name || t('appName');
  const isOperator = isOperatorAccount(data.settings);

  // Nav label for the tax screens follows the country's tax term instead of the
  // hardcoded "VAT": US → "Sales Tax", any other English UI → the config term
  // ("GST/HST" for Canada), Icelandic → the Icelandic dictionary.
  const navLabel = (id: string) => {
    if (id !== 'vat' && id !== 'vatreturn') return t(id as never);
    if (data.settings.country === 'US') return id === 'vat' ? 'Sales Tax' : 'Sales Tax Return';
    if (lang === 'en') return id === 'vat' ? cc.vatTerm : `${cc.vatTerm} Return`;
    return t(id as never);
  };
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

  const visibleItems = (section: NavSection) => section.items.filter(item =>
    (item.id !== 'users' || supabaseConfigured) &&
    // Payroll only where an engine exists (Iceland, US, Canada).
    (item.id !== 'payroll' || data.settings.country === 'IS' || data.settings.country === 'US' || data.settings.country === 'CA') &&
    // Review Intelligence is an operator-only internal tool — hidden from subscribers.
    (item.id !== 'reviews' || isOperator) &&
    canAccessView(item.id, perms ?? null),
  );

  const renderSection = (section: NavSection, key: string, first: boolean) => {
    const items = visibleItems(section);
    if (items.length === 0) return null;
    return (
      <div key={key} className={first ? '' : 'mt-1'}>
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
            {navLabel(id)}
          </button>
        ))}
        {section.labelKey && <div className="mx-3 mt-1 border-t border-gray-100" />}
      </div>
    );
  };

  const partSections = (p: NavPart) => sections.filter(s => s.part === p);
  const businessIds = new Set(partSections('business').flatMap(s => s.items.map(i => i.id)));
  // Force the Business group open while the user is actually on one of its screens.
  const showBusiness = businessOpen || businessIds.has(view);
  const workHasItems = partSections('work').some(s => visibleItems(s).length > 0);
  const businessHasItems = partSections('business').some(s => visibleItems(s).length > 0);

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
        {/* Top — dashboard */}
        {partSections('top').map((s, i) => renderSection(s, `top-${i}`, i === 0))}

        {/* WORK — always visible field/job side */}
        {workHasItems && (
          <div className="mt-2">
            <div className="px-3 pt-1 pb-1 flex items-center gap-2 text-[11px] font-bold text-gray-500 uppercase tracking-widest">
              <HardHat className="w-3.5 h-3.5 flex-shrink-0" />
              {t('navWork')}
            </div>
            {partSections('work').map((s, i) => renderSection(s, `work-${i}`, i === 0))}
          </div>
        )}

        {/* BUSINESS — money side, collapsed & hidden by default */}
        {businessHasItems && (
          <div className="mt-2">
            <button
              onClick={() => setBusinessOpen(o => !o)}
              className="w-full px-3 pt-1 pb-1 flex items-center gap-2 text-[11px] font-bold text-gray-500 uppercase tracking-widest hover:text-gray-700 transition-colors"
              aria-expanded={showBusiness}
            >
              <Briefcase className="w-3.5 h-3.5 flex-shrink-0" />
              {t('navBusiness')}
              <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${showBusiness ? '' : '-rotate-90'}`} />
            </button>
            {showBusiness && partSections('business').map((s, i) => renderSection(s, `biz-${i}`, i === 0))}
          </div>
        )}

        {/* Bottom — always available utilities */}
        <div className="mt-2">
          {partSections('bottom').map((s, i) => renderSection(s, `bot-${i}`, i === 0))}
        </div>
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

      <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0 flex items-center justify-end gap-2">
        <SyncIndicator />
      </div>
    </>
  );

  // PHONE-VIEW-ON-LAPTOP (beta look): render the whole app inside a centered
  // phone-width frame with the mobile chrome (top bar, bottom nav, Mike corner,
  // drawer) so a laptop looks like the Android app. Gated to betaLook so the
  // stable desktop layout is untouched. Bars are `absolute` within the frame (not
  // `fixed` to the viewport) so they stay the width of the phone column.
  const phoneLook = data.settings.betaLook;
  if (phoneLook) {
    return (
      <div className="min-h-screen bg-slate-200 flex justify-center">
        <div className="relative w-full max-w-[440px] h-screen bg-gray-50 shadow-2xl overflow-hidden flex flex-col">
          {/* Top bar */}
          <div className="absolute top-0 inset-x-0 z-30 h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 shadow-sm no-print">
            <button onClick={() => setDrawerOpen(true)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Menu">
              <Menu className="w-6 h-6" />
            </button>
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-blue-600 text-sm tracking-wide uppercase flex-shrink-0">Jobboks</span>
            <span className="text-gray-400 text-sm truncate flex-1">{companyName !== 'Jobboks' ? companyName : ''}</span>
            <SyncIndicator />
          </div>

          {/* Drawer */}
          {drawerOpen && (
            <div className="absolute inset-0 z-50 flex no-print">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
              <div className="relative flex flex-col w-72 max-w-[85%] bg-white h-full shadow-2xl animate-slide-in">
                <button onClick={() => setDrawerOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
                <NavContent />
              </div>
            </div>
          )}

          {/* Main content */}
          <main className="flex-1 overflow-auto pt-14 pb-24">
            <div className="p-4">{children}</div>
          </main>

          {/* Mike — one tap to talk (beta corner helper) */}
          {canAccessView('ai', perms ?? null) && (
            <button
              onClick={() => setView('ai')}
              aria-label={lang === 'is' ? 'Talaðu við Mike' : 'Talk to Mike'}
              className="absolute left-4 bottom-24 z-40 no-print flex items-center gap-2 active:scale-95 transition-transform"
            >
              <span className="mike-bob w-14 h-14 rounded-full overflow-hidden shadow-lg block"
                style={{ background: '#211d3a', border: '2px solid #7F77DD' }}>
                <img src="/mike-head.png" alt=""
                  className="w-full h-full object-cover" style={{ objectPosition: 'center top' }} />
              </span>
              {view !== 'ai' && (
                <span className="text-xs font-medium px-2.5 py-1.5 rounded-xl"
                  style={{ background: '#7F77DD', color: '#1a1633', borderBottomLeftRadius: '3px' }}>
                  {lang === 'is' ? 'Talaðu við mig' : 'Talk to me'}
                </span>
              )}
            </button>
          )}

          {/* Bottom nav */}
          <nav className="absolute bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 flex no-print safe-area-pb">
            {bottomNavItems.filter(item => canAccessView(item.id, perms ?? null)).map(({ id, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 ${
                  view === id ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium leading-tight">{navLabel(id)}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
    );
  }

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

      {/* Mike — the AI carpenter, one tap to talk. Beta look only, phone only (sits
          above the bottom nav, left corner). Placeholder art (HardHat) until the real
          carpenter figurine is dropped in. Hidden if the user can't reach the AI. */}
      {data.settings.betaLook && canAccessView('ai', perms ?? null) && (
        <button
          onClick={() => setView('ai')}
          aria-label={lang === 'is' ? 'Talaðu við Mike' : 'Talk to Mike'}
          className="md:hidden fixed left-4 bottom-24 z-40 no-print flex items-center gap-2 active:scale-95 transition-transform"
        >
          <span className="mike-bob w-14 h-14 rounded-full overflow-hidden shadow-lg block"
            style={{ background: '#211d3a', border: '2px solid #7F77DD' }}>
            <img src="/mike-head.png" alt=""
              className="w-full h-full object-cover" style={{ objectPosition: 'center top' }} />
          </span>
          {view !== 'ai' && (
            <span className="text-xs font-medium px-2.5 py-1.5 rounded-xl"
              style={{ background: '#7F77DD', color: '#1a1633', borderBottomLeftRadius: '3px' }}>
              {lang === 'is' ? 'Talaðu við mig' : 'Talk to me'}
            </span>
          )}
        </button>
      )}

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
            <span className="text-[10px] font-medium leading-tight">{navLabel(id)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
