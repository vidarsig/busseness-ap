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
import { resolvePermissions, canAccessView } from './utils/access';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

function AppInner() {
  const [view, setView] = useState<View>('dashboard');
  // Drill-down target: set when the user clicks a key in Reports, consumed by
  // Transactions to pre-filter to that key (and year) so they can fix it.
  const [txDrill, setTxDrill] = useState<{ category?: string; year?: number } | null>(null);
  const clearTxDrill = useCallback(() => setTxDrill(null), []);
  const { data } = useApp();

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

  // Listen for upgrade navigation from plan-limit modals
  useEffect(() => {
    const handler = () => setView('upgrade');
    window.addEventListener('navigate-upgrade', handler);
    return () => window.removeEventListener('navigate-upgrade', handler);
  }, []);

  // Role-based access: constrain navigation to the logged-in user's permissions
  const perms = resolvePermissions(sessionUser, data.appUsers ?? []);

  // If the current view is not permitted, bounce back to the dashboard
  useEffect(() => {
    if (!canAccessView(view, perms)) setView('dashboard');
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

  // Show login if Supabase configured but no session
  if (supabaseConfigured && !sessionUser) {
    return (
      <Login
        onSuccess={(id, name, email) => setSessionUser({ id, name, email })}
      />
    );
  }

  // Never render a screen the user can't access (covers the tick before the
  // redirect effect fires)
  const safeView: View = canAccessView(view, perms) ? view : 'dashboard';

  return (
    <Layout view={safeView} setView={setView} sessionUser={sessionUser} perms={perms}
      onSignOut={() => setSessionUser(null)}>
      {safeView === 'dashboard'    && <Dashboard setView={setView} />}
      {safeView === 'transactions' && <Transactions initialFilter={txDrill} onFilterConsumed={clearTxDrill} />}
      {safeView === 'recurring'    && <Recurring />}
      {safeView === 'bankimport'   && <BankImport />}
      {safeView === 'rules'        && <AutoRules />}
      {safeView === 'tasks'        && <Tasks setView={setView} />}
      {safeView === 'invoices'     && <Invoices />}
      {safeView === 'accounts'     && <ChartOfAccounts />}
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
      {safeView === 'reviews'      && <ReviewManager />}
    </Layout>
  );
}

export default function App() {
  return <AppProvider><AppInner /></AppProvider>;
}
