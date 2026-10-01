import React, { useState } from 'react';
import { AccountPicker, api, Async, CostCenterSelect, Field, Icon, Modal, Money, Page, useApi, useApp } from '../lib.jsx';

export default function Budgets() {
  const { can, run } = useApp();
  const [year, setYear] = useState(new Date().getFullYear());
  const q = useApi(`/budgets?year=${year}`);
  const cc = useApi('/cost-centers');
  const [edit, setEdit] = useState(null), [newCc, setNewCc] = useState(null);
  const save = async () => { if (await run(() => api('/budgets', { method: 'POST', body: { ...edit, year, amount: Number(edit.amount) } }), 'تم حفظ الموازنة')) { setEdit(null); q.reload(); } };
  return (
    <Page actions={<>
      <select className="inp" style={{ width: 120 }} value={year} onChange={(e) => setYear(+e.target.value)}>{[-1, 0, 1].map((k) => <option key={k}>{new Date().getFullYear() + k}</option>)}</select>
      <span style={{ flex: 1 }} />
      {can('budgets.manage') && <><button className="btn" onClick={() => setNewCc({ code: '', name: '', type: 'SPORT' })}><Icon n="plus" />مركز كلفة</button>
        <button className="btn primary" onClick={() => setEdit({ accountCode: '', costCenterId: null, amount: '', note: '' })}><Icon n="plus" />بند موازنة</button></>}
    </>}>
      <Async q={q}>{(rows) => (
        <div className="card">
          <h3>الموازنة مقابل الفعلي <small>{year} · تنبيه عند 70% و85% و100%</small></h3>
          {!rows.length ? <div className="empty">لا بنود موازنة لهذه السنة بعد</div> : <div className="bars">{rows.map((b) => {
            const cls = b.type === 'REVENUE' ? 'ok' : b.pct >= 100 ? 'over' : b.pct >= 85 ? 'warn' : '';
            return (
              <div key={b.id} className="bar-row" style={{ gridTemplateColumns: '260px 1fr 260px' }}>
                <div className="nm"><b>{b.costCenter}</b> · <span className="muted">{b.accountCode && <span className="code">{b.accountCode}</span>} {b.accountName}</span></div>
                <div className="track"><i className={cls} style={{ width: Math.min(b.pct, 100) + '%' }} /></div>
                <div className="v">
                  <Money v={b.actual} d={0} /> / <Money v={b.amount} d={0} /> · {b.pct}%
                  {b.alert && <span className="pill red" style={{ marginInlineStart: 6 }}>{b.alert}%</span>}
                  {can('budgets.manage') && <button className="btn sm" style={{ marginInlineStart: 6 }} onClick={() => setEdit({ ...b })}>تعديل</button>}
                </div>
              </div>);
          })}</div>}
        </div>
      )}</Async>
      <Async q={cc}>{(list) => (
        <div className="card"><h3>مراكز الكلفة <small>الألعاب والأقسام — تُربط بها أسطر القيود</small></h3>
          <div className="row">{list.map((c) => <span key={c.id} className={'pill ' + (c.type === 'SPORT' ? 'red' : c.type === 'DEPARTMENT' ? 'blue' : '')}>{c.name} <span className="code">{c.code}</span></span>)}</div>
        </div>
      )}</Async>
      {edit && <Modal size="sm" title="بند موازنة" onClose={() => setEdit(null)} footer={<>
        {edit.id ? <button className="btn" onClick={async () => { if (await run(() => api(`/budgets/${edit.id}`, { method: 'DELETE' }), 'تم الحذف')) { setEdit(null); q.reload(); } }}>حذف</button> : <span />}
        <button className="btn primary" onClick={save}>حفظ</button></>}>
        <Field label="الحساب (يمكن اختيار حساب تجميعي)" hint="فارغ = كل النفقات للمركز"><AccountPicker posting={false} value={edit.accountCode || ''} onChange={(accountCode) => setEdit({ ...edit, accountCode })} /></Field>
        <Field label="مركز الكلفة"><CostCenterSelect all value={edit.costCenterId} onChange={(costCenterId) => setEdit({ ...edit, costCenterId })} /></Field>
        <Field label="المبلغ السنوي"><input className="inp n" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></Field>
        <Field label="ملاحظة"><input className="inp" value={edit.note || ''} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></Field>
      </Modal>}
      {newCc && <Modal size="sm" title="مركز كلفة جديد" onClose={() => setNewCc(null)} footer={<><span /><button className="btn primary" onClick={async () => { if (await run(() => api('/cost-centers', { method: 'POST', body: newCc }), 'تمت الإضافة')) { setNewCc(null); cc.reload(); } }}>حفظ</button></>}>
        <Field label="الرمز"><input className="inp n" value={newCc.code} onChange={(e) => setNewCc({ ...newCc, code: e.target.value })} /></Field>
        <Field label="الاسم"><input className="inp" value={newCc.name} onChange={(e) => setNewCc({ ...newCc, name: e.target.value })} /></Field>
        <Field label="النوع"><select className="inp" value={newCc.type} onChange={(e) => setNewCc({ ...newCc, type: e.target.value })}><option value="SPORT">لعبة</option><option value="DEPARTMENT">قسم</option><option value="PROJECT">مشروع</option></select></Field>
      </Modal>}
    </Page>
  );
}
