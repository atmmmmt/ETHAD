import React, { useMemo, useState } from 'react';
import {
  ACC, SPORTS, TODAY, YEAR, MONTHS, bal, ledger, rollup, sportOf, payLine, payrollTotals, CHILDREN, accPath, realParent,
  accName,
} from './data.js';
import { AccountPicker, Bars, Icon, Modal, Money, downloadCSV, useStore } from './store.jsx';

/* ==========================================================================
   Receipt & payment vouchers
   ========================================================================== */
export function Vouchers() {
  const { state, dispatch, notify } = useStore();
  const [kind, setKind] = useState('payment');
  const [f, setF] = useState({ date: TODAY, box: state.settings.cash, acc: '', amount: '', desc: '', party: '' });
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const amt = +f.amount || 0;
  const valid = f.box && f.acc && amt > 0 && f.desc.trim();
  const save = () => {
    if (!valid) return;
    const lines = kind === 'payment'
      ? [{ acc: f.acc, dr: amt, cr: 0, memo: f.party }, { acc: f.box, dr: 0, cr: amt, memo: '' }]
      : [{ acc: f.box, dr: amt, cr: 0, memo: '' }, { acc: f.acc, dr: 0, cr: amt, memo: f.party }];
    dispatch({ type: 'addEntry', entry: { date: f.date, desc: f.desc.trim() + (f.party ? ` — ${f.party}` : ''), source: kind, lines } });
    notify(kind === 'payment' ? 'تم حفظ سند الصرف' : 'تم حفظ سند القبض');
    setF({ ...f, acc: '', amount: '', desc: '', party: '' });
  };
  const recent = state.entries.filter((e) => e.source === kind).sort((a, b) => b.no - a.no).slice(0, 12);
  const R = useMemo(() => rollup(ledger(state.entries)), [state.entries]);
  const boxes = Object.values(ACC).filter((a) => (a.code === '181' || a.code.startsWith('182')) && !CHILDREN[a.code]);

  return (
    <div className="page">
      <div className="grid g4">
        {boxes.filter((b) => R[b.code]).map((b) => (
          <div className="kpi" key={b.code}><small>{b.name}</small><b><Money v={bal(R[b.code], b.code)} /></b><span className="code">{b.code}</span></div>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: '460px 1fr' }}>
        <div className="card">
          <h3>
            <div className="seg"><button className={kind === 'payment' ? 'on' : ''} onClick={() => setKind('payment')}>سند صرف</button><button className={kind === 'receipt' ? 'on' : ''} onClick={() => setKind('receipt')}>سند قبض</button></div>
            <small>يُنشأ القيد تلقائيًا</small>
          </h3>
          <div className="grid" style={{ gap: 14 }}>
            <div className="grid g2">
              <div className="field"><label>التاريخ</label><input type="date" className="inp" value={f.date} onChange={(e) => set('date', e.target.value)} /></div>
              <div className="field"><label>المبلغ ($) *</label><input className="inp n" inputMode="decimal" value={f.amount} onChange={(e) => set('amount', e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" /></div>
            </div>
            <div className="field"><label>{kind === 'payment' ? 'يُصرف من (صندوق / مصرف) *' : 'يُقبض إلى (صندوق / مصرف) *'}</label>
              <select className="inp" value={f.box} onChange={(e) => set('box', e.target.value)}>{boxes.map((b) => <option key={b.code} value={b.code}>{b.code} · {b.name}</option>)}</select>
            </div>
            <div className="field"><label>{kind === 'payment' ? 'حساب المصروف / المستفيد *' : 'حساب الوارد / الدافع *'}</label>
              <AccountPicker value={f.acc} onChange={(v) => set('acc', v)} filter={kind === 'payment' ? (c) => c[0] === '3' || c.startsWith('16') || c.startsWith('26') : (c) => c[0] === '4' || c.startsWith('16') || c.startsWith('26')} />
              {f.acc && <small className="muted">{accPath(f.acc)}{sportOf(f.acc) ? ` · مركز التكلفة: ${SPORTS[sportOf(f.acc)]}` : ''}</small>}
            </div>
            <div className="field"><label>{kind === 'payment' ? 'اسم المستفيد' : 'اسم الدافع'}</label><input className="inp" value={f.party} onChange={(e) => set('party', e.target.value)} /></div>
            <div className="field"><label>البيان *</label><input className="inp" value={f.desc} onChange={(e) => set('desc', e.target.value)} placeholder={kind === 'payment' ? 'مثال: شراء 20 كرة سلة' : 'مثال: قبض رسوم مدرسة كرة القدم'} /></div>
            {valid && (
              <div className="alert ok" style={{ fontSize: 13, fontWeight: 500, display: 'block' }}>
                القيد الناتج: <b>{kind === 'payment' ? ACC[f.acc].name : ACC[f.box].name}</b> مدين · <b>{kind === 'payment' ? ACC[f.box].name : ACC[f.acc].name}</b> دائن — <Money v={amt} d={2} />
              </div>
            )}
            <button className="btn primary" disabled={!valid} onClick={save} style={{ justifyContent: 'center' }}><Icon n="check" /> حفظ السند</button>
          </div>
        </div>
        <div className="card">
          <h3>آخر {kind === 'payment' ? 'سندات الصرف' : 'سندات القبض'} <small>{recent.length} سند</small></h3>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>القيد</th><th>التاريخ</th><th>البيان</th><th>الحساب</th><th className="n">المبلغ</th></tr></thead>
            <tbody>{recent.map((e) => {
              const l = e.lines.find((x) => kind === 'payment' ? +x.dr : +x.cr);
              return <tr key={e.id}><td className="num">{e.no}</td><td className="num">{e.date}</td><td>{e.desc}</td><td className="muted">{accName(l?.acc)}</td><td className="n"><Money v={+(l?.dr || l?.cr) || 0} d={2} /></td></tr>;
            })}</tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   Payroll
   ========================================================================== */
const PAY_FIELDS = [
  ['bonus', 'مكافأة', 'plus'], ['overtime', 'إضافي', 'plus'], ['lateMin', 'تأخير (دقيقة)', 'min'],
  ['absentDays', 'غياب (يوم)', 'min'], ['advance', 'اقتطاع سلفة', 'min'], ['penalty', 'عقوبة', 'min'],
];

export function Payroll() {
  const { state, dispatch, notify } = useStore();
  const keys = Object.keys(state.payroll).sort();
  const [month, setMonth] = useState(keys[keys.length - 1]);
  const [slip, setSlip] = useState(null);
  const [emp, setEmp] = useState(null);
  const run = state.payroll[month] || { status: 'draft', rows: {} };
  const posted = run.status === 'posted';
  const t = payrollTotals(state, month);
  const [y, m] = month.split('-');
  const nextKey = (() => { const n = +m + 1; return n > 12 ? `${+y + 1}-01` : `${y}-${String(n).padStart(2, '0')}`; })();
  const advBal = bal(rollup(ledger(state.entries))['163999'], '163999');

  return (
    <div className="page">
      <div className="row">
        <select className="inp" style={{ width: 200 }} value={month} onChange={(e) => setMonth(e.target.value)}>
          {keys.map((k) => <option key={k} value={k}>{MONTHS[+k.slice(5) - 1]} {k.slice(0, 4)}{state.payroll[k].status === 'posted' ? ' ✓' : ''}</option>)}
        </select>
        {posted ? <span className="pill green"><Icon n="check" s={14} /> مُرحّلة إلى القيود</span> : <span className="pill amber">مسودة — قابلة للتعديل</span>}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => setEmp({ id: 'E' + String(state.employees.length + 1).padStart(2, '0'), name: '', dept: '', position: '', base: '', allowance: '', active: true })}><Icon n="plus" /> موظف</button>
        {!state.payroll[nextKey] && <button className="btn" onClick={() => { dispatch({ type: 'newPayMonth', month: nextKey }); setMonth(nextKey); }}>فتح شهر {MONTHS[+nextKey.slice(5) - 1]}</button>}
        <button className="btn" onClick={() => downloadCSV('رواتب-' + month, [['الموظف', 'القسم', 'الأساسي', 'بدلات', 'مكافأة', 'إضافي', 'خصم تأخير', 'خصم غياب', 'سلفة', 'عقوبة', 'الصافي'], ...state.employees.filter((e) => e.active).map((e) => { const l = payLine(e, run.rows[e.id] || {}, state.settings); return [e.name, e.dept, l.base, l.allowance, l.bonus, l.overtime, l.late, l.absence, l.advance, l.penalty, l.net]; })])}><Icon n="dl" /> تصدير</button>
        <button className="btn primary" disabled={posted} onClick={() => { dispatch({ type: 'postPayroll', month }); notify('تم ترحيل الرواتب وإنشاء القيد'); }}><Icon n="check" /> اعتماد وترحيل</button>
      </div>

      <div className="grid g5">
        <div className="kpi hero"><small>صافي الرواتب</small><b><Money v={t.net} /></b><span>{state.employees.filter((e) => e.active).length} موظفًا</span></div>
        <div className="kpi"><small>الأساسي + البدلات</small><b><Money v={t.base + t.allowance} /></b></div>
        <div className="kpi"><small>مكافآت وإضافي</small><b className="pos"><Money v={t.bonus + t.overtime} /></b></div>
        <div className="kpi"><small>خصميات (تأخير · غياب · عقوبة)</small><b className="neg"><Money v={t.late + t.absence + t.penalty} /></b></div>
        <div className="kpi"><small>رصيد سلف الموظفين</small><b><Money v={advBal} /></b><span className="muted">اقتطاع هذا الشهر <Money v={t.advance} /></span></div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>الموظف</th><th>القسم</th><th className="n">الأساسي</th><th className="n">بدلات</th>{PAY_FIELDS.map(([k, n]) => <th key={k} className="n">{n}</th>)}<th className="n">خصم التأخير والغياب</th><th className="n">الصافي</th><th /></tr></thead>
          <tbody>{state.employees.filter((e) => e.active).map((e) => {
            const row = run.rows[e.id] || {};
            const l = payLine(e, row, state.settings);
            return (
              <tr key={e.id}>
                <td><button style={{ fontWeight: 700 }} onClick={() => setEmp(e)}>{e.name}</button><div className="muted" style={{ fontSize: 11 }}>{e.position}</div></td>
                <td>{e.dept}</td>
                <td className="n"><Money v={l.base} /></td>
                <td className="n"><Money v={l.allowance} /></td>
                {PAY_FIELDS.map(([k]) => (
                  <td key={k} className="n" style={{ width: 92 }}>
                    <input className="inp sm n" style={{ width: 76 }} disabled={posted} value={row[k] ?? ''} placeholder="0"
                      onChange={(ev) => dispatch({ type: 'setPayRow', month, emp: e.id, field: k, value: ev.target.value.replace(/[^\d.]/g, '') })} />
                  </td>
                ))}
                <td className="n neg">{l.late + l.absence ? <Money v={-(l.late + l.absence)} d={2} /> : '—'}</td>
                <td className="n"><b><Money v={l.net} d={2} /></b></td>
                <td><button className="btn sm" onClick={() => setSlip(e)}>قسيمة</button></td>
              </tr>
            );
          })}</tbody>
          <tfoot><tr><td colSpan={2}>المجموع</td><td className="n"><Money v={t.base} /></td><td className="n"><Money v={t.allowance} /></td><td className="n"><Money v={t.bonus} /></td><td className="n"><Money v={t.overtime} /></td><td /><td /><td className="n"><Money v={t.advance} /></td><td className="n"><Money v={t.penalty} /></td><td className="n neg"><Money v={-(t.late + t.absence)} d={2} /></td><td className="n"><Money v={t.net} d={2} /></td><td /></tr></tfoot>
        </table>
      </div>

      <div className="card">
        <h3>قواعد الاحتساب <small>من الإعدادات</small></h3>
        <div className="row" style={{ gap: 24 }}>
          <span>سماح بالتأخير: <b>{state.settings.graceMinutes} دقيقة</b></span>
          <span>أيام العمل الشهرية: <b>{state.settings.workDays}</b></span>
          <span>ساعات اليوم: <b>{state.settings.workHours}</b></span>
          <span className="muted">خصم الدقيقة = (الأساسي ÷ أيام العمل) ÷ (ساعات × 60) · خصم يوم الغياب = الأساسي ÷ أيام العمل</span>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>عند الترحيل: مدين 338002 رواتب العاملين · مدين 338005 المكافآت · دائن المصرف بالصافي · دائن 163999 سلف الموظفين بالاقتطاع.</p>
      </div>

      {slip && <PaySlip e={slip} month={month} onClose={() => setSlip(null)} />}
      {emp && <EmployeeModal emp={emp} onClose={() => setEmp(null)} onSave={(x) => { dispatch({ type: 'saveEmployee', emp: x }); notify('تم حفظ بيانات الموظف'); setEmp(null); }} />}
    </div>
  );
}

function PaySlip({ e, month, onClose }) {
  const { state } = useStore();
  const l = payLine(e, state.payroll[month]?.rows[e.id] || {}, state.settings);
  const Ln = ({ n, v, s }) => (v ? <div className="ln"><span>{n}</span><b className={s < 0 ? 'neg' : ''}><Money v={s * v} d={2} /></b></div> : null);
  return (
    <Modal size="sm" title={`قسيمة راتب — ${MONTHS[+month.slice(5) - 1]} ${month.slice(0, 4)}`} onClose={onClose} footer={<><span className="muted">{e.id}</span><button className="btn" onClick={() => window.print()}><Icon n="print" /> طباعة</button></>}>
      <div><b style={{ fontSize: 18 }}>{e.name}</b><div className="muted">{e.position} · {e.dept}</div></div>
      <div className="slip">
        <Ln n="الراتب الأساسي" v={l.base} s={1} />
        <Ln n="بدلات" v={l.allowance} s={1} />
        <Ln n="مكافأة" v={l.bonus} s={1} />
        <Ln n="عمل إضافي" v={l.overtime} s={1} />
        <Ln n={`خصم تأخير (${l.lateCounted} دقيقة بعد السماح)`} v={l.late} s={-1} />
        <Ln n="خصم غياب" v={l.absence} s={-1} />
        <Ln n="اقتطاع سلفة" v={l.advance} s={-1} />
        <Ln n="عقوبة" v={l.penalty} s={-1} />
        <div className="net"><span>صافي الراتب</span><b><Money v={l.net} d={2} /></b></div>
      </div>
    </Modal>
  );
}

function EmployeeModal({ emp, onClose, onSave }) {
  const [f, setF] = useState(emp);
  const set = (k, v) => setF((o) => ({ ...o, [k]: v }));
  const valid = f.name.trim() && +f.base > 0;
  return (
    <Modal size="sm" title={emp.name ? 'تعديل موظف' : 'موظف جديد'} onClose={onClose} footer={<><label className="row" style={{ gap: 6 }}><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> على رأس عمله</label><button className="btn primary" disabled={!valid} onClick={() => onSave({ ...f, base: +f.base, allowance: +f.allowance || 0 })}>حفظ</button></>}>
      <div className="field"><label>الاسم *</label><input className="inp" value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
      <div className="grid g2">
        <div className="field"><label>القسم</label><input className="inp" value={f.dept} onChange={(e) => set('dept', e.target.value)} /></div>
        <div className="field"><label>المسمى الوظيفي</label><input className="inp" value={f.position} onChange={(e) => set('position', e.target.value)} /></div>
        <div className="field"><label>الراتب الأساسي ($) *</label><input className="inp n" value={f.base} onChange={(e) => set('base', e.target.value.replace(/[^\d.]/g, ''))} /></div>
        <div className="field"><label>البدلات ($)</label><input className="inp n" value={f.allowance} onChange={(e) => set('allowance', e.target.value.replace(/[^\d.]/g, ''))} /></div>
      </div>
    </Modal>
  );
}

/* ==========================================================================
   Budget
   ========================================================================== */
export function Budget() {
  const { state, dispatch } = useStore();
  const [view, setView] = useState('groups');
  const ytdLed = useMemo(() => ledger(state.entries, { from: YEAR + '-01-01' }), [state.entries]);
  const R = useMemo(() => rollup(ytdLed), [ytdLed]);
  const elapsed = +TODAY.slice(5, 7) / 12;

  const sportAct = {};
  Object.entries(ytdLed).forEach(([c, v]) => { if (c[0] === '3') { const s = sportOf(c); if (s) sportAct[s] = (sportAct[s] || 0) + v.dr - v.cr; } });

  const rows = view === 'groups'
    ? Object.entries(state.budgets.groups).map(([c, b]) => ({ key: c, name: ACC[c]?.name, sub: accPath(c), b, a: bal(R[c], c) }))
    : Object.entries(SPORTS).map(([k, n]) => ({ key: k, name: n, sub: 'حسابات 332 و 339 لهذه اللعبة', b: state.budgets.sports[k] || 0, a: sportAct[k] || 0 }));
  const totB = rows.reduce((s, r) => s + r.b, 0);
  const totA = rows.reduce((s, r) => s + r.a, 0);
  const status = (p) => (p >= 100 ? ['red', 'تجاوز'] : p >= 85 ? ['amber', 'تنبيه 85%'] : p >= 70 ? ['amber', 'تنبيه 70%'] : ['green', 'ضمن الموازنة']);

  return (
    <div className="page">
      <div className="row">
        <div className="seg"><button className={view === 'groups' ? 'on' : ''} onClick={() => setView('groups')}>حسب البند المحاسبي</button><button className={view === 'sports' ? 'on' : ''} onClick={() => setView('sports')}>حسب اللعبة (مركز التكلفة)</button></div>
        <span className="muted">موازنة {YEAR} · مضى {Math.round(elapsed * 100)}% من السنة</span>
      </div>
      <div className="grid g4">
        <div className="kpi hero"><small>إجمالي الموازنة</small><b><Money v={totB} /></b></div>
        <div className="kpi"><small>الفعلي حتى تاريخه</small><b><Money v={totA} /></b></div>
        <div className="kpi"><small>المتبقي</small><b className={totB - totA < 0 ? 'neg' : ''}><Money v={totB - totA} /></b></div>
        <div className="kpi"><small>نسبة الاستهلاك</small><b>{Math.round((totA / totB) * 100)}%</b><span className="muted">المتوقع زمنيًا {Math.round(elapsed * 100)}%</span></div>
      </div>
      <div className="grid g2">
        <div className="card"><h3>الموازنة مقابل الفعلي</h3><Bars rows={rows.map((r) => ({ name: r.name, value: r.a, budget: r.b }))} /></div>
        <div className="card">
          <h3>التفاصيل <small>عدّل الموازنة مباشرة</small></h3>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>البند</th><th className="n">الموازنة</th><th className="n">الفعلي</th><th className="n">الفرق</th><th>الحالة</th></tr></thead>
            <tbody>{rows.map((r) => {
              const p = r.b ? (r.a / r.b) * 100 : 0;
              const [c, t] = status(p);
              return (
                <tr key={r.key}>
                  <td><b>{r.name}</b><div className="muted" style={{ fontSize: 11 }}>{view === 'groups' ? <span className="code">{r.key}</span> : r.sub}</div></td>
                  <td className="n"><input className="inp sm n" style={{ width: 110 }} value={r.b} onChange={(e) => dispatch({ type: 'setBudget', kind: view, key: r.key, value: +e.target.value.replace(/[^\d]/g, '') || 0 })} /></td>
                  <td className="n"><Money v={r.a} /></td>
                  <td className={'n ' + (r.b - r.a < 0 ? 'neg' : '')}><Money v={r.b - r.a} /></td>
                  <td><span className={'pill ' + c}>{Math.round(p)}% · {t}</span></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   Investors
   ========================================================================== */
export function Investors() {
  const { state, dispatch, notify } = useStore();
  const [sel, setSel] = useState(state.investors[0].id);
  const iv = state.investors.find((x) => x.id === sel);
  const stats = (x) => {
    const total = x.schedule.reduce((a, s) => a + s.amount, 0);
    const paid = x.schedule.filter((s) => s.paid).reduce((a, s) => a + s.amount, 0);
    const late = x.schedule.filter((s) => !s.paid && s.due <= TODAY);
    const next = x.schedule.find((s) => !s.paid && s.due > TODAY);
    return { total, paid, rest: total - paid, late: late.reduce((a, s) => a + s.amount, 0), lateN: late.length, next };
  };
  const all = state.investors.map((x) => ({ x, s: stats(x) }));
  const T = all.reduce((a, { s }) => ({ total: a.total + s.total, paid: a.paid + s.paid, late: a.late + s.late }), { total: 0, paid: 0, late: 0 });
  const st = stats(iv);
  const daysLate = (d) => Math.round((new Date(TODAY) - new Date(d)) / 864e5);

  return (
    <div className="page">
      <div className="grid g4">
        <div className="kpi hero"><small>قيمة العقود {YEAR}</small><b><Money v={T.total} /></b><span>{state.investors.length} مستثمرين</span></div>
        <div className="kpi"><small>المحصّل</small><b className="pos"><Money v={T.paid} /></b></div>
        <div className="kpi"><small>المتبقي</small><b><Money v={T.total - T.paid} /></b></div>
        <div className="kpi"><small>المتأخر</small><b className="neg"><Money v={T.late} /></b></div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '420px 1fr' }}>
        <div className="card" style={{ padding: 8 }}>
          <div className="list">{all.map(({ x, s }) => (
            <button key={x.id} className="it" style={{ padding: '12px', borderRadius: 10, background: x.id === sel ? 'var(--red-soft)' : '', textAlign: 'right' }} onClick={() => setSel(x.id)}>
              <div><div className="t">{x.name}</div><div className="s"><span className="code">{x.revenue}</span> · {x.type}</div></div>
              {s.lateN ? <span className="pill red">متأخر <Money v={s.late} /></span> : <span className="pill green">منتظم</span>}
            </button>
          ))}</div>
        </div>
        <div className="card">
          <h3>{iv.name} <small>حساب الوارد: {iv.revenue} · {ACC[iv.revenue]?.name}</small></h3>
          <div className="grid g4" style={{ marginBottom: 16 }}>
            <div className="kpi"><small>قيمة العقد</small><b><Money v={st.total} /></b></div>
            <div className="kpi"><small>المدفوع</small><b className="pos"><Money v={st.paid} /></b></div>
            <div className="kpi"><small>المتبقي</small><b><Money v={st.rest} /></b></div>
            <div className="kpi"><small>المتأخر</small><b className={st.late ? 'neg' : ''}><Money v={st.late} /></b></div>
          </div>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>#</th><th>تاريخ الاستحقاق</th><th className="n">المبلغ</th><th>الحالة</th><th /></tr></thead>
            <tbody>{iv.schedule.map((s, i) => {
              const late = !s.paid && s.due <= TODAY;
              return (
                <tr key={i}>
                  <td className="num">{i + 1}</td>
                  <td className="num">{s.due}</td>
                  <td className="n"><Money v={s.amount} /></td>
                  <td>{s.paid ? <span className="pill green">مدفوعة {s.paidOn}</span> : late ? <span className="pill red">متأخرة {daysLate(s.due)} يومًا</span> : <span className="pill">قادمة</span>}</td>
                  <td>{!s.paid && <button className="btn sm" onClick={() => { dispatch({ type: 'payInstallment', inv: iv.id, idx: i }); notify('تم قبض الدفعة وإنشاء سند قبض'); }}>تسجيل قبض</button>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   Reports
   ========================================================================== */
export function Reports() {
  const { state } = useStore();
  const [tab, setTab] = useState('tb');
  const [lvl, setLvl] = useState(3);
  const [to, setTo] = useState(TODAY);
  const led = useMemo(() => ledger(state.entries, { to }), [state.entries, to]);
  const R = useMemo(() => rollup(led), [led]);

  // every posting account rolls up to its deepest ancestor whose code length <= chosen level
  const agg = {};
  Object.entries(led).forEach(([code, v]) => {
    let c = code;
    while (c.length > lvl) { const p = realParent(c); if (!p) break; c = p; }
    const o = (agg[c] ||= { dr: 0, cr: 0 });
    o.dr += v.dr; o.cr += v.cr;
  });
  const tb = Object.keys(agg).sort().map((code) => { const v = agg[code]; const b = v.dr - v.cr; return { a: ACC[code], dr: v.dr, cr: v.cr, bd: b > 0 ? b : 0, bc: b < 0 ? -b : 0 }; });
  const tbT = tb.reduce((s, r) => ({ dr: s.dr + r.dr, cr: s.cr + r.cr, bd: s.bd + r.bd, bc: s.bc + r.bc }), { dr: 0, cr: 0, bd: 0, bc: 0 });

  const revGroups = Object.values(ACC).filter((a) => a.code.startsWith('43') && a.code.length === 6 && R[a.code]);
  const expGroups = Object.values(ACC).filter((a) => a.code[0] === '3' && a.code.length === 3 && R[a.code]);
  const totRev = bal(R['43'], '43');
  const totExp = bal(R['33'], '33') + bal(R['35'], '35');

  return (
    <div className="page">
      <div className="row no-print">
        <div className="seg"><button className={tab === 'tb' ? 'on' : ''} onClick={() => setTab('tb')}>ميزان المراجعة</button><button className={tab === 'is' ? 'on' : ''} onClick={() => setTab('is')}>قائمة الواردات والنفقات</button><button className={tab === 'cash' ? 'on' : ''} onClick={() => setTab('cash')}>الأموال الجاهزة</button></div>
        <span style={{ flex: 1 }} />
        <label className="row" style={{ gap: 6 }}>حتى تاريخ <input type="date" className="inp" style={{ width: 160 }} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {tab === 'tb' && <select className="inp" style={{ width: 150 }} value={lvl} onChange={(e) => setLvl(+e.target.value)}><option value={2}>المستوى 1 (رئيسي)</option><option value={3}>المستوى 2</option><option value={6}>المستوى 3</option><option value={9}>المستوى 4 (تفصيلي)</option></select>}
        <button className="btn" onClick={() => window.print()}><Icon n="print" /> طباعة / PDF</button>
        {tab === 'tb' && <button className="btn" onClick={() => downloadCSV('ميزان-المراجعة', [['الحساب', 'الاسم', 'مجموع مدين', 'مجموع دائن', 'رصيد مدين', 'رصيد دائن'], ...tb.map((r) => [r.a.code, r.a.name, r.dr, r.cr, r.bd, r.bc])])}><Icon n="dl" /> Excel</button>}
      </div>

      {tab === 'tb' && (
        <div className="card">
          <h3>ميزان المراجعة <small>حتى {to}</small>{Math.abs(tbT.dr - tbT.cr) < 0.01 ? <span className="pill green"><Icon n="check" s={14} /> متوازن</span> : <span className="pill red">غير متوازن</span>}</h3>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>الحساب</th><th>الاسم</th><th className="n">مجموع مدين</th><th className="n">مجموع دائن</th><th className="n">رصيد مدين</th><th className="n">رصيد دائن</th></tr></thead>
            <tbody>{tb.map((r) => <tr key={r.a.code}><td className="code">{r.a.code}</td><td>{r.a.name}</td><td className="n"><Money v={r.dr} d={2} /></td><td className="n"><Money v={r.cr} d={2} /></td><td className="n">{r.bd ? <Money v={r.bd} d={2} /> : ''}</td><td className="n">{r.bc ? <Money v={r.bc} d={2} /> : ''}</td></tr>)}</tbody>
            <tfoot><tr><td colSpan={2}>المجموع</td><td className="n"><Money v={tbT.dr} d={2} /></td><td className="n"><Money v={tbT.cr} d={2} /></td><td className="n"><Money v={tbT.bd} d={2} /></td><td className="n"><Money v={tbT.bc} d={2} /></td></tr></tfoot>
          </table></div>
        </div>
      )}

      {tab === 'is' && (
        <div className="grid g2">
          <div className="card">
            <h3>الواردات <b><Money v={totRev} /></b></h3>
            <table className="tbl"><tbody>{revGroups.map((a) => <tr key={a.code}><td className="code">{a.code}</td><td>{a.name}</td><td className="n"><Money v={bal(R[a.code], a.code)} /></td></tr>)}</tbody></table>
          </div>
          <div className="card">
            <h3>النفقات <b><Money v={totExp} /></b></h3>
            <table className="tbl"><tbody>{expGroups.map((a) => <tr key={a.code}><td className="code">{a.code}</td><td>{a.name}</td><td className="n"><Money v={bal(R[a.code], a.code)} /></td></tr>)}</tbody></table>
          </div>
          <div className={'alert span2 ' + (totRev - totExp < 0 ? 'bad' : 'ok')} style={{ justifyContent: 'space-between', fontSize: 18 }}>
            <span>{totRev - totExp < 0 ? 'عجز الدورة' : 'وفر الدورة'} حتى {to}</span><b><Money v={totRev - totExp} /></b>
          </div>
        </div>
      )}

      {tab === 'cash' && (
        <div className="card">
          <h3>الأموال الجاهزة <small>الصندوق والمصارف</small></h3>
          <table className="tbl">
            <thead><tr><th>الحساب</th><th>الاسم</th><th className="n">وارد</th><th className="n">صادر</th><th className="n">الرصيد</th></tr></thead>
            <tbody>{Object.values(ACC).filter((a) => a.code.startsWith('18') && !CHILDREN[a.code] && R[a.code]).map((a) => <tr key={a.code}><td className="code">{a.code}</td><td>{a.name}</td><td className="n"><Money v={R[a.code].dr} /></td><td className="n"><Money v={R[a.code].cr} /></td><td className="n"><b><Money v={bal(R[a.code], a.code)} /></b></td></tr>)}</tbody>
            <tfoot><tr><td colSpan={4}>إجمالي السيولة</td><td className="n"><Money v={bal(R['18'], '18')} /></td></tr></tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   Settings
   ========================================================================== */
export function Settings() {
  const { state, dispatch, notify } = useStore();
  const exportJSON = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state)], { type: 'application/json' }));
    a.download = `نسخة-احتياطية-${TODAY}.json`;
    a.click();
  };
  const importJSON = (file) => {
    const r = new FileReader();
    r.onload = () => { try { dispatch({ type: 'replace', state: JSON.parse(r.result) }); notify('تم استرجاع النسخة الاحتياطية'); } catch { alert('الملف غير صالح'); } };
    r.readAsText(file);
  };
  return (
    <div className="page">
      <div className="grid g2">
        <div className="card">
          <h3>قواعد الرواتب والحضور</h3>
          <div className="grid g3">
            <div className="field"><label>السماح بالتأخير (دقيقة)</label><input className="inp n" value={state.settings.graceMinutes} onChange={(e) => dispatch({ type: 'setSettings', patch: { graceMinutes: +e.target.value || 0 } })} /></div>
            <div className="field"><label>أيام العمل الشهرية</label><input className="inp n" value={state.settings.workDays} onChange={(e) => dispatch({ type: 'setSettings', patch: { workDays: +e.target.value || 26 } })} /></div>
            <div className="field"><label>ساعات اليوم</label><input className="inp n" value={state.settings.workHours} onChange={(e) => dispatch({ type: 'setSettings', patch: { workHours: +e.target.value || 8 } })} /></div>
          </div>
        </div>
        <div className="card">
          <h3>النسخ الاحتياطي <small>البيانات محفوظة على هذا الجهاز</small></h3>
          <div className="row">
            <button className="btn dark" onClick={exportJSON}><Icon n="dl" /> تنزيل نسخة احتياطية</button>
            <label className="btn">استرجاع نسخة<input type="file" accept=".json" hidden onChange={(e) => e.target.files[0] && importJSON(e.target.files[0])} /></label>
            <button className="btn" onClick={() => { if (confirm('إعادة البيانات التجريبية الأصلية؟ ستُحذف كل التعديلات.')) { dispatch({ type: 'reset' }); notify('تمت إعادة البيانات التجريبية'); } }}>إعادة ضبط البيانات التجريبية</button>
          </div>
        </div>
      </div>
      <div className="card">
        <h3>سجل التدقيق <small>آخر العمليات</small></h3>
        {state.audit?.length ? (
          <table className="tbl"><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>التفاصيل</th></tr></thead>
            <tbody>{state.audit.slice(0, 50).map((a, i) => <tr key={i}><td className="num">{a.at.replace('T', ' ').slice(0, 19)}</td><td>{a.user}</td><td>{a.action}</td><td>{a.detail}</td></tr>)}</tbody></table>
        ) : <div className="empty">لا توجد عمليات بعد — أي إضافة أو تعديل ستظهر هنا.</div>}
      </div>
    </div>
  );
}
