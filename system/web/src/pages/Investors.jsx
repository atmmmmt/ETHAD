import React, { useState } from 'react';
import { AccountPicker, api, Async, CurrencySelect, Field, Icon, Modal, Money, Page, fmtDate, today, useApi, useApp } from '../lib.jsx';

export default function Investors() {
  const { can, run, base } = useApp();
  const q = useApi('/investors');
  const [sel, setSel] = useState(null), [form, setForm] = useState(null);
  const save = async () => {
    const body = { ...form, contractValue: Number(form.contractValue) };
    const r = await run(() => (form.id ? api(`/investors/${form.id}`, { method: 'PATCH', body }) : api('/investors', { method: 'POST', body })), 'تم حفظ العقد');
    if (r) { setForm(null); q.reload(); }
  };
  return (
    <Page actions={can('investors.manage') && <button className="btn primary" onClick={() => setForm({ name: '', contractNo: '', type: 'استثمار محل', revenueAccount: '', receivableAcct: '', startDate: today(), endDate: '', contractValue: '', currency: base, phone: '', notes: '' })}><Icon n="plus" />عقد جديد</button>}>
      <Async q={q}>{(list) => (<>
        <div className="grid g4">
          <div className="kpi hero"><small>عدد العقود الفعّالة</small><b>{list.filter((i) => i.active).length}</b></div>
          <div className="kpi"><small>المحصّل</small><b><Money v={list.reduce((s, i) => s + i.paid, 0)} d={0} /></b><span className="muted">مجموع العملات الأصلية</span></div>
          <div className="kpi"><small>المتبقي</small><b><Money v={list.reduce((s, i) => s + i.remaining, 0)} d={0} /></b></div>
          <div className="kpi"><small>متأخر</small><b className="neg"><Money v={list.reduce((s, i) => s + i.overdueAmount, 0)} d={0} /></b><span>{list.reduce((s, i) => s + i.overdueCount, 0)} قسطًا</span></div>
        </div>
        <div className="card"><div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>المستثمر</th><th>النوع</th><th>العقد</th><th className="n">قيمة العقد</th><th className="n">المحصّل</th><th className="n">المتبقي</th><th>القسط القادم</th><th>الحالة</th></tr></thead>
          <tbody>{list.map((i) => <tr key={i.id} className="clickable" onClick={() => setSel(i.id)}>
            <td><b>{i.name}</b></td><td>{i.type}</td><td className="code">{i.contractNo}</td><td className="n"><Money v={i.contractValue} cur={i.currency} /></td>
            <td className="n"><Money v={i.paid} /></td><td className="n"><Money v={i.remaining} /></td><td className="num">{fmtDate(i.nextDue)}</td>
            <td>{i.overdueCount ? <span className="pill red">{i.overdueCount} متأخر</span> : i.active ? <span className="pill green">منتظم</span> : <span className="pill">منتهٍ</span>}</td></tr>)}
            {!list.length && <tr><td colSpan={8} className="empty">لا عقود بعد</td></tr>}</tbody>
        </table></div></div>
      </>)}</Async>
      {sel && <Detail id={sel} onClose={() => { setSel(null); q.reload(); }} onEdit={(i) => { setSel(null); setForm({ ...i, startDate: fmtDate(i.startDate), endDate: i.endDate ? fmtDate(i.endDate) : '', contractValue: Number(i.contractValue) }); }} />}
      {form && <Modal title={form.id ? 'تعديل العقد' : 'عقد استثمار جديد'} onClose={() => setForm(null)} footer={<><span /><button className="btn primary" onClick={save}>حفظ</button></>}>
        <div className="grid g2">
          <Field label="اسم المستثمر"><input className="inp" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="نوع الاستثمار"><input className="inp" list="inv-types" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
            <datalist id="inv-types"><option>استثمار محل</option><option>استثمار مطعم</option><option>إعلانات</option><option>رعاية</option><option>صالة رياضية</option><option>مسبح</option></datalist></Field>
          <Field label="رقم العقد"><input className="inp" value={form.contractNo || ''} onChange={(e) => setForm({ ...form, contractNo: e.target.value })} /></Field>
          <Field label="الهاتف"><input className="inp n" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="حساب الإيراد" hint="مثل 431001"><AccountPicker value={form.revenueAccount} onChange={(revenueAccount) => setForm({ ...form, revenueAccount })} /></Field>
          <Field label="حساب ذمة المستثمر (اختياري)" hint="إن وُجد يُقيَّد التحصيل عليه بدل الإيراد"><AccountPicker value={form.receivableAcct || ''} onChange={(receivableAcct) => setForm({ ...form, receivableAcct })} /></Field>
          <Field label="بداية العقد"><input type="date" className="inp" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
          <Field label="نهاية العقد"><input type="date" className="inp" value={form.endDate || ''} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
          <Field label="قيمة العقد"><input className="inp n" value={form.contractValue} onChange={(e) => setForm({ ...form, contractValue: e.target.value })} /></Field>
          <Field label="العملة"><CurrencySelect value={form.currency} onChange={(currency) => setForm({ ...form, currency })} /></Field>
        </div>
        <Field label="ملاحظات"><input className="inp" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </Modal>}
    </Page>
  );
}

