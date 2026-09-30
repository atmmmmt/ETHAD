import RAW from './accounts.json';

/* ==========================================================================
   Chart of accounts — imported from the club's current system (Al-Rashid)
   Codes are hierarchical: 2 → 3 → 6 → 9 digits.
   ========================================================================== */

export const TODAY = '2026-09-30';
export const YEAR = '2026';

export const ACCOUNTS = RAW.map(([code, name, kind]) => ({ code, name, kind }));
export const ACC = Object.fromEntries(ACCOUNTS.map((a) => [a.code, a]));

export function parentOf(code) {
  const l = code.length;
  if (l > 6) return code.slice(0, 6);
  if (l > 3) return code.slice(0, 3);
  if (l > 2) return code.slice(0, 2);
  return null;
}

// real parent may skip a level if it does not exist in the chart
export function realParent(code) {
  let p = parentOf(code);
  while (p && !ACC[p]) p = parentOf(p);
  return p;
}

export const CHILDREN = {};
ACCOUNTS.forEach((a) => {
  const p = realParent(a.code);
  (CHILDREN[p || 'root'] ||= []).push(a.code);
});
export const isLeaf = (code) => !CHILDREN[code];
export const LEAVES = ACCOUNTS.filter((a) => isLeaf(a.code));

export const ROOT_GROUPS = [
  { key: '1', name: 'الأصول والمدينون' },
  { key: '2', name: 'الخصوم والدائنون' },
  { key: '3', name: 'النفقات' },
  { key: '4', name: 'الواردات' },
];

// debit-natured: assets (1x) and expenses (3x)
export const isDebitNature = (code) => code[0] === '1' || code[0] === '3';

export function accLabel(code) {
  const a = ACC[code];
  return a ? `${code} · ${a.name}` : code;
}

// short, unambiguous name: sport-level accounts show their parent too
export function accName(code) {
  const a = ACC[code];
  if (!a) return code;
  if (code.length === 9 && ACC[code.slice(0, 6)]) return `${ACC[code.slice(0, 6)].name} · ${a.name}`;
  return a.name;
}

export function accPath(code) {
  const out = [];
  let c = code;
  while (c) {
    if (ACC[c]) out.unshift(ACC[c].name);
    c = realParent(c);
  }
  return out.join(' ← ');
}

/* ---- sports = the 9-digit suffix of activity accounts (332/339/432) ---- */
export function sportOf(code) {
  if (code.length !== 9) return null;
  const n = ACC[code]?.name || '';
  if (n.includes('قدم')) return 'football';
  if (n.includes('سلة') || n.includes('سله')) return 'basketball';
  if (n.includes('اليد')) return 'handball';
  return 'other';
}
export const SPORTS = {
  football: 'كرة القدم',
  basketball: 'كرة السلة',
  handball: 'كرة اليد',
  other: 'ألعاب أخرى',
};

