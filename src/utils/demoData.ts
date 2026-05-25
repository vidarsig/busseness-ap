import {
  AppData, Transaction, Invoice, InvoiceLine, Job, TimeEntry,
  JobMaterial, StockItem, StockMovement, PayrollEntry, Task, BudgetLine,
} from '../types';

function id(prefix: string) { return `${prefix}_demo_${Math.random().toString(36).slice(2,8)}`; }
function daysAgo(n: number) { return new Date(Date.now() - n*24*60*60*1000).toISOString().slice(0,10); }
function isoAgo(n: number) { return new Date(Date.now() - n*24*60*60*1000).toISOString(); }

export function generateDemoData(existing: AppData): Partial<AppData> {

  // ── Transactions ─────────────────────────────────────────
  const transactions: Transaction[] = [
    { id:id('tx'), date:daysAgo(1),  description:'Þakviðgerð — Skólavörðustígur 12', category:'sala_thjonustu', type:'income',  amount:485000, currency:'ISK', eurToIskRate:150, vatRate:24 },
    { id:id('tx'), date:daysAgo(3),  description:'Pípulagnir — Laugavegur 45',        category:'sala_thjonustu', type:'income',  amount:320000, currency:'ISK', eurToIskRate:150, vatRate:24 },
    { id:id('tx'), date:daysAgo(5),  description:'Viðgerð á baðherbergi',             category:'sala_thjonustu', type:'income',  amount:195000, currency:'ISK', eurToIskRate:150, vatRate:24 },
    { id:id('tx'), date:daysAgo(7),  description:'Steinlagnir — Kópavogur',           category:'sala_thjonustu', type:'income',  amount:560000, currency:'ISK', eurToIskRate:150, vatRate:24 },
    { id:id('tx'), date:daysAgo(10), description:'Eldhúsuppsetning — Hafnarfjörður',  category:'sala_thjonustu', type:'income',  amount:720000, currency:'ISK', eurToIskRate:150, vatRate:24 },
    { id:id('tx'), date:daysAgo(12), description:'Byko — Timbur og einangrun',        category:'vorur',          type:'expense', amount:87500,  currency:'ISK', eurToIskRate:150, vatRate:24 },
    { id:id('tx'), date:daysAgo(14), description:'Rafmagnsfarir — verkfæri',          category:'vorur',          type:'expense', amount:34200,  currency:'ISK', eurToIskRate:150, vatRate:24 },
    { id:id('tx'), date:daysAgo(15), description:'Líftæknivörur — Pípuhlutir',        category:'vorur',          type:'expense', amount:52800,  currency:'ISK', eurToIskRate:150, vatRate:24 },
    { id:id('tx'), date:daysAgo(18), description:'Olía og bifreiðakostnaður',         category:'samgongur',      type:'expense', amount:28600,  currency:'ISK', eurToIskRate:150, vatRate:24 },
    { id:id('tx'), date:daysAgo(20), description:'Steypustöðin — Steypa',             category:'vorur',          type:'expense', amount:118000, currency:'ISK', eurToIskRate:150, vatRate:24 },
    { id:id('tx'), date:daysAgo(22), description:'Rafmagn og hiti — verkstaður',      category:'rafmagn_hiti',   type:'expense', amount:42000,  currency:'ISK', eurToIskRate:150, vatRate:24 },
    { id:id('tx'), date:daysAgo(25), description:'Sími og nettenging',                category:'simagjold',      type:'expense', amount:15900,  currency:'ISK', eurToIskRate:150, vatRate:24 },
    { id:id('tx'), date:daysAgo(28), description:'Bílastæðavinur — Þakviðgerð',      category:'sala_thjonustu', type:'income',  amount:280000, currency:'ISK', eurToIskRate:150, vatRate:24 },
    { id:id('tx'), date:daysAgo(30), description:'Tryggingar — atvinnuslys',          category:'fagthjonusta',   type:'expense', amount:68000,  currency:'ISK', eurToIskRate:150, vatRate:24 },
    { id:id('tx'), date:daysAgo(32), description:'Hlíf — Bygg og byggingarefni',      category:'vorur',          type:'expense', amount:94500,  currency:'ISK', eurToIskRate:150, vatRate:24 },
  ];

  // ── Invoices ─────────────────────────────────────────────
  const invLines1: InvoiceLine[] = [
    { id:id('il'), description:'Vinnulaun — Gunnar Sigurðsson (24h)',  quantity:24, unitPrice:5500, vatRate:24 },
    { id:id('il'), description:'Vinnulaun — Bjarni Ólafsson (16h)',    quantity:16, unitPrice:5000, vatRate:24 },
    { id:id('il'), description:'Þakpappar og einangrun',               quantity:1,  unitPrice:87500, vatRate:24 },
    { id:id('il'), description:'Festingar og varahlutir',              quantity:1,  unitPrice:18000, vatRate:24 },
  ];
  const invLines2: InvoiceLine[] = [
    { id:id('il'), description:'Vinnulaun — Eldhúsuppsetning (32h)',   quantity:32, unitPrice:5500, vatRate:24 },
    { id:id('il'), description:'Skápar og hurðir — IKEA Business',     quantity:1,  unitPrice:245000, vatRate:24 },
    { id:id('il'), description:'Pípulagnir og rafmagn',                quantity:1,  unitPrice:68000, vatRate:24 },
  ];
  const invLines3: InvoiceLine[] = [
    { id:id('il'), description:'Vinnulaun — Steypuvinna (40h)',        quantity:40, unitPrice:5500, vatRate:24 },
    { id:id('il'), description:'Steypa — 4 m³',                        quantity:4,  unitPrice:28000, vatRate:24 },
    { id:id('il'), description:'Járn og járnakerfi',                   quantity:1,  unitPrice:95000, vatRate:24 },
  ];

  const invoices: Invoice[] = [
    {
      id:id('inv'), number:'R0042', type:'invoice',
      date:daysAgo(2), dueDate:daysAgo(-28),
      customer:{ name:'Jón Gunnarsson', email:'jon@example.is', phone:'555-1234', address:'Skólavörðustígur 12, 101 Reykjavík' },
      lines:invLines1, notes:'Þakviðgerð lokið. Greiðsla innan 30 daga.',
      status:'sent', currency:'ISK', eurToIskRate:150,
    },
    {
      id:id('inv'), number:'R0041', type:'invoice',
      date:daysAgo(10), dueDate:daysAgo(-20),
      customer:{ name:'Sigríður Björnsdóttir', email:'sigridur@example.is', phone:'555-5678', address:'Laugavegur 45, 105 Reykjavík' },
      lines:invLines2, notes:'Eldhúsuppsetning. Takk fyrir viðskiptin.',
      status:'paid', currency:'ISK', eurToIskRate:150,
    },
    {
      id:id('inv'), number:'R0040', type:'invoice',
      date:daysAgo(20), dueDate:daysAgo(10),
      customer:{ name:'Byggingafélag Suðurnesja ehf', email:'bygg@example.is', phone:'555-9012', address:'Keflavíkurgata 8, 230 Reykjanesbær' },
      lines:invLines3, notes:'Steypuvinna — 1. hluti af stærra verkefni.',
      status:'overdue', currency:'ISK', eurToIskRate:150,
    },
    {
      id:id('inv'), number:'R0043', type:'quote',
      date:daysAgo(1), dueDate:daysAgo(-14),
      customer:{ name:'Arna Kristjánsdóttir', email:'arna@example.is', phone:'555-3456', address:'Barónsstígur 22, 101 Reykjavík' },
      lines:[
        { id:id('il'), description:'Baðherbergisuppsetning — vinnulaun', quantity:20, unitPrice:5500, vatRate:24 },
        { id:id('il'), description:'Flísar og festingar',                quantity:1,  unitPrice:145000, vatRate:24 },
      ],
      notes:'Tilboð gilt í 14 daga.',
      status:'draft', currency:'ISK', eurToIskRate:150,
    },
  ];

  // ── Jobs ─────────────────────────────────────────────────
  const job1Id = id('job');
  const job2Id = id('job');
  const job3Id = id('job');

  const jobs: Job[] = [
    {
      id:job1Id, number:'JOB-2026-001', name:'Þakviðgerð — Skólavörðustígur',
      clientName:'Jón Gunnarsson', clientEmail:'jon@example.is', clientPhone:'555-1234',
      address:'Skólavörðustígur 12, 101 Reykjavík',
      status:'complete', startDate:daysAgo(8), endDate:daysAgo(2),
      quotedAmount:620000, currency:'ISK', description:'Viðgerð á þaki eftir stormskemmdir. Skipta um þakpappa og einangrun.',
      notes:'Viðskiptavinur vill fá reikning strax.', createdAt:isoAgo(10), updatedAt:isoAgo(2),
    },
    {
      id:job2Id, number:'JOB-2026-002', name:'Eldhúsuppsetning — Hafnarfjörður',
      clientName:'Sigríður Björnsdóttir', clientEmail:'sigridur@example.is', clientPhone:'555-5678',
      address:'Suðurgata 7, 220 Hafnarfjörður',
      status:'active', startDate:daysAgo(5),
      quotedAmount:890000, currency:'ISK', description:'Fullkomin eldhúsuppsetning. Nýir skápar, pípulagnir og rafmagn.',
      notes:'Viðskiptavinur vill ljósa steinflísar.', createdAt:isoAgo(6), updatedAt:isoAgo(1),
    },
    {
      id:job3Id, number:'JOB-2026-003', name:'Steypuvinna — Kópavogur',
      clientName:'Byggingafélag Suðurnesja ehf', clientEmail:'bygg@example.is', clientPhone:'555-9012',
      address:'Hamraborg 5, 200 Kópavogur',
      status:'quote', startDate:daysAgo(-7),
      quotedAmount:1450000, currency:'ISK', description:'Steypugrunnur fyrir nýtt hús. 4 m³ steypa, járnakerfi.',
      createdAt:isoAgo(2), updatedAt:isoAgo(1),
    },
  ];

  // ── Time entries ──────────────────────────────────────────
  const timeEntries: TimeEntry[] = [
    { id:id('te'), jobId:job1Id, date:daysAgo(8), employeeName:'Gunnar Sigurðsson', hours:8, hourlyRate:5500, description:'Rif gamlan þakpappa', createdAt:isoAgo(8) },
    { id:id('te'), jobId:job1Id, date:daysAgo(7), employeeName:'Gunnar Sigurðsson', hours:8, hourlyRate:5500, description:'Lagði einangrun', createdAt:isoAgo(7) },
    { id:id('te'), jobId:job1Id, date:daysAgo(6), employeeName:'Gunnar Sigurðsson', hours:8, hourlyRate:5500, description:'Festingarvinna', createdAt:isoAgo(6) },
    { id:id('te'), jobId:job1Id, date:daysAgo(5), employeeName:'Bjarni Ólafsson',   hours:8, hourlyRate:5000, description:'Lokavinna og þrif', createdAt:isoAgo(5) },
    { id:id('te'), jobId:job1Id, date:daysAgo(4), employeeName:'Bjarni Ólafsson',   hours:8, hourlyRate:5000, description:'Eftirskoðun og lokun', createdAt:isoAgo(4) },
    { id:id('te'), jobId:job2Id, date:daysAgo(5), employeeName:'Gunnar Sigurðsson', hours:8, hourlyRate:5500, description:'Rif gamla eldhús', createdAt:isoAgo(5) },
    { id:id('te'), jobId:job2Id, date:daysAgo(4), employeeName:'Gunnar Sigurðsson', hours:8, hourlyRate:5500, description:'Pípulagnir', createdAt:isoAgo(4) },
    { id:id('te'), jobId:job2Id, date:daysAgo(3), employeeName:'Anna Magnúsdóttir', hours:6, hourlyRate:5000, description:'Flísalagnir', createdAt:isoAgo(3) },
    { id:id('te'), jobId:job2Id, date:daysAgo(2), employeeName:'Anna Magnúsdóttir', hours:8, hourlyRate:5000, description:'Skápar og hurðir', createdAt:isoAgo(2) },
    { id:id('te'), jobId:job2Id, date:daysAgo(1), employeeName:'Gunnar Sigurðsson', hours:6, hourlyRate:5500, description:'Rafmagnsvinna', createdAt:isoAgo(1) },
  ];

  // ── Materials ─────────────────────────────────────────────
  const jobMaterials: JobMaterial[] = [
    { id:id('jm'), jobId:job1Id, date:daysAgo(8), description:'Þakpappar — 120m²', qty:120, unit:'m²', unitCost:850,  supplierName:'Byko', createdAt:isoAgo(8) },
    { id:id('jm'), jobId:job1Id, date:daysAgo(8), description:'Einangrun 200mm',    qty:24,  unit:'stk', unitCost:3200, supplierName:'Byko', createdAt:isoAgo(8) },
    { id:id('jm'), jobId:job1Id, date:daysAgo(7), description:'Festingar og skrúfur', qty:1, unit:'pk',  unitCost:8500, supplierName:'Húsasmiðjan', createdAt:isoAgo(7) },
    { id:id('jm'), jobId:job2Id, date:daysAgo(5), description:'Pípuhlutir — full sett', qty:1, unit:'sett', unitCost:68000, supplierName:'Líftækni', createdAt:isoAgo(5) },
    { id:id('jm'), jobId:job2Id, date:daysAgo(4), description:'IKEA Metod skápar',  qty:8,  unit:'stk', unitCost:28000, supplierName:'IKEA',  createdAt:isoAgo(4) },
    { id:id('jm'), jobId:job2Id, date:daysAgo(3), description:'Steinflísar — 20m²', qty:20, unit:'m²',  unitCost:6800, supplierName:'Flísaverið', createdAt:isoAgo(3) },
  ];

  // ── Stock ─────────────────────────────────────────────────
  const stockItems: StockItem[] = [
    { id:id('si'), sku:'TIM-001', name:'Timbur 2x4 — 3m',       category:'Timbur',   unit:'stk', qtyOnHand:45,  qtyReserved:10, reorderPoint:20, costPrice:1800,  sellPrice:2200,  currency:'ISK', vatRate:24, supplierName:'Byko',        createdAt:isoAgo(30), updatedAt:isoAgo(2) },
    { id:id('si'), sku:'TIM-002', name:'Timbur 2x6 — 3m',       category:'Timbur',   unit:'stk', qtyOnHand:12,  qtyReserved:5,  reorderPoint:15, costPrice:2400,  sellPrice:2900,  currency:'ISK', vatRate:24, supplierName:'Byko',        createdAt:isoAgo(30), updatedAt:isoAgo(3) },
    { id:id('si'), sku:'INS-001', name:'Einangrun 200mm',        category:'Einangrun',unit:'stk', qtyOnHand:8,   qtyReserved:0,  reorderPoint:10, costPrice:3200,  sellPrice:3900,  currency:'ISK', vatRate:24, supplierName:'Byko',        createdAt:isoAgo(30), updatedAt:isoAgo(5) },
    { id:id('si'), sku:'PIP-001', name:'Koparrörir 22mm — 1m',  category:'Pípulagnir',unit:'stk',qtyOnHand:30,  qtyReserved:8,  reorderPoint:20, costPrice:1200,  sellPrice:1600,  currency:'ISK', vatRate:24, supplierName:'Líftækni',    createdAt:isoAgo(30), updatedAt:isoAgo(4) },
    { id:id('si'), sku:'PIP-002', name:'Koparrörir 15mm — 1m',  category:'Pípulagnir',unit:'stk',qtyOnHand:55,  qtyReserved:12, reorderPoint:30, costPrice:850,   sellPrice:1100,  currency:'ISK', vatRate:24, supplierName:'Líftækni',    createdAt:isoAgo(30), updatedAt:isoAgo(4) },
    { id:id('si'), sku:'CEM-001', name:'Sement — 25kg poki',    category:'Steypa',   unit:'stk', qtyOnHand:24,  qtyReserved:0,  reorderPoint:10, costPrice:2800,  sellPrice:3400,  currency:'ISK', vatRate:24, supplierName:'Íslenska steypan', createdAt:isoAgo(30), updatedAt:isoAgo(7) },
    { id:id('si'), sku:'SCR-001', name:'Skrúfur 4x60 — 200stk', category:'Festar',   unit:'pk',  qtyOnHand:18,  qtyReserved:2,  reorderPoint:5,  costPrice:1500,  sellPrice:1900,  currency:'ISK', vatRate:24, supplierName:'Húsasmiðjan', createdAt:isoAgo(30), updatedAt:isoAgo(6) },
    { id:id('si'), sku:'ROO-001', name:'Þakpappar — rúlla 20m²',category:'Þakefni',  unit:'rúlla',qtyOnHand:3,  qtyReserved:0,  reorderPoint:3,  costPrice:16000, sellPrice:19500, currency:'ISK', vatRate:24, supplierName:'Byko',        createdAt:isoAgo(30), updatedAt:isoAgo(2) },
  ];

  const stockMovements: StockMovement[] = [
    { id:id('sm'), itemId:stockItems[0].id, date:daysAgo(8),  type:'out',    qty:10, reference:'JOB-2026-001', createdAt:isoAgo(8) },
    { id:id('sm'), itemId:stockItems[2].id, date:daysAgo(8),  type:'out',    qty:24, reference:'JOB-2026-001', createdAt:isoAgo(8) },
    { id:id('sm'), itemId:stockItems[3].id, date:daysAgo(5),  type:'out',    qty:8,  reference:'JOB-2026-002', createdAt:isoAgo(5) },
    { id:id('sm'), itemId:stockItems[0].id, date:daysAgo(3),  type:'in',     qty:30, reference:'PO-2026-045',  createdAt:isoAgo(3) },
    { id:id('sm'), itemId:stockItems[1].id, date:daysAgo(3),  type:'in',     qty:20, reference:'PO-2026-045',  createdAt:isoAgo(3) },
    { id:id('sm'), itemId:stockItems[7].id, date:daysAgo(10), type:'out',    qty:5,  reference:'JOB-2026-001', createdAt:isoAgo(10) },
  ];

  // ── Payroll ───────────────────────────────────────────────
  const payrollEntries: PayrollEntry[] = [
    { id:id('pe'), employeeName:'Gunnar Sigurðsson', month:new Date().toISOString().slice(0,7), grossWage:580000, taxWithheld:214252, employeePension:23200, employerPension:66700, socialInsurance:36830, netWage:342548, notes:'Fastráðinn starfsmaður' },
    { id:id('pe'), employeeName:'Bjarni Ólafsson',   month:new Date().toISOString().slice(0,7), grossWage:480000, taxWithheld:177312, employeePension:19200, employerPension:55200, socialInsurance:30480, netWage:283488, notes:'Fastráðinn starfsmaður' },
    { id:id('pe'), employeeName:'Anna Magnúsdóttir', month:new Date().toISOString().slice(0,7), grossWage:440000, taxWithheld:138380, employeePension:17600, employerPension:50600, socialInsurance:27940, netWage:284020, notes:'Hlutastarf — 80%' },
  ];

  // ── Tasks ─────────────────────────────────────────────────
  const tasks: Task[] = [
    { id:id('task'), title:'Senda reikning R0042 til Jóns', priority:'high',   status:'open', dueDate:daysAgo(-1), linkedView:'invoices', createdAt:isoAgo(2) },
    { id:id('task'), title:'Kaupa meira timbur — lager lægur',  priority:'high',   status:'open', dueDate:daysAgo(-2), linkedView:'stock',    createdAt:isoAgo(1) },
    { id:id('task'), title:'Ljúka við eldhús — Hafnarfjörður',  priority:'medium', status:'open', dueDate:daysAgo(-5), linkedView:'jobs',     createdAt:isoAgo(3) },
    { id:id('task'), title:'Skoða VSK-skil fyrir apríl',        priority:'medium', status:'open', dueDate:daysAgo(-3), linkedView:'vatreturn', createdAt:isoAgo(4) },
    { id:id('task'), title:'Fá undirskrift á tilboð — Kópavogur', priority:'low', status:'open', dueDate:daysAgo(-7), linkedView:'jobs',     createdAt:isoAgo(1) },
    { id:id('task'), title:'Uppfæra launaskrá fyrir Maí',        priority:'low',   status:'done', completedAt:isoAgo(1), createdAt:isoAgo(6) },
  ];

  // ── Budget ────────────────────────────────────────────────
  const year = new Date().getFullYear();
  const budgetLines: BudgetLine[] = [
    { id:id('bl'), year, category:'sala_thjonustu', type:'income',  amounts:[2200000,2300000,2500000,2400000,2600000,2800000,2500000,2400000,2600000,2700000,2500000,2300000] },
    { id:id('bl'), year, category:'vorur',          type:'expense', amounts:[350000,380000,400000,360000,420000,440000,400000,380000,410000,430000,390000,360000] },
    { id:id('bl'), year, category:'laun',           type:'expense', amounts:[1100000,1100000,1100000,1100000,1100000,1100000,1100000,1100000,1100000,1100000,1100000,1100000] },
    { id:id('bl'), year, category:'samgongur',      type:'expense', amounts:[70000,75000,80000,72000,85000,90000,80000,75000,82000,88000,76000,70000] },
    { id:id('bl'), year, category:'simagjold',      type:'expense', amounts:[20000,20000,20000,20000,20000,20000,20000,20000,20000,20000,20000,20000] },
  ];

  // Strip previously loaded demo items (id contains '_demo_') before adding fresh ones
  const isDemo = (item: { id: string }) => item.id.includes('_demo_');
  return {
    transactions:  [...(existing.transactions  ?? []).filter(x => !isDemo(x)), ...transactions],
    invoices:      [...(existing.invoices      ?? []).filter(x => !isDemo(x)), ...invoices],
    jobs:          [...(existing.jobs          ?? []).filter(x => !isDemo(x)), ...jobs],
    timeEntries:   [...(existing.timeEntries   ?? []).filter(x => !isDemo(x)), ...timeEntries],
    jobMaterials:  [...(existing.jobMaterials  ?? []).filter(x => !isDemo(x)), ...jobMaterials],
    stockItems:    [...(existing.stockItems    ?? []).filter(x => !isDemo(x)), ...stockItems],
    stockMovements:[...(existing.stockMovements ?? []).filter(x => !isDemo(x)), ...stockMovements],
    payrollEntries:[...(existing.payrollEntries ?? []).filter(x => !isDemo(x)), ...payrollEntries],
    tasks:         [...(existing.tasks         ?? []).filter(x => !isDemo(x)), ...tasks],
    budgetLines:   [...(existing.budgetLines   ?? []).filter(x => !isDemo(x)), ...budgetLines],
    settings: {
      ...existing.settings,
      company: {
        ...existing.settings.company,
        name: existing.settings.company.name || 'Sigurður Builders ehf',
        kennitala: existing.settings.company.kennitala || '550892-2349',
        address: existing.settings.company.address || 'Klapparstígur 25',
        postalCode: existing.settings.company.postalCode || '101',
        city: existing.settings.company.city || 'Reykjavík',
        email: existing.settings.company.email || 'sigurdur@builders.is',
        phone: existing.settings.company.phone || '555-8800',
        vskNumber: existing.settings.company.vskNumber || 'IS123456',
      },
      invoiceLastNumber: Math.max(existing.settings.invoiceLastNumber ?? 0, 43),
    },
  };
}
