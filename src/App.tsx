import { useState, useEffect, useCallback } from 'react';
import { AppProvider, useApp } from './contexts/AppContext';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Transactions from './components/Transactions';
import Recurring from './components/Recurring';
import BankImport from './components/BankImport';
import AutoRules from './components/AutoRules';
import Tasks from './components/Tasks';
import Invoices from './components/Invoices';
import ChartOfAccounts from './components/ChartOfAccounts';
import Contacts from './components/Contacts';
import Budget from './components/Budget';
import Payroll from './components/Payroll';
import VAT from './components/VAT';
import VATReturn from './components/VATReturn';
import Reports from './components/Reports';
import AnnualAccounts from './components/AnnualAccounts';
import Settings from './components/Settings';
import CountryOnboarding from './components/CountryOnboarding';
import AIAssistant from './components/AIAssistant';
import Stock from './components/Stock';
import Jobs from './components/Jobs';
import Users from './components/Users';
import Upgrade from './components/Upgrade';
import ReviewManager from './components/ReviewManager';
import Login from './components/Login';
import { View } from './types';
import { getSession } from './utils/supabase';
import { resolvePermissions, canAccessView, isOperatorAccount } from './utils/access';
import UpdatePrompt from './components/UpdatePrompt';
import TestModeBanner from './components/TestModeBanner';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

// Founder account(s) — comped to top-tier automatically. Paying customers never
// see the upgrade banner (it's Basic-only); this makes sure the owner doesn't
// either, since in-app payments aren't live yet so there's no way to self-upgrade.
// Only these exact accounts are affected — real customers still pay for Pro.
const FOUNDER_EMAILS = ['vidarsig@pm.me'];

function AppInner() {
  // Drill-down target: set when the user clicks a key in Reports, consumed by
  // Transactions to pre-filter to that key (and year) so they can fix it.
  const [txDrill, setTxDrill] = useState<{ category?: string; year?: number } | null>(null);
  const clearTxDrill = useCallback(() => setTxDrill(null), []);
  const { data, dispatch } = useApp();
  // Land a brand-new user (empty app, hasn't chatted yet) on the AI concierge for
  // first open (slice 2) instead of the empty dashboard — the "easy and welcoming"
  // first minute. Lazy init runs once; once they chat or add anything, it's off.
  const [view, setView] = useState<View>(() =>
    (data.transactions?.length ?? 0) === 0 && (data.invoices?.length ?? 0) === 0 &&
    (data.jobs?.length ?? 0) === 0 && (data.aiChat?.length ?? 0) === 0 ? 'ai' : 'dashboard');

  const { supabaseUrl, supabaseKey } = data.settings;
  const supabaseConfigured = !!(supabaseUrl && supabaseKey);

  // Auth state
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // On mount: if Supabase configured, restore session
  useEffect(() => {
    if (!supabaseConfigured) {
      setAuthChecked(true);
      return;
    }
    getSession(supabaseUrl, supabaseKey).then(session => {
      if (session?.user) {
        const meta = session.user.user_metadata as { name?: string } | undefined;
        setSessionUser({
          id: session.user.id,
          name: meta?.name || session.user.email || 'User',
          email: session.user.email || '',
        });
      }
      setAuthChecked(true);
    });
  }, [supabaseConfigured, supabaseUrl, supabaseKey]);

  // Founder comp: give the founder account top-tier automatically so the upgrade
  // banner never shows for them and every feature is unlocked. Idempotent — once
  // the plan is 'business' this stops firing. No effect on customer accounts.
  useEffect(() => {
    const email = sessionUser?.email?.toLowerCase();
    if (!email || !FOUNDER_EMAILS.includes(email)) return;
    if (data.settings.plan === 'business') return;
    dispatch({ type: 'UPDATE_SETTINGS', payload: { plan: 'business' } });
  }, [sessionUser, data.settings.plan, dispatch]);

  // Listen for upgrade navigation from plan-limit modals
  useEffect(() => {
    const handler = () => setView('upgrade');
    window.addEventListener('navigate-upgrade', handler);
    return () => window.removeEventListener('navigate-upgrade', handler);
  }, []);

  // Role-based access: constrain navigation to the logged-in user's permissions
  const perms = resolvePermissions(sessionUser, data.appUsers ?? []);
  // Review Intelligence is operator-only — a subscriber can't reach it even by URL/state.
  const viewAllowed = (v: View) => canAccessView(v, perms) && (v !== 'reviews' || isOperatorAccount(data.settings));

  // If the current view is not permitted, bounce back to the dashboard
  useEffect(() => {
    if (!viewAllowed(view)) setView('dashboard');
  }, [view, perms]);

  // Country onboarding first
  if (!data.settings.country) return <CountryOnboarding />;

  // Wait for auth check
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Dev-only test bypass: running LOCALLY with ?demo in the URL skips the login wall
  // so an automated tester (or a developer) can drive the UI without credentials.
  // import.meta.env.DEV is false in the production build, so the deployed app on
  // jobboks.app can NEVER enter this — its login wall is untouched. No auth happens
  // here, so resolveCompanyKey stays null and Supabase sync never runs (see the sync
  // effect in AppContext): the session works purely on local IndexedDB data and can
  // never pull or push real customer data.
  const demoBypass = import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo');

  // Show login if Supabase configured but no session
  if (supabaseConfigured && !sessionUser && !demoBypass) {
    return (
      <Login
        onSuccess={(id, name, email) => setSessionUser({ id, name, email })}
      />
    );
  }

  // Never render a screen the user can't access (covers the tick before the
  // redirect effect fires)
  const safeView: View = viewAllowed(view) ? view : 'dashboard';

  return (
    <Layout view={safeView} setView={setView} sessionUser={sessionUser} perms={perms}
      onSignOut={() => setSessionUser(null)}>
      {safeView === 'dashboard'    && <Dashboard setView={setView} perms={perms} />}
      {safeView === 'transactions' && <Transactions initialFilter={txDrill} onFilterConsumed={clearTxDrill} />}
      {safeView === 'recurring'    && <Recurring />}
      {safeView === 'bankimport'   && <BankImport />}
      {safeView === 'rules'        && <AutoRules />}
      {safeView === 'tasks'        && <Tasks setView={setView} />}
      {safeView === 'invoices'     && <Invoices />}
      {safeView === 'accounts'     && <ChartOfAccounts />}
      {safeView === 'contacts'     && <Contacts />}
      {safeView === 'budget'       && <Budget />}
      {safeView === 'payroll'      && <Payroll />}
      {safeView === 'vat'          && <VAT />}
      {safeView === 'vatreturn'    && <VATReturn />}
      {safeView === 'reports'      && <Reports drill={(category, year) => { setTxDrill({ category, year }); setView('transactions'); }} />}
      {safeView === 'annual'       && <AnnualAccounts />}
      {safeView === 'settings'     && <Settings />}
      {safeView === 'ai'           && <AIAssistant />}
      {safeView === 'stock'        && <Stock />}
      {safeView === 'jobs'         && <Jobs sessionUser={sessionUser} />}
      {safeView === 'users'        && <Users sessionUser={sessionUser} />}
      {safeView === 'upgrade'      && <Upgrade />}
      {safeView === 'reviews'      && <ReviewManager setView={setView} />}
    </Layout>
  );
}

export default function App() {
  return <AppProvider><AppInner /><UpdatePrompt /><TestModeBanner /></AppProvider>;
}