/* ==========================================================================
   Deterministic demo data — every posting uses a real account code
   ========================================================================== */

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
const r2 = (n) => Math.round(n * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
const months = (to = 9) => Array.from({ length: to }, (_, i) => i + 1);

export const EMPLOYEES_SEED = [
  ['موظف 01', 'المالية', 'رئيس المحاسبة', 1200, 100],
  ['موظف 02', 'المالية', 'محاسب', 750, 50],
  ['موظف 03', 'المالية', 'محاسب', 700, 50],
  ['موظف 04', 'المالية', 'أمين صندوق', 650, 40],
  ['موظف 05', 'الإدارة', 'مدير إداري', 1100, 100],
  ['موظف 06', 'الإدارة', 'سكرتارية', 500, 30],
  ['موظف 07', 'الموارد البشرية', 'مسؤول شؤون الموظفين', 700, 50],
  ['موظف 08', 'المستودعات', 'أمين مستودع', 550, 30],
  ['موظف 09', 'المشتريات', 'مسؤول مشتريات', 650, 40],
  ['موظف 10', 'الإعلام', 'مسؤول إعلامي', 700, 50],
  ['موظف 11', 'المنشآت', 'مشرف صيانة', 600, 40],
  ['موظف 12', 'المنشآت', 'فني كهرباء', 480, 30],
  ['موظف 13', 'المنشآت', 'حارس', 380, 20],
  ['موظف 14', 'المنشآت', 'حارس', 380, 20],
].map(([name, dept, position, base, allowance], i) => ({
  id: 'E' + pad(i + 1), name, dept, position, base, allowance, active: true,
}));

export const INVESTORS_SEED = [
  { id: 'I1', name: 'استثمار المقصف والمسبح', revenue: '432005001', type: 'شهري', amount: 3000, start: 1, count: 12, every: 1, paidUntil: 7 },
  { id: 'I2', name: 'استثمار المحلات من 1 إلى 37', revenue: '432013002', type: 'ربعي', amount: 27000, start: 1, count: 4, every: 3, paidUntil: 4 },
  { id: 'I3', name: 'الملعب العشبي', revenue: '432013006', type: 'شهري', amount: 2000, start: 1, count: 12, every: 1, paidUntil: 9 },
  { id: 'I4', name: 'استثمار اسم وشعار النادي', revenue: '432007001', type: 'ربعي', amount: 12000, start: 1, count: 4, every: 3, paidUntil: 7 },
  { id: 'I5', name: 'شركة سوا إنترنت', revenue: '432015001', type: 'شهري', amount: 600, start: 1, count: 12, every: 1, paidUntil: 9 },
  { id: 'I6', name: 'بوفيه مقر الجميلية', revenue: '432005002', type: 'شهري', amount: 1000, start: 1, count: 12, every: 1, paidUntil: 8 },
].map((iv) => ({
  ...iv,
  schedule: Array.from({ length: iv.count }, (_, k) => {
    const m = iv.start + k * iv.every;
    return { due: `${YEAR}-${pad(m)}-05`, amount: iv.amount, paid: m <= iv.paidUntil, paidOn: m <= iv.paidUntil ? `${YEAR}-${pad(m)}-0${3 + (k % 5)}` : null };
  }),
}));

export const BUDGET_SEED = {
  groups: {
    '332012': 235500, // رواتب لاعبين ومدربين محليين
    '339001': 74000, // تعويضات لاعبين ومدربين أجانب
    '332013': 24500,  // انتقال الفرق
    '332007': 17000,  // تجهيزات وألبسة
    '332010': 18500,  // مكافآت
    '332011': 3500,   // إصابات وعلاج
    '332006': 7000,  // بطولات رسمية
    '338002': 125000, // رواتب العاملين
    '338005': 2500,   // مكافآت إدارية
    '331003': 5500,   // ماء وكهرباء
    '331011': 5500,   // محروقات
    '331007': 3000,   // صيانة
  },
  sports: { football: 260000, basketball: 117500, handball: 9000, other: 6000 },
};

export function buildSeed() {
  const rand = rng(1949);
  const entries = [];
  let no = 0;
  const add = (date, desc, lines, source = 'manual') => {
    entries.push({ id: 'J' + ++no, no, date, desc, lines: lines.map((l) => ({ memo: '', ...l })), source, status: 'posted' });
  };
  const BANK = '182007';
  const CASH = '181';

  add(`${YEAR}-01-01`, 'أرصدة افتتاحية — منقولة من النظام السابق', [
    { acc: BANK, dr: 310000, cr: 0 },
    { acc: '182002', dr: 35000, cr: 0 },
    { acc: CASH, dr: 18000, cr: 0 },
    { acc: '220001', dr: 0, cr: 363000 },
  ], 'opening');

  const recurring = [
    // [account, base, desc, via]
    ['332012001', 27000, 'رواتب لاعبي ومدربي كرة القدم', BANK],
    ['332012002', 11500, 'رواتب لاعبي ومدربي كرة السلة', BANK],
    ['332012003', 1100, 'رواتب كرة اليد', CASH],
    ['339001001', 6500, 'تعويضات المحترفين الأجانب — كرة القدم', BANK],
    ['339001002', 5500, 'تعويضات المحترفين الأجانب — كرة السلة', BANK],
    ['332013001', 2600, 'انتقال فريق كرة القدم', CASH],
    ['332013002', 1300, 'انتقال فريق كرة السلة', CASH],
    ['332007001', 1500, 'تجهيزات وألبسة — كرة القدم', CASH],
    ['332007002', 900, 'تجهيزات وألبسة — كرة السلة', CASH],
    ['332010001', 2100, 'مكافآت فوز — كرة القدم', CASH],
    ['332010002', 800, 'مكافآت فوز — كرة السلة', CASH],
    ['332011001', 450, 'علاج وإصابات — كرة القدم', CASH],
    ['332006001', 900, 'رسوم مباريات وبطولات رسمية', CASH],
    ['331003', 820, 'فواتير الماء والكهرباء', CASH],
    ['331011', 780, 'محروقات المولدة والسيارات', CASH],
    ['331007', 520, 'صيانة المقرات', CASH],
    ['331004', 140, 'قرطاسية ومطبوعات', CASH],
    ['331006', 260, 'ضيافة واستقبال', CASH],
  ];
  months(9).forEach((m) => {
    recurring.forEach(([acc, base, desc, via], k) => {
      if (!ACC[acc]) return;
      const amt = r2(base * 0.62 * (0.85 + rand() * 0.35));
      add(`${YEAR}-${pad(m)}-${pad(Math.min(28, 3 + k))}`, `${desc} — ${monthName(m)}`, [
        { acc, dr: amt, cr: 0 },
        { acc: via, dr: 0, cr: amt },
      ], 'payment');
    });
    // other operating revenues
    [['432003001', 12000, 'واردات كرة القدم — مباريات وتذاكر'], ['432003002', 4200, 'واردات كرة السلة'], ['432012001', 2400, 'اشتراكات مدرسة كرة القدم']].forEach(([acc, base, desc], k) => {
      if (!ACC[acc]) return;
      const amt = r2(base * (0.7 + rand() * 0.6));
      add(`${YEAR}-${pad(m)}-${pad(10 + k)}`, `${desc} — ${monthName(m)}`, [
        { acc: k ? CASH : BANK, dr: amt, cr: 0 },
        { acc, dr: 0, cr: amt },
      ], 'receipt');
    });
    // cash transfer from bank to cash box
    add(`${YEAR}-${pad(m)}-02`, `تغذية الصندوق من المصرف — ${monthName(m)}`, [
      { acc: CASH, dr: 6500, cr: 0 },
      { acc: BANK, dr: 0, cr: 6500 },
    ], 'manual');
  });

  // investors receipts
  INVESTORS_SEED.forEach((iv) => {
    iv.schedule.filter((s) => s.paid).forEach((s) => {
      add(s.paidOn, `قبض دفعة — ${iv.name}`, [
        { acc: BANK, dr: s.amount, cr: 0 },
        { acc: iv.revenue, dr: 0, cr: s.amount },
      ], 'investor');
    });
  });

  // advances to staff
  [['E03', 3, 300], ['E08', 5, 200], ['E13', 7, 150], ['E10', 8, 250]].forEach(([emp, m, amt]) => {
    add(`${YEAR}-${pad(m)}-15`, `سلفة للموظف ${emp}`, [
      { acc: '163999', dr: amt, cr: 0 },
      { acc: CASH, dr: 0, cr: amt },
    ], 'payment');
  });

  // payroll months 1..8 posted, 9 draft
  const payroll = {};
  months(9).forEach((m) => {
    const key = `${YEAR}-${pad(m)}`;
    const rows = {};
    EMPLOYEES_SEED.forEach((e, i) => {
      rows[e.id] = {
        bonus: rand() > 0.8 ? 50 : 0,
        overtime: rand() > 0.85 ? 40 : 0,
        lateMin: rand() > 0.6 ? Math.round(rand() * 90) : 0,
        absentDays: rand() > 0.9 ? 1 : 0,
        advance: 0,
        penalty: rand() > 0.95 ? 25 : 0,
      };
      if (e.id === 'E03' && m >= 4 && m <= 6) rows[e.id].advance = 100;
      if (e.id === 'E08' && m >= 6 && m <= 7) rows[e.id].advance = 100;
      if (e.id === 'E13' && m >= 8) rows[e.id].advance = 50;
    });
    payroll[key] = { status: m <= 8 ? 'posted' : 'draft', rows };
  });

  const state = {
    version: 1,
    entries: entries.sort((a, b) => a.date.localeCompare(b.date)).map((e, i) => ({ ...e, no: i + 1 })),
    employees: EMPLOYEES_SEED,
    payroll,
    investors: INVESTORS_SEED,
    budgets: BUDGET_SEED,
    settings: { graceMinutes: 15, workDays: 26, workHours: 8, bank: BANK, cash: CASH },
    audit: [],
  };
  // post payroll journal entries for posted months
  Object.entries(payroll).forEach(([key, run]) => {
    if (run.status === 'posted') state.entries.push(payrollEntry(state, key, state.entries.length + 1));
  });
  state.entries.sort((a, b) => a.date.localeCompare(b.date) || a.no - b.no);
  state.entries.forEach((e, i) => (e.no = i + 1));
  return state;
}

function firstLeaf(prefix) {
  return LEAVES.find((a) => a.code.startsWith(prefix))?.code;
}

export const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
export const monthName = (m) => MONTHS[m - 1];

/* ==========================================================================
   Payroll
   ========================================================================== */
export function payLine(emp, row, settings) {
  const base = +emp.base || 0;
  const allowance = +emp.allowance || 0;
  const dayRate = base / settings.workDays;
  const minRate = dayRate / (settings.workHours * 60);
  const lateCounted = Math.max(0, (+row.lateMin || 0) - settings.graceMinutes);
  const late = r2(lateCounted * minRate);
  const absence = r2((+row.absentDays || 0) * dayRate);
  const bonus = +row.bonus || 0;
  const overtime = +row.overtime || 0;
  const advance = +row.advance || 0;
  const penalty = +row.penalty || 0;
  const gross = r2(base + allowance + overtime - late - absence - penalty);
  const net = r2(gross + bonus - advance);
  return { base, allowance, bonus, overtime, late, absence, advance, penalty, gross, net, lateCounted };
}

export function payrollTotals(state, key) {
  const run = state.payroll[key];
  const t = { base: 0, allowance: 0, bonus: 0, overtime: 0, late: 0, absence: 0, advance: 0, penalty: 0, gross: 0, net: 0 };
  if (!run) return t;
  state.employees.filter((e) => e.active).forEach((e) => {
    const l = payLine(e, run.rows[e.id] || {}, state.settings);
    Object.keys(t).forEach((k) => (t[k] = r2(t[k] + l[k])));
  });
  return t;
}

export function payrollEntry(state, key, no) {
  const t = payrollTotals(state, key);
  const [y, m] = key.split('-');
  const lines = [
    { acc: '338002', dr: t.gross, cr: 0, memo: 'الرواتب بعد الخصميات' },
  ];
  if (t.bonus) lines.push({ acc: '338005', dr: t.bonus, cr: 0, memo: 'مكافآت' });
  lines.push({ acc: state.settings.bank, dr: 0, cr: t.net, memo: 'صافي الرواتب المدفوعة' });
  if (t.advance) lines.push({ acc: '163999', dr: 0, cr: t.advance, memo: 'اقتطاع سلف' });
  return {
    id: 'P' + key, no, date: `${y}-${m}-28`, desc: `رواتب الموظفين — ${monthName(+m)} ${y}`,
    lines: lines.map((l) => ({ memo: '', ...l })), source: 'payroll', status: 'posted',
  };
}

/* ==========================================================================
   Ledger computations
   ========================================================================== */
export function ledger(entries, { from, to } = {}) {
  // returns { [leafCode]: { dr, cr } }
  const out = {};
  entries.forEach((e) => {
    if (e.status !== 'posted') return;
    if (from && e.date < from) return;
    if (to && e.date > to) return;
    e.lines.forEach((l) => {
      const o = (out[l.acc] ||= { dr: 0, cr: 0 });
      o.dr += +l.dr || 0;
      o.cr += +l.cr || 0;
    });
  });
  return out;
}

export function rollup(led) {
  // aggregate leaf totals into every ancestor
  const out = {};
  Object.entries(led).forEach(([code, v]) => {
    let c = code;
    while (c) {
      const o = (out[c] ||= { dr: 0, cr: 0 });
      o.dr += v.dr;
      o.cr += v.cr;
      c = realParent(c);
    }
    const g = code[0];
    const o = (out['G' + g] ||= { dr: 0, cr: 0 });
    o.dr += v.dr;
    o.cr += v.cr;
  });
  return out;
}

export const bal = (v, code) => (v ? (isDebitNature(code) ? v.dr - v.cr : v.cr - v.dr) : 0);

export function monthly(entries, prefix, nature = 'dr') {
  const arr = Array(12).fill(0);
  entries.forEach((e) => {
    if (e.status !== 'posted' || !e.date.startsWith(YEAR)) return;
    const m = +e.date.slice(5, 7) - 1;
    e.lines.forEach((l) => {
      if (!l.acc.startsWith(prefix)) return;
      arr[m] += nature === 'dr' ? (+l.dr || 0) - (+l.cr || 0) : (+l.cr || 0) - (+l.dr || 0);
    });
  });
  return arr.map(r2);
}

export const fmt = (n, d = 0) =>
  (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const num = (n) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