function Detail({ id, onClose, onEdit }) {
  const { can, run } = useApp();
  const q = useApi(`/investors/${id}`);
  const [sch, setSch] = useState({ count: 12, firstDue: today(), everyMonths: 1 });
  const [col, setCol] = useState(null);
  const now = today();
  return (
    <Modal title="تفاصيل العقد والأقساط" onClose={onClose}>
      <Async q={q}>{(i) => (<>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div><h3 style={{ margin: 0 }}>{i.name}</h3><span className="muted">{i.type} · عقد {i.contractNo || '—'} · {fmtDate(i.startDate)} → {fmtDate(i.endDate)}</span></div>
          <div className="row"><b><Money v={i.contractValue} cur={i.currency} /></b>{can('investors.manage') && <button className="btn sm" onClick={() => onEdit(i)}>تعديل</button>}</div>
        </div>
        {can('investors.manage') && <div className="card filters" style={{ background: 'var(--bg)' }}>
          <Field label="عدد الأقساط"><input className="inp n" value={sch.count} onChange={(e) => setSch({ ...sch, count: e.target.value })} /></Field>
          <Field label="أول استحقاق"><input type="date" className="inp" value={sch.firstDue} onChange={(e) => setSch({ ...sch, firstDue: e.target.value })} /></Field>
          <Field label="كل (أشهر)"><input className="inp n" value={sch.everyMonths} onChange={(e) => setSch({ ...sch, everyMonths: e.target.value })} /></Field>
          <button className="btn dark" onClick={async () => { if (await run(() => api(`/investors/${id}/schedule`, { method: 'POST', body: { count: +sch.count, firstDue: sch.firstDue, everyMonths: +sch.everyMonths } }), 'تم توليد جدول الأقساط')) q.reload(); }}>توليد الجدول (يستبدل غير المحصّل)</button>
        </div>}
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>#</th><th>الاستحقاق</th><th className="n">المبلغ</th><th>الحالة</th><th></th></tr></thead>
          <tbody>{i.installments.map((x, k) => <tr key={x.id}><td className="muted">{k + 1}</td><td className="num">{fmtDate(x.dueDate)}</td><td className="n"><Money v={x.amount} /></td>
            <td>{x.paidAt ? <span className="pill green">محصّل {fmtDate(x.paidAt)}</span> : fmtDate(x.dueDate) < now ? <span className="pill red">متأخر</span> : <span className="pill">قادم</span>}</td>
            <td>{x.paidAt ? x.entryId && <a className="btn sm" href={`#/journal/${x.entryId}`}>القيد</a> : can('investors.manage') && <button className="btn sm primary" onClick={() => setCol({ id: x.id, date: today(), cashAccount: '' })}>تحصيل</button>}</td></tr>)}
            {!i.installments.length && <tr><td colSpan={5} className="empty">لم يُولَّد جدول أقساط</td></tr>}</tbody>
        </table></div>
        {col && <div className="card filters" style={{ background: 'var(--red-soft)' }}>
          <Field label="تاريخ التحصيل"><input type="date" className="inp" value={col.date} onChange={(e) => setCol({ ...col, date: e.target.value })} /></Field>
          <Field label="الصندوق / البنك"><AccountPicker value={col.cashAccount} onChange={(cashAccount) => setCol({ ...col, cashAccount })} placeholder="18…" /></Field>
          <button className="btn primary" disabled={!col.cashAccount} onClick={async () => { if (await run(() => api(`/investors/installments/${col.id}/collect`, { method: 'POST', body: col }), 'تم التحصيل وترحيل سند القبض')) { setCol(null); q.reload(); } }}>تأكيد وترحيل</button>
          <button className="btn" onClick={() => setCol(null)}>إلغاء</button>
        </div>}
      </>)}</Async>
    </Modal>
  );
}
