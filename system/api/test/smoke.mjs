// End-to-end smoke test against a running API (node test/smoke.mjs). Run on a freshly seeded dev database.
import ExcelJS from 'exceljs';
const B = process.env.API || 'http://localhost:4000/api';
let T = '';
const call = async (method, path, body, raw) => {
  const r = await fetch(B + path, { method, headers: { authorization: `Bearer ${T}`, ...(body && !raw ? { 'content-type': 'application/json' } : {}) }, body: raw ? body : body && JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${JSON.stringify(j)}`);
  return j;
};
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('✓', m); };
const expectFail = async (p, m) => { try { await p; } catch (e) { return console.log('✓', m, '—', e.message.slice(0, 90)); } throw new Error('FAIL (should reject): ' + m); };

T = (await call('POST', '/auth/login', { username: 'admin', password: process.env.ADMIN_PASSWORD || 'Admin@2026change' })).token;
await call('POST', '/currencies/rates', { currency: 'SYP', date: '2026-01-01', rate: 0.0001 });

const x = (await call('GET', '/accounts?posting=1')).map((a) => a.code);
const cash = x.find((c) => c.startsWith('18')), rev = x.find((c) => c.startsWith('43')), exp = x.find((c) => c.startsWith('33')), asset = x.find((c) => c.startsWith('11'));
ok(cash && rev && exp, `posting accounts found ${cash} ${rev} ${exp}`);

// migration: opening balances via Excel
const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('ميزان');
ws.addRow(['ميزان مراجعة الراشد']); ws.addRow(['رمز الحساب', 'اسم الحساب', 'مدين', 'دائن']);
ws.addRow([cash, 'صندوق', 50000, null]); ws.addRow([asset, 'أصل', 120000, null]);
const fd = new FormData(); fd.append('kind', 'balances'); fd.append('date', '2026-01-01');
fd.append('file', new Blob([await wb.xlsx.writeBuffer()]), 'opening.xlsx');
const v = await call('POST', '/imports/validate', fd, true);
ok(v.status === 'VALIDATED' && v.summary.difference === 170000, 'opening balances validated (diff → 220001)');
await call('POST', `/imports/${v.id}/commit`);
ok((await call('GET', `/imports/${v.id}/reconcile`)).ok, 'opening reconciliation matches');
await expectFail(call('POST', `/imports/${v.id}/commit`), 'batch cannot be committed twice');

// transactions import
const wb2 = new ExcelJS.Workbook(), w2 = wb2.addWorksheet('حركات');
w2.addRow(['التاريخ', 'رقم القيد', 'البيان', 'رمز الحساب', 'مدين', 'دائن', 'مركز الكلفة']);
w2.addRow(['2026-02-03', 'R-1', 'إيراد مباراة', cash, 3000, null, null]); w2.addRow([null, null, 'إيراد مباراة', rev, null, 3000, 'كرة القدم']);
w2.addRow(['2026-02-05', 'R-2', 'مصروف', exp, 800, null, 'كرة السلة']); w2.addRow([null, null, 'مصروف', cash, null, 800, null]);
const fd2 = new FormData(); fd2.append('kind', 'transactions'); fd2.append('file', new Blob([await wb2.xlsx.writeBuffer()]), 'tx.xlsx');
const v2 = await call('POST', '/imports/validate', fd2, true);
ok(v2.status === 'VALIDATED' && v2.summary.entries === 2, 'transactions validated: 2 entries');
await call('POST', `/imports/${v2.id}/commit`);
ok((await call('GET', `/imports/${v2.id}/reconcile`)).ok, 'transactions reconciliation matches');

// manual entry workflow
await expectFail(call('POST', '/journal', { date: '2026-03-01', description: 'x', lines: [{ accountCode: cash, debit: 10 }, { accountCode: rev, credit: 9 }] }), 'unbalanced entry rejected');
await expectFail(call('POST', '/journal', { date: '2026-03-01', description: 'x', lines: [{ accountCode: '18', debit: 10 }, { accountCode: rev, credit: 10 }] }), 'group account rejected');
const small = await call('POST', '/journal', { date: '2026-03-01', description: 'قيد صغير', lines: [{ accountCode: exp, debit: 100 }, { accountCode: cash, credit: 100 }] });
ok((await call('POST', `/journal/${small.id}/submit`)).status === 'POSTED', 'small entry posts on submit');
const big = await call('POST', '/journal', { date: '2026-03-02', description: 'قيد كبير بالليرة', currency: 'SYP', lines: [{ accountCode: exp, debit: 50000000 }, { accountCode: cash, credit: 50000000 }] });
ok((await call('POST', `/journal/${big.id}/submit`)).status === 'SUBMITTED', 'large entry (5,000 USD) waits for approval');
const ap = await call('POST', `/journal/${big.id}/approve`);
ok(ap.status === 'POSTED' && ap.number > 0, `approved & numbered #${ap.number}`);
await expectFail(call('DELETE', `/journal/${big.id}`), 'posted entry cannot be deleted');
const rv = await call('POST', `/journal/${small.id}/reverse`, { reason: 'خطأ' });
ok(rv.source === 'REVERSAL', 'posted entry reversed');
await expectFail(call('POST', `/journal/${small.id}/reverse`, { reason: 'مرة ثانية' }), 'double reversal rejected');

await call('POST', '/vouchers', { type: 'RECEIPT', date: '2026-03-05', cashAccount: cash, counterAccount: rev, amount: 700, description: 'سند قبض' });

// investors
const inv = await call('POST', '/investors', { name: 'مستثمر تجريبي', type: 'استثمار محل', revenueAccount: rev, startDate: '2026-01-01', contractValue: 1200, currency: 'USD' });
const sch = await call('POST', `/investors/${inv.id}/schedule`, { count: 12, firstDue: '2026-01-10' });
ok(sch.installments.length === 12, '12 installments scheduled');
await call('POST', `/investors/installments/${sch.installments[0].id}/collect`, { date: '2026-01-10', cashAccount: cash });
await expectFail(call('POST', `/investors/installments/${sch.installments[0].id}/collect`, { date: '2026-01-10', cashAccount: cash }), 'installment cannot be collected twice');

// payroll
await call('POST', '/employees', { code: 'E-T1', fullName: 'موظف تجريبي', department: 'كرة القدم', position: 'مدرب', baseSalary: 520, allowance: 0, currency: 'USD' });
const run = await call('POST', '/payroll', { year: 2026, month: 3 });
const line = run.lines[0];
await call('PUT', `/payroll/${run.id}/lines/${line.id}`, { bonus: 50, lateMin: 75, absentDays: 1, advance: 100 });
const r2 = await call('GET', `/payroll/${run.id}`);
// daily 20, hourly 2.5; late 60 min → 2.5; absence 20 → salary 497.5 + bonus 50 − advance 100 = 447.5
ok(r2.lines[0].calc.net === 447.5, `payslip net = ${r2.lines[0].calc.net}`);
await call('POST', `/payroll/${run.id}/post`, {});
await expectFail(call('PUT', `/payroll/${run.id}/lines/${line.id}`, { bonus: 1 }), 'posted payroll locked');

// budgets
await call('POST', '/budgets', { year: 2026, accountCode: exp.slice(0, 2), amount: 6000 });
const bl = await call('GET', '/budgets?year=2026');
ok(bl[0].actual > 0 && bl[0].pct > 0, `budget usage ${bl[0].pct}% alert=${bl[0].alert}`);

// period close
await call('POST', '/periods/2026/1/close');
await expectFail(call('POST', '/vouchers', { type: 'RECEIPT', date: '2026-01-20', cashAccount: cash, counterAccount: rev, amount: 1, description: 'x' }), 'closed period rejects posting');

// reports
const tb = await call('GET', '/reports/trial-balance');
ok(tb.balanced, `trial balance balanced (${tb.totals.debit})`);
const tb2 = await call('GET', '/reports/trial-balance?level=1&from=2026-02-01');
ok(tb2.balanced, 'level-1 trial balance with opening balanced');
const bs = await call('GET', '/reports/balance-sheet');
ok(bs.balanced, `balance sheet balanced (assets ${bs.totalAssets})`);
const is = await call('GET', '/reports/income-statement');
ok(Math.abs(is.net - bs.result) < 0.01, `income statement net ${is.net} = BS result`);
const led = await call('GET', `/reports/ledger?account=${cash}`);
ok(led.closing === (await call('GET', '/reports/cash')).find((c) => c.code === cash).balance, 'ledger closing = cash balance');
const d = await call('GET', '/dashboard?year=2026');
ok(d.kpis.revenueYtd > 0, `dashboard revenue YTD ${d.kpis.revenueYtd}`);
const audit = await call('GET', '/audit');
ok((audit.items ?? audit).length > 10, 'audit trail recorded');
console.log('\nALL SMOKE TESTS PASSED');
