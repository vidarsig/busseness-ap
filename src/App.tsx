import { useState } from 'react';
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
import { View } from './types';

function AppInner() {
  const [view, setView] = useState<View>('dashboard');
  const { data } = useApp();

  if (!data.settings.country) return <CountryOnboarding />;

  return (
    <Layout view={view} setView={setView}>
      {view === 'dashboard'    && <Dashboard setView={setView} />}
      {view === 'transactions' && <Transactions />}
      {view === 'recurring'    && <Recurring />}
      {view === 'bankimport'   && <BankImport />}
      {view === 'rules'        && <AutoRules />}
      {view === 'tasks'        && <Tasks setView={setView} />}
      {view === 'invoices'     && <Invoices />}
      {view === 'accounts'     && <ChartOfAccounts />}
      {view === 'budget'       && <Budget />}
      {view === 'payroll'      && <Payroll />}
      {view === 'vat'          && <VAT />}
      {view === 'vatreturn'    && <VATReturn />}
      {view === 'reports'      && <Reports />}
      {view === 'annual'       && <AnnualAccounts />}
      {view === 'settings'     && <Settings />}
      {view === 'ai'           && <AIAssistant />}
      {view === 'stock'        && <Stock />}
      {view === 'jobs'         && <Jobs />}
    </Layout>
  );
}

export default function App() {
  return <AppProvider><AppInner /></AppProvider>;
}
