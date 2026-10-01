import React, { useState } from 'react';
import { api, Async, CurrencySelect, Field, Icon, Modal, Money, MONTHS, Page, fmtDate, today, useApi, useApp } from '../lib.jsx';

export default function Payroll({ args }) {
  const [tab, setTab] = useState(args[0] === 'employees' ? 'emp' : 'runs');
  return (
    <Page>
      <div className="tabs"><button className={tab === 'runs' ? 'on' : ''} onClick={() => setTab('runs')}>مسيرات الرواتب</button><button className={tab === 'emp' ? 'on' : ''} onClick={() => setTab('emp')}>الموظفون</button></div>
      {tab === 'runs' ? <Runs /> : <Employees />}
    </Page>
  );
}

function Employees() {
  const { can, run, base } = useApp();
  const q = useApi('/employees');
  const cc = useApi('/cost-centers');
  const [f, setF] = useState(null);
  const save = async () => {
    const body = { ...f, baseSalary: Number(f.baseSalary), allowance: Number(f.allowance || 0) };
    if (await run(() => (f.id ? api(`/employees/${f.id}`, { method: 'PATCH', body }) : api('/employees', { method: 'POST', body })), 'تم حفظ الموظف')) { setF(null); q.reload(); }
  };
  return (<>
    {can('payroll.manage') && <div className="row"><button className="btn primary" onClick={() => setF({ code: '', fullName: '', department: '', position: '', baseSalary: '', allowance: '', currency: base, hireDate: today(), phone: '' })}><Icon n="plus" />موظف جديد</button>
      <span className="muted">القسم المطابق لاسم مركز كلفة يُحمَّل عليه راتب الموظف تلقائيًا</span></div>}
    <Async q={q}>{(list) => {
      const deps = [...new Set(list.map((e) => e.department))];
      return deps.map((d) => (
        <div className="card" key={d}><h3>{d} <small>{list.filter((e) => e.department === d).length} موظفًا</small></h3>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>الرمز</th><th>الاسم</th><th>الوظيفة</th><th className="n">الراتب</th><th className="n">التعويضات</th><th>العملة</th><th>تاريخ التعيين</th><th>الحالة</th></tr></thead>
            <tbody>{list.filter((e) => e.department === d).map((e) => <tr key={e.id} className={can('payroll.manage') ? 'clickable' : ''} onClick={() => can('payroll.manage') && setF({ ...e, baseSalary: Number(e.baseSalary), allowance: Number(e.allowance), hireDate: e.hireDate ? fmtDate(e.hireDate) : '' })}>
              <td className="code">{e.code}</td><td><b>{e.fullName}</b></td><td>{e.position}</td><td className="n"><Money v={e.baseSalary} /></td><td className="n"><Money v={e.allowance} /></td><td>{e.currency}</td><td className="num">{fmtDate(e.hireDate)}</td>
              <td>{e.active ? <span className="pill green">فعّال</span> : <span className="pill">موقوف</span>}</td></tr>)}</tbody>
          </table></div></div>
      ));
    }}</Async>
    {q.data && !q.data.length && <div className="empty">لا موظفين بعد</div>}
    {f && <Modal title={f.id ? 'تعديل موظف' : 'موظف جديد'} onClose={() => setF(null)} footer={<><span /><button className="btn primary" onClick={save}>حفظ</button></>}>
      <div className="grid g2">
        <Field label="الرمز الوظيفي"><input className="inp n" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        <Field label="الاسم الكامل"><input className="inp" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
        <Field label="القسم"><input className="inp" list="deps" value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} />
          <datalist id="deps">{(cc.data || []).map((c) => <option key={c.id}>{c.name}</option>)}</datalist></Field>
        <Field label="الوظيفة"><input className="inp" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></Field>
        <Field label="الراتب الأساسي"><input className="inp n" value={f.baseSalary} onChange={(e) => setF({ ...f, baseSalary: e.target.value })} /></Field>
        <Field label="التعويضات الثابتة"><input className="inp n" value={f.allowance} onChange={(e) => setF({ ...f, allowance: e.target.value })} /></Field>
        <Field label="العملة"><CurrencySelect value={f.currency} onChange={(currency) => setF({ ...f, currency })} /></Field>
        <Field label="تاريخ التعيين"><input type="date" className="inp" value={f.hireDate || ''} onChange={(e) => setF({ ...f, hireDate: e.target.value })} /></Field>
        <Field label="الهاتف"><input className="inp n" value={f.phone || ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        {f.id && <label className="row"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> على رأس عمله</label>}
      </div>
    </Modal>}
  </>);
}

