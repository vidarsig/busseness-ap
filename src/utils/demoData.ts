import {
  AppData, Transaction, Invoice, InvoiceLine, Job, TimeEntry,
  JobMaterial, StockItem, StockMovement, PayrollEntry, Task, BudgetLine,
} from '../types';

function id(prefix: string) { return `${prefix}_demo_${Math.random().toString(36).slice(2,8)}`; }
function daysAgo(n: number) { return new Date(Date.now() - n*24*60*60*1000).toISOString().slice(0,10); }
function isoAgo(n: number) { return new Date(Date.now() - n*24*60*60*1000).toISOString(); }

export function generateDemoData(existing: AppData): Partial<AppData> {

  const isIS  = existing.settings.language === 'is';
  const rawCur = existing.settings.defaultCurrency || 'ISK';
  const cur   = isIS ? 'ISK' : (rawCur === 'ISK' ? 'USD' : rawCur);
  const isUSD = cur === 'USD';
  // ISK reference rates: 1 USD ≈ 138 ISK, 1 EUR ≈ 150 ISK
  const iskRate = isUSD ? 138 : (existing.settings.exchangeRates?.EUR ?? 150);
  const a = (isk: number) => cur === 'ISK' ? isk : Math.round(isk / iskRate);

  // Locale flavour
  const isEN_US = isUSD;

  const enDesc = (uk: string, us: string) => isIS ? '' : (isEN_US ? us : uk);

  // ── Transactions ─────────────────────────────────────────
  const transactions: Transaction[] = [
    { id:id('tx'), date:daysAgo(1),  description: isIS ? 'Þakviðgerð — Skólavörðustígur 12'   : enDesc('Roof repair — 14 Oak Street',        'Roof repair — 123 Main St, Brooklyn'),     category:'sala_thjonustu', type:'income',  amount:a(485000), currency:cur, eurToIskRate:iskRate, vatRate:isIS ? 24 : 0 },
    { id:id('tx'), date:daysAgo(3),  description: isIS ? 'Pípulagnir — Laugavegur 45'          : enDesc('Plumbing — High Street 45',          'Plumbing — 456 Oak Ave, Queens'),          category:'sala_thjonustu', type:'income',  amount:a(320000), currency:cur, eurToIskRate:iskRate, vatRate:0 },
    { id:id('tx'), date:daysAgo(5),  description: isIS ? 'Viðgerð á baðherbergi'               : enDesc('Bathroom renovation',                'Bathroom remodel — Riverside Dr'),         category:'sala_thjonustu', type:'income',  amount:a(195000), currency:cur, eurToIskRate:iskRate, vatRate:0 },
    { id:id('tx'), date:daysAgo(7),  description: isIS ? 'Steinlagnir — Kópavogur'             : enDesc('Concrete work — Northside',          'Concrete work — Staten Island'),           category:'sala_thjonustu', type:'income',  amount:a(560000), currency:cur, eurToIskRate:iskRate, vatRate:0 },
    { id:id('tx'), date:daysAgo(10), description: isIS ? 'Eldhúsuppsetning — Hafnarfjörður'    : enDesc('Kitchen installation — Riverside',   'Kitchen remodel — Park Slope, BK'),        category:'sala_thjonustu', type:'income',  amount:a(720000), currency:cur, eurToIskRate:iskRate, vatRate:0 },
    { id:id('tx'), date:daysAgo(12), description: isIS ? 'Byko — Timbur og einangrun'          : enDesc('Timber & insulation supplies',       'Home Depot — Lumber & insulation'),        category:'vorur',          type:'expense', amount:a(87500),  currency:cur, eurToIskRate:iskRate, vatRate:0 },
    { id:id('tx'), date:daysAgo(14), description: isIS ? 'Rafmagnsfarir — verkfæri'            : enDesc('Electrical tools & equipment',       'Electrical tools & equipment'),            category:'vorur',          type:'expense', amount:a(34200),  currency:cur, eurToIskRate:iskRate, vatRate:0 },
    { id:id('tx'), date:daysAgo(15), description: isIS ? 'Líftæknivörur — Pípuhlutir'         : enDesc('Plumbing parts & fittings',          'Plumbing parts & fittings'),               category:'vorur',          type:'expense', amount:a(52800),  currency:cur, eurToIskRate:iskRate, vatRate:0 },
    { id:id('tx'), date:daysAgo(18), description: isIS ? 'Olía og bifreiðakostnaður'           : enDesc('Fuel & vehicle costs',               'Fuel & truck expenses'),                   category:'samgongur',      type:'expense', amount:a(28600),  currency:cur, eurToIskRate:iskRate, vatRate:0 },
    { id:id('tx'), date:daysAgo(20), description: isIS ? 'Steypustöðin — Steypa'              : enDesc('Ready-mix concrete',                 'Ready-mix concrete — 4 yards'),            category:'vorur',          type:'expense', amount:a(118000), currency:cur, eurToIskRate:iskRate, vatRate:0 },
    { id:id('tx'), date:daysAgo(22), description: isIS ? 'Rafmagn og hiti — verkstaður'        : enDesc('Electricity & heating — site',       'Utilities — job site'),                    category:'rafmagn_hiti',   type:'expense', amount:a(42000),  currency:cur, eurToIskRate:iskRate, vatRate:0 },
    { id:id('tx'), date:daysAgo(25), description: isIS ? 'Sími og nettenging'                  : enDesc('Phone & internet',                   'Phone & internet'),                        category:'simagjold',      type:'expense', amount:a(15900),  currency:cur, eurToIskRate:iskRate, vatRate:0 },
    { id:id('tx'), date:daysAgo(28), description: isIS ? 'Bílastæðavinur — Þakviðgerð'        : enDesc('Roof repair — Parkside Drive',       'Roof repair — Jersey City, NJ'),           category:'sala_thjonustu', type:'income',  amount:a(280000), currency:cur, eurToIskRate:iskRate, vatRate:0 },
    { id:id('tx'), date:daysAgo(30), description: isIS ? 'Tryggingar — atvinnuslys'            : enDesc('Insurance — workplace cover',        'General liability insurance'),             category:'fagthjonusta',   type:'expense', amount:a(68000),  currency:cur, eurToIskRate:iskRate, vatRate:0 },
    { id:id('tx'), date:daysAgo(32), description: isIS ? 'Hlíf — Bygg og byggingarefni'        : enDesc('Building materials & supplies',      'Lowe\'s — Building materials'),            category:'vorur',          type:'expense', amount:a(94500),  currency:cur, eurToIskRate:iskRate, vatRate:0 },
  ];

  // ── Workers & clients ─────────────────────────────────────
  const w1 = isIS ? 'Gunnar Sigurðsson' : (isEN_US ? 'James Mitchell'  : 'James Mitchell');
  const w2 = isIS ? 'Bjarni Ólafsson'   : (isEN_US ? 'Robert Clark'    : 'Robert Clarke');
  const w3 = isIS ? 'Anna Magnúsdóttir' : (isEN_US ? 'Sarah Thompson'  : 'Sarah Thompson');

  const c1 = isIS
    ? { name:'Jón Gunnarsson',               email:'jon@example.is',      phone:'555-1234',     address:'Skólavörðustígur 12, 101 Reykjavík' }
    : isEN_US
    ? { name:'James Harrington',             email:'james@example.com',   phone:'(718) 555-0123', address:'123 Main Street, Brooklyn, NY 11201' }
    : { name:'James Harrington',             email:'james@example.co.uk', phone:'07700 900123',  address:'14 Oak Street, London EC1A 1BB' };
  const c2 = isIS
    ? { name:'Sigríður Björnsdóttir',        email:'sigridur@example.is', phone:'555-5678',     address:'Laugavegur 45, 105 Reykjavík' }
    : isEN_US
    ? { name:'Patricia Williams',            email:'pat@example.com',     phone:'(917) 555-0456', address:'456 Oak Avenue, Queens, NY 11354' }
    : { name:'Patricia Williams',            email:'pat@example.co.uk',   phone:'07700 900456',  address:'45 High Street, Manchester M1 1AD' };
  const c3 = isIS
    ? { name:'Byggingafélag Suðurnesja ehf', email:'bygg@example.is',    phone:'555-9012',     address:'Keflavíkurgata 8, 230 Reykjanesbær' }
    : isEN_US
    ? { name:'Riverside Developments LLC',   email:'info@riverside.com',  phone:'(212) 555-0789', address:'789 Park Drive, Manhattan, NY 10001' }
    : { name:'Northside Developments Ltd',   email:'info@northside.co.uk',phone:'020 7946 0001', address:'Northside Business Park, Bristol BS1 4DJ' };
  const c4 = isIS
    ? { name:'Arna Kristjánsdóttir',         email:'arna@example.is',    phone:'555-3456',     address:'Barónsstígur 22, 101 Reykjavík' }
    : isEN_US
    ? { name:'Amanda Clarke',                email:'amanda@example.com',  phone:'(347) 555-0321', address:'321 Riverside Drive, Jersey City, NJ 07302' }
    : { name:'Amanda Clarke',                email:'amanda@example.co.uk',phone:'07700 900789',  address:'22 Riverside Close, Leeds LS1 2AB' };

  const invLines1: InvoiceLine[] = [
    { id:id('il'), description: isIS ? `Vinnulaun — ${w1} (24h)` : `Labour — ${w1} (24h)`,   quantity:24, unitPrice:a(5500*24)/24,  vatRate:24 },
    { id:id('il'), description: isIS ? `Vinnulaun — ${w2} (16h)` : `Labour — ${w2} (16h)`,   quantity:16, unitPrice:a(5000*16)/16,  vatRate:24 },
    { id:id('il'), description: isIS ? 'Þakpappar og einangrun'  : 'Roofing felt & insulation', quantity:1, unitPrice:a(87500),    vatRate:24 },
    { id:id('il'), description: isIS ? 'Festingar og varahlutir' : 'Fixings & spare parts',   quantity:1,  unitPrice:a(18000),    vatRate:24 },
  ];
  const invLines2: InvoiceLine[] = [
    { id:id('il'), description: isIS ? 'Vinnulaun — Eldhúsuppsetning (32h)' : 'Labour — Kitchen installation (32h)', quantity:32, unitPrice:a(5500*32)/32, vatRate:24 },
    { id:id('il'), description: isIS ? 'Skápar og hurðir — IKEA Business'   : 'Cabinets & doors — IKEA Business',   quantity:1,  unitPrice:a(245000), vatRate:24 },
    { id:id('il'), description: isIS ? 'Pípulagnir og rafmagn'              : 'Plumbing & electrical',               quantity:1,  unitPrice:a(68000),  vatRate:24 },
  ];
  const invLines3: InvoiceLine[] = [
    { id:id('il'), description: isIS ? 'Vinnulaun — Steypuvinna (40h)' : 'Labour — Concrete work (40h)', quantity:40, unitPrice:a(5500*40)/40, vatRate:24 },
    { id:id('il'), description: isIS ? 'Steypa — 4 m³'                 : 'Ready-mix concrete — 4 m³',   quantity:4,  unitPrice:a(28000),     vatRate:24 },
    { id:id('il'), description: isIS ? 'Járn og járnakerfi'            : 'Steel & rebar framework',      quantity:1,  unitPrice:a(95000),     vatRate:24 },
  ];

  const invoices: Invoice[] = [
    {
      id:id('inv'), number:'R0042', type:'invoice',
      date:daysAgo(2), dueDate:daysAgo(-28),
      customer:c1, lines:invLines1,
      notes: isIS ? 'Þakviðgerð lokið. Greiðsla innan 30 daga.' : 'Roof repair completed. Payment due within 30 days.',
      status:'sent', currency:cur, eurToIskRate:iskRate,
    },
    {
      id:id('inv'), number:'R0041', type:'invoice',
      date:daysAgo(10), dueDate:daysAgo(-20),
      customer:c2, lines:invLines2,
      notes: isIS ? 'Eldhúsuppsetning. Takk fyrir viðskiptin.' : 'Kitchen installation complete. Thank you for your business.',
      status:'paid', currency:cur, eurToIskRate:iskRate,
    },
    {
      id:id('inv'), number:'R0040', type:'invoice',
      date:daysAgo(20), dueDate:daysAgo(10),
      customer:c3, lines:invLines3,
      notes: isIS ? 'Steypuvinna — 1. hluti af stærra verkefni.' : 'Concrete works — phase 1 of larger project.',
      status:'overdue', currency:cur, eurToIskRate:iskRate,
    },
    {
      id:id('inv'), number:'R0043', type:'quote',
      date:daysAgo(1), dueDate:daysAgo(-14),
      customer:c4,
      lines:[
        { id:id('il'), description: isIS ? 'Baðherbergisuppsetning — vinnulaun' : 'Bathroom renovation — labour', quantity:20, unitPrice:a(5500*20)/20, vatRate:24 },
        { id:id('il'), description: isIS ? 'Flísar og festingar'                : 'Tiles & fixings',              quantity:1,  unitPrice:a(145000),      vatRate:24 },
      ],
      notes: isIS ? 'Tilboð gilt í 14 daga.' : 'Quote valid for 14 days.',
      status:'draft', currency:cur, eurToIskRate:iskRate,
    },
  ];

  // ── Jobs ─────────────────────────────────────────────────
  const job1Id = id('job');
  const job2Id = id('job');
  const job3Id = id('job');

  const jobs: Job[] = [
    {
      id:job1Id, number:'JOB-2026-001',
      name:        isIS ? 'Þakviðgerð — Skólavörðustígur'        : 'Roof Repair — Oak Street',
      clientName:  isIS ? 'Jón Gunnarsson'                        : 'James Harrington',
      clientEmail: isIS ? 'jon@example.is'                        : 'james@example.co.uk',
      clientPhone: isIS ? '555-1234'                              : '07700 900123',
      address:     isIS ? 'Skólavörðustígur 12, 101 Reykjavík'   : '14 Oak Street, London EC1A 1BB',
      status:'complete', startDate:daysAgo(8), endDate:daysAgo(2),
      quotedAmount:a(620000), currency:cur,
      description: isIS ? 'Viðgerð á þaki eftir stormskemmdir. Skipta um þakpappa og einangrun.' : 'Roof repair after storm damage. Replace felt and insulation.',
      notes:       isIS ? 'Viðskiptavinur vill fá reikning strax.' : 'Client requested invoice immediately.',
      createdAt:isoAgo(10), updatedAt:isoAgo(2),
    },
    {
      id:job2Id, number:'JOB-2026-002',
      name:        isIS ? 'Eldhúsuppsetning — Hafnarfjörður'      : 'Kitchen Installation — Riverside',
      clientName:  isIS ? 'Sigríður Björnsdóttir'                 : 'Patricia Williams',
      clientEmail: isIS ? 'sigridur@example.is'                   : 'pat@example.co.uk',
      clientPhone: isIS ? '555-5678'                              : '07700 900456',
      address:     isIS ? 'Suðurgata 7, 220 Hafnarfjörður'        : '45 High Street, Manchester M1 1AD',
      status:'active', startDate:daysAgo(5),
      quotedAmount:a(890000), currency:cur,
      description: isIS ? 'Fullkomin eldhúsuppsetning. Nýir skápar, pípulagnir og rafmagn.' : 'Full kitchen refit. New cabinets, plumbing and electrics.',
      notes:       isIS ? 'Viðskiptavinur vill ljósa steinflísar.' : 'Client requested light stone tiles.',
      createdAt:isoAgo(6), updatedAt:isoAgo(1),
    },
    {
      id:job3Id, number:'JOB-2026-003',
      name:        isIS ? 'Steypuvinna — Kópavogur'               : 'Concrete Foundation — Northside',
      clientName:  isIS ? 'Byggingafélag Suðurnesja ehf'          : 'Northside Developments Ltd',
      clientEmail: isIS ? 'bygg@example.is'                       : 'info@northside.co.uk',
      clientPhone: isIS ? '555-9012'                              : '020 7946 0001',
      address:     isIS ? 'Hamraborg 5, 200 Kópavogur'            : 'Northside Business Park, Bristol BS1 4DJ',
      status:'quote', startDate:daysAgo(-7),
      quotedAmount:a(1450000), currency:cur,
      description: isIS ? 'Steypugrunnur fyrir nýtt hús. 4 m³ steypa, járnakerfi.' : 'Concrete foundation for new build. 4 m³ concrete, rebar framework.',
      createdAt:isoAgo(2), updatedAt:isoAgo(1),
    },
  ];

  // ── Time entries ──────────────────────────────────────────
  const timeEntries: TimeEntry[] = [
    { id:id('te'), jobId:job1Id, date:daysAgo(8), employeeName:w1, hours:8, hourlyRate:a(5500), description: isIS ? 'Rif gamlan þakpappa'     : 'Stripped old roofing felt',   createdAt:isoAgo(8) },
    { id:id('te'), jobId:job1Id, date:daysAgo(7), employeeName:w1, hours:8, hourlyRate:a(5500), description: isIS ? 'Lagði einangrun'          : 'Laid new insulation',         createdAt:isoAgo(7) },
    { id:id('te'), jobId:job1Id, date:daysAgo(6), employeeName:w1, hours:8, hourlyRate:a(5500), description: isIS ? 'Festingarvinna'           : 'Fixing & fastening',          createdAt:isoAgo(6) },
    { id:id('te'), jobId:job1Id, date:daysAgo(5), employeeName:w2, hours:8, hourlyRate:a(5000), description: isIS ? 'Lokavinna og þrif'        : 'Final work & clean-up',       createdAt:isoAgo(5) },
    { id:id('te'), jobId:job1Id, date:daysAgo(4), employeeName:w2, hours:8, hourlyRate:a(5000), description: isIS ? 'Eftirskoðun og lokun'     : 'Inspection & sign-off',       createdAt:isoAgo(4) },
    { id:id('te'), jobId:job2Id, date:daysAgo(5), employeeName:w1, hours:8, hourlyRate:a(5500), description: isIS ? 'Rif gamla eldhús'         : 'Stripped old kitchen',        createdAt:isoAgo(5) },
    { id:id('te'), jobId:job2Id, date:daysAgo(4), employeeName:w1, hours:8, hourlyRate:a(5500), description: isIS ? 'Pípulagnir'               : 'Plumbing installation',       createdAt:isoAgo(4) },
    { id:id('te'), jobId:job2Id, date:daysAgo(3), employeeName:w3, hours:6, hourlyRate:a(5000), description: isIS ? 'Flísalagnir'              : 'Tiling work',                 createdAt:isoAgo(3) },
    { id:id('te'), jobId:job2Id, date:daysAgo(2), employeeName:w3, hours:8, hourlyRate:a(5000), description: isIS ? 'Skápar og hurðir'         : 'Cabinets & doors',            createdAt:isoAgo(2) },
    { id:id('te'), jobId:job2Id, date:daysAgo(1), employeeName:w1, hours:6, hourlyRate:a(5500), description: isIS ? 'Rafmagnsvinna'            : 'Electrical work',             createdAt:isoAgo(1) },
  ];

  // ── Materials ─────────────────────────────────────────────
  const jobMaterials: JobMaterial[] = [
    { id:id('jm'), jobId:job1Id, date:daysAgo(8), description: isIS ? 'Þakpappar — 120m²'       : 'Roofing felt — 120m²',       qty:120, unit:'m²',   unitCost:a(850),   supplierName: isIS ? 'Byko'        : 'Travis Perkins', createdAt:isoAgo(8) },
    { id:id('jm'), jobId:job1Id, date:daysAgo(8), description: isIS ? 'Einangrun 200mm'          : 'Insulation 200mm',           qty:24,  unit:'pcs',  unitCost:a(3200),  supplierName: isIS ? 'Byko'        : 'Travis Perkins', createdAt:isoAgo(8) },
    { id:id('jm'), jobId:job1Id, date:daysAgo(7), description: isIS ? 'Festingar og skrúfur'     : 'Fixings & screws pack',      qty:1,   unit:'pack', unitCost:a(8500),  supplierName: isIS ? 'Húsasmiðjan' : 'Screwfix',        createdAt:isoAgo(7) },
    { id:id('jm'), jobId:job2Id, date:daysAgo(5), description: isIS ? 'Pípuhlutir — full sett'   : 'Plumbing kit — full set',    qty:1,   unit:'set',  unitCost:a(68000), supplierName: isIS ? 'Líftækni'    : 'Wolseley',        createdAt:isoAgo(5) },
    { id:id('jm'), jobId:job2Id, date:daysAgo(4), description: isIS ? 'IKEA Metod skápar'        : 'IKEA Metod cabinets',        qty:8,   unit:'pcs',  unitCost:a(28000), supplierName: 'IKEA',                                    createdAt:isoAgo(4) },
    { id:id('jm'), jobId:job2Id, date:daysAgo(3), description: isIS ? 'Steinflísar — 20m²'       : 'Stone tiles — 20m²',        qty:20,  unit:'m²',   unitCost:a(6800),  supplierName: isIS ? 'Flísaverið'  : 'Topps Tiles',     createdAt:isoAgo(3) },
  ];

  // ── Stock ─────────────────────────────────────────────────
  const stockItems: StockItem[] = [
    { id:id('si'), sku:'TIM-001', name: isIS ? 'Timbur 2x4 — 3m'        : 'Timber 2x4 — 3m',         category: isIS ? 'Timbur'      : 'Timber',    unit:'pcs',  qtyOnHand:45, qtyReserved:10, reorderPoint:20, costPrice:a(1800),  sellPrice:a(2200),  currency:cur, vatRate:24, supplierName: isIS ? 'Byko' : 'Travis Perkins', createdAt:isoAgo(30), updatedAt:isoAgo(2) },
    { id:id('si'), sku:'TIM-002', name: isIS ? 'Timbur 2x6 — 3m'        : 'Timber 2x6 — 3m',         category: isIS ? 'Timbur'      : 'Timber',    unit:'pcs',  qtyOnHand:12, qtyReserved:5,  reorderPoint:15, costPrice:a(2400),  sellPrice:a(2900),  currency:cur, vatRate:24, supplierName: isIS ? 'Byko' : 'Travis Perkins', createdAt:isoAgo(30), updatedAt:isoAgo(3) },
    { id:id('si'), sku:'INS-001', name: isIS ? 'Einangrun 200mm'         : 'Insulation 200mm',         category: isIS ? 'Einangrun'   : 'Insulation',unit:'pcs',  qtyOnHand:8,  qtyReserved:0,  reorderPoint:10, costPrice:a(3200),  sellPrice:a(3900),  currency:cur, vatRate:24, supplierName: isIS ? 'Byko' : 'Travis Perkins', createdAt:isoAgo(30), updatedAt:isoAgo(5) },
    { id:id('si'), sku:'PIP-001', name: isIS ? 'Koparrörir 22mm — 1m'   : 'Copper pipe 22mm — 1m',    category: isIS ? 'Pípulagnir'  : 'Plumbing',  unit:'pcs',  qtyOnHand:30, qtyReserved:8,  reorderPoint:20, costPrice:a(1200),  sellPrice:a(1600),  currency:cur, vatRate:24, supplierName: isIS ? 'Líftækni' : 'Wolseley', createdAt:isoAgo(30), updatedAt:isoAgo(4) },
    { id:id('si'), sku:'PIP-002', name: isIS ? 'Koparrörir 15mm — 1m'   : 'Copper pipe 15mm — 1m',    category: isIS ? 'Pípulagnir'  : 'Plumbing',  unit:'pcs',  qtyOnHand:55, qtyReserved:12, reorderPoint:30, costPrice:a(850),   sellPrice:a(1100),  currency:cur, vatRate:24, supplierName: isIS ? 'Líftækni' : 'Wolseley', createdAt:isoAgo(30), updatedAt:isoAgo(4) },
    { id:id('si'), sku:'CEM-001', name: isIS ? 'Sement — 25kg poki'     : 'Cement — 25kg bag',        category: isIS ? 'Steypa'      : 'Concrete',  unit:'pcs',  qtyOnHand:24, qtyReserved:0,  reorderPoint:10, costPrice:a(2800),  sellPrice:a(3400),  currency:cur, vatRate:24, supplierName: isIS ? 'Íslenska steypan' : 'Aggregate Industries', createdAt:isoAgo(30), updatedAt:isoAgo(7) },
    { id:id('si'), sku:'SCR-001', name: isIS ? 'Skrúfur 4x60 — 200stk' : 'Screws 4x60 — 200pcs',     category: isIS ? 'Festar'      : 'Fixings',   unit:'pack', qtyOnHand:18, qtyReserved:2,  reorderPoint:5,  costPrice:a(1500),  sellPrice:a(1900),  currency:cur, vatRate:24, supplierName: isIS ? 'Húsasmiðjan' : 'Screwfix', createdAt:isoAgo(30), updatedAt:isoAgo(6) },
    { id:id('si'), sku:'ROO-001', name: isIS ? 'Þakpappar — rúlla 20m²': 'Roofing felt — roll 20m²',  category: isIS ? 'Þakefni'     : 'Roofing',   unit:'roll', qtyOnHand:3,  qtyReserved:0,  reorderPoint:3,  costPrice:a(16000), sellPrice:a(19500), currency:cur, vatRate:24, supplierName: isIS ? 'Byko' : 'Jewson', createdAt:isoAgo(30), updatedAt:isoAgo(2) },
  ];

  const stockMovements: StockMovement[] = [
    { id:id('sm'), itemId:stockItems[0].id, date:daysAgo(8),  type:'out', qty:10, reference:'JOB-2026-001', createdAt:isoAgo(8) },
    { id:id('sm'), itemId:stockItems[2].id, date:daysAgo(8),  type:'out', qty:24, reference:'JOB-2026-001', createdAt:isoAgo(8) },
    { id:id('sm'), itemId:stockItems[3].id, date:daysAgo(5),  type:'out', qty:8,  reference:'JOB-2026-002', createdAt:isoAgo(5) },
    { id:id('sm'), itemId:stockItems[0].id, date:daysAgo(3),  type:'in',  qty:30, reference:'PO-2026-045',  createdAt:isoAgo(3) },
    { id:id('sm'), itemId:stockItems[1].id, date:daysAgo(3),  type:'in',  qty:20, reference:'PO-2026-045',  createdAt:isoAgo(3) },
    { id:id('sm'), itemId:stockItems[7].id, date:daysAgo(10), type:'out', qty:5,  reference:'JOB-2026-001', createdAt:isoAgo(10) },
  ];

  // ── Payroll ───────────────────────────────────────────────
  const month = new Date().toISOString().slice(0,7);
  const payrollEntries: PayrollEntry[] = [
    { id:id('pe'), employeeName:w1, month, grossWage:a(580000), taxWithheld:a(214252), employeePension:a(23200), employerPension:a(66700), socialInsurance:a(36830), netWage:a(342548), notes: isIS ? 'Fastráðinn starfsmaður' : 'Full-time employee' },
    { id:id('pe'), employeeName:w2, month, grossWage:a(480000), taxWithheld:a(177312), employeePension:a(19200), employerPension:a(55200), socialInsurance:a(30480), netWage:a(283488), notes: isIS ? 'Fastráðinn starfsmaður' : 'Full-time employee' },
    { id:id('pe'), employeeName:w3, month, grossWage:a(440000), taxWithheld:a(138380), employeePension:a(17600), employerPension:a(50600), socialInsurance:a(27940), netWage:a(284020), notes: isIS ? 'Hlutastarf — 80%'      : 'Part-time — 80%' },
  ];

  // ── Tasks ─────────────────────────────────────────────────
  const tasks: Task[] = [
    { id:id('task'), title: isIS ? 'Senda reikning R0042 til Jóns'          : 'Send invoice R0042 to James',         priority:'high',   status:'open', dueDate:daysAgo(-1), linkedView:'invoices',  createdAt:isoAgo(2) },
    { id:id('task'), title: isIS ? 'Kaupa meira timbur — lager lægur'       : 'Order more timber — stock running low',priority:'high',   status:'open', dueDate:daysAgo(-2), linkedView:'stock',     createdAt:isoAgo(1) },
    { id:id('task'), title: isIS ? 'Ljúka við eldhús — Hafnarfjörður'       : 'Complete kitchen — Riverside job',     priority:'medium', status:'open', dueDate:daysAgo(-5), linkedView:'jobs',      createdAt:isoAgo(3) },
    { id:id('task'), title: isIS ? 'Skoða VSK-skil fyrir apríl'             : 'Review VAT return for April',          priority:'medium', status:'open', dueDate:daysAgo(-3), linkedView:'vatreturn', createdAt:isoAgo(4) },
    { id:id('task'), title: isIS ? 'Fá undirskrift á tilboð — Kópavogur'    : 'Get quote signed — Northside job',     priority:'low',    status:'open', dueDate:daysAgo(-7), linkedView:'jobs',      createdAt:isoAgo(1) },
    { id:id('task'), title: isIS ? 'Uppfæra launaskrá fyrir Maí'            : 'Update payroll for May',               priority:'low',    status:'done', completedAt:isoAgo(1),                       createdAt:isoAgo(6) },
  ];

  // ── Budget ────────────────────────────────────────────────
  const year = new Date().getFullYear();
  const budgetLines: BudgetLine[] = [
    { id:id('bl'), year, category:'sala_thjonustu', type:'income',  amounts:[a(2200000),a(2300000),a(2500000),a(2400000),a(2600000),a(2800000),a(2500000),a(2400000),a(2600000),a(2700000),a(2500000),a(2300000)] },
    { id:id('bl'), year, category:'vorur',          type:'expense', amounts:[a(350000),a(380000),a(400000),a(360000),a(420000),a(440000),a(400000),a(380000),a(410000),a(430000),a(390000),a(360000)] },
    { id:id('bl'), year, category:'laun',           type:'expense', amounts:[a(1100000),a(1100000),a(1100000),a(1100000),a(1100000),a(1100000),a(1100000),a(1100000),a(1100000),a(1100000),a(1100000),a(1100000)] },
    { id:id('bl'), year, category:'samgongur',      type:'expense', amounts:[a(70000),a(75000),a(80000),a(72000),a(85000),a(90000),a(80000),a(75000),a(82000),a(88000),a(76000),a(70000)] },
    { id:id('bl'), year, category:'simagjold',      type:'expense', amounts:[a(20000),a(20000),a(20000),a(20000),a(20000),a(20000),a(20000),a(20000),a(20000),a(20000),a(20000),a(20000)] },
  ];

  // Strip old demo data, merge fresh
  const isDemo = (item: { id: string }) => item.id.includes('_demo_');
  return {
    transactions:   [...(existing.transactions   ?? []).filter(x => !isDemo(x)), ...transactions],
    invoices:       [...(existing.invoices        ?? []).filter(x => !isDemo(x)), ...invoices],
    jobs:           [...(existing.jobs            ?? []).filter(x => !isDemo(x)), ...jobs],
    timeEntries:    [...(existing.timeEntries     ?? []).filter(x => !isDemo(x)), ...timeEntries],
    jobMaterials:   [...(existing.jobMaterials    ?? []).filter(x => !isDemo(x)), ...jobMaterials],
    stockItems:     [...(existing.stockItems      ?? []).filter(x => !isDemo(x)), ...stockItems],
    stockMovements: [...(existing.stockMovements  ?? []).filter(x => !isDemo(x)), ...stockMovements],
    payrollEntries: [...(existing.payrollEntries  ?? []).filter(x => !isDemo(x)), ...payrollEntries],
    tasks:          [...(existing.tasks           ?? []).filter(x => !isDemo(x)), ...tasks],
    budgetLines:    [...(existing.budgetLines     ?? []).filter(x => !isDemo(x)), ...budgetLines],
    settings: {
      ...existing.settings,
      defaultCurrency: cur,
      company: {
        ...existing.settings.company,
        name:        existing.settings.company.name        || (isIS ? 'Sigurður Builders ehf'       : isEN_US ? 'Sigurdur Builders LLC'          : 'Sigurdur Builders Ltd'),
        kennitala:   existing.settings.company.kennitala   || (isIS ? '550892-2349'                : ''),
        address:     existing.settings.company.address     || (isIS ? 'Klapparstígur 25'           : isEN_US ? '30 N Gould St, Sheridan'        : '25 Harbour Road'),
        postalCode:  existing.settings.company.postalCode  || (isIS ? '101'                        : isEN_US ? 'WY 82801'                       : 'EC1A 1BB'),
        city:        existing.settings.company.city        || (isIS ? 'Reykjavík'                  : isEN_US ? 'New York'                       : 'London'),
        email:       existing.settings.company.email       || (isIS ? 'sigurdur@builders.is'       : isEN_US ? 'info@sigurdurbuilders.com'       : 'info@sigurdurbuilders.co.uk'),
        phone:       existing.settings.company.phone       || (isIS ? '555-8800'                   : isEN_US ? '(307) 555-0800'                 : '+44 20 7946 0800'),
        vskNumber:   existing.settings.company.vskNumber   || (isIS ? 'IS123456'                   : isEN_US ? 'EIN 82-1234567'                 : 'GB123456789'),
      },
      invoiceLastNumber: Math.max(existing.settings.invoiceLastNumber ?? 0, 43),
    },
  };
}