function Runs() {
  const { can, run } = useApp();
  const q = useApi('/payroll');
  const [sel, setSel] = useState(null);
  const d = new Date();
  const [nm, setNm] = useState({ year: d.getFullYear(), month: d.getMonth() + 1 });
  return (<>
    {can('payroll.manage') && <div className="card filters">
      <Field label="السنة"><input className="inp n" value={nm.year} onChange={(e) => setNm({ ...nm, year: +e.target.value })} /></Field>
      <Field label="الشهر"><select className="inp" value={nm.month} onChange={(e) => setNm({ ...nm, month: +e.target.value })}>{MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select></Field>
      <button className="btn primary" onClick={async () => { const r = await run(() => api('/payroll', { method: 'POST', body: nm }), 'تم فتح المسير'); if (r) { q.reload(); setSel(r.id); } }}><Icon n="plus" />فتح مسير الشهر</button>
    </div>}
    <Async q={q}>{(list) => (
      <div className="card"><div className="list">{list.map((r) => <div key={r.id} className="it" style={{ cursor: 'pointer' }} onClick={() => setSel(r.id)}>
        <div><div className="t">رواتب {MONTHS[r.month - 1]} {r.year}</div><div className="s">{r.postedAt ? 'رُحّل ' + fmtDate(r.postedAt) : 'قيد الإعداد'}</div></div>
        {r.status === 'POSTED' ? <span className="pill green">مرحّل</span> : <span className="pill amber">مسودة</span>}</div>)}
        {!list.length && <div className="empty">لا مسيرات بعد</div>}</div></div>
    )}</Async>
    {sel && <RunView id={sel} onClose={() => { setSel(null); q.reload(); }} />}
  </>);
}

const COLS = [['bonus', 'مكافأة'], ['overtime', 'إضافي'], ['lateMin', 'تأخير (د)'], ['absentDays', 'غياب (يوم)'], ['advance', 'سلفة'], ['penalty', 'عقوبة']];

function RunView({ id, onClose }) {
  const { can, run } = useApp();
  const q = useApi(`/payroll/${id}`);
  const [slip, setSlip] = useState(null);
  const update = async (lid, k, v) => { if (await run(() => api(`/payroll/${id}/lines/${lid}`, { method: 'PUT', body: { [k]: Number(v || 0) } }))) q.reload(); };
  return (
    <Modal title="مسير الرواتب" onClose={onClose}>
      <Async q={q}>{(r) => {
        const locked = r.status === 'POSTED' || !can('payroll.manage');
        return (<>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>رواتب {MONTHS[r.month - 1]} {r.year} {r.status === 'POSTED' ? <span className="pill green">مرحّل</span> : <span className="pill amber">مسودة</span>}</h3>
            <div className="row">{Object.entries(r.totals).map(([c, v]) => <span key={c} className="pill dark">صافي {c}: <Money v={v} /></span>)}
              {r.status !== 'POSTED' && can('payroll.post') && <button className="btn primary" onClick={async () => { if (await run(() => api(`/payroll/${id}/post`, { method: 'POST', body: {} }), 'تم ترحيل الرواتب')) q.reload(); }}>ترحيل المسير</button>}
              {r.entryId && <a className="btn sm" href={`#/journal/${r.entryId}`}>القيد</a>}</div>
          </div>
          <div className="tbl-wrap"><table className="tbl lines-tbl">
            <thead><tr><th>الموظف</th><th>القسم</th><th className="n">الثابت</th>{COLS.map(([k, n]) => <th key={k} className="n">{n}</th>)}<th className="n">الصافي</th><th></th></tr></thead>
            <tbody>{r.lines.map((l) => <tr key={l.id}><td><b>{l.employee.fullName}</b></td><td className="muted">{l.employee.department}</td><td className="n"><Money v={l.calc.fixed} /></td>
              {COLS.map(([k]) => <td key={k}>{locked ? <span className="num">{Number(l[k]) || ''}</span> : <input className="inp sm n" style={{ minWidth: 70 }} defaultValue={Number(l[k]) || ''} onBlur={(e) => Number(e.target.value || 0) !== Number(l[k]) && update(l.id, k, e.target.value)} />}</td>)}
              <td className="n"><b><Money v={l.calc.net} /></b> <small className="muted">{l.employee.currency}</small></td><td><button className="btn sm" onClick={() => setSlip(l)}>القسيمة</button></td></tr>)}</tbody>
          </table></div>
          {slip && <div className="slip">
            <h3>قسيمة راتب — {slip.employee.fullName} <button className="btn sm" onClick={() => print()}><Icon n="print" s={14} /></button></h3>
            {[['الراتب والتعويضات', slip.calc.fixed], ['مكافأة', slip.calc.bonus], ['إضافي', slip.calc.overtime], ['خصم تأخير', -slip.calc.late], ['خصم غياب', -slip.calc.absence], ['استرداد سلفة', -slip.calc.advance], ['عقوبة', -slip.calc.penalty]]
              .filter(([, v]) => v).map(([n, v]) => <div key={n} className="ln"><span>{n}</span><Money v={v} color /></div>)}
            <div className="net"><span>الصافي المستحق</span><b><Money v={slip.calc.net} cur={slip.employee.currency} /></b></div>
          </div>}
        </>);
      }}</Async>
    </Modal>
  );
}
